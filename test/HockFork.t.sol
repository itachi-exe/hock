// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {HockVault} from "../src/HockVault.sol";
import {HockOracle} from "../src/HockOracle.sol";
import {HockRouter, MarketParams} from "../src/HockRouter.sol";
import {MezoCLAdapter} from "../src/adapters/MezoCLAdapter.sol";
import {MezoPriceFeedAdapter, PythFeedAdapter} from "../src/adapters/MezoFeeds.sol";
import {INPM, ICLGauge} from "../src/adapters/IMezo.sol";
import {MockToken, MockSwapper} from "./mocks/Mocks.sol";

interface IMorphoFull {
    function createMarket(MarketParams memory) external;
    function supply(MarketParams memory, uint256 assets, uint256 shares, address onBehalf, bytes memory data) external returns (uint256, uint256);
    function setAuthorization(address, bool) external;
    function position(bytes32 id, address user) external view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);
}

interface IERC721Min { function ownerOf(uint256) external view returns (address); }

/// Runs against Mezo testnet state: forge test --fork-url https://rpc.test.mezo.org --match-path test/HockFork.t.sol
/// Skipped (not failed) on any other chain. Real: NPM, pool, gauge, MUSD, Morpho Blue, PriceFeed, Pyth.
/// Faked (see PROGRESS.md): BTC and MEZO are chain precompiles that the local EVM cannot run, so their code is replaced
/// by a plain ERC-20 mock; the precompile oracle under PriceFeed and the stale testnet Pyth MUSD feed are mocked.
contract HockForkTest is Test {
    address constant NPM = 0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062;
    address constant POOL = 0xFe31b6033BCda0ebEc9FB789ee21bbc400175997;
    address constant GAUGE = 0x41271070bBCA4A5D4B0007093c64ADaB7aA8C05F;
    address constant BTC = 0x7b7C000000000000000000000000000000000000;
    address constant MEZO = 0x7B7c000000000000000000000000000000000001;
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant PRICEFEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;
    address constant BTC_ORACLE = 0x7b7c000000000000000000000000000000000015;
    address constant PYTH = 0x2880aB155794e7179c9eE2e38200202908C17B43;
    bytes32 constant PYTH_MUSD = 0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de;
    address constant MORPHO = 0xCe1da828cA15cb1FDAfa84C366A53C8106655a73;
    address constant IRM = 0x0c97Fe017628636649ff374aD499529F91167441;
    uint256 constant LLTV = 0.77 ether;

    MezoCLAdapter cl; HockVault vault; HockOracle oracle; MezoPriceFeedAdapter btcFeed; PythFeedAdapter musdFeed;
    address alice = address(0xA11CE); address treasury = address(0x7EA5);

    function setUp() public {
        if (block.chainid != 31611) vm.skip(true);
        // BTC and MEZO are precompile-backed on Mezo; swap in plain ERC-20 code so the real NPM, pool and gauge can move them.
        MockToken impl = new MockToken();
        vm.etch(BTC, address(impl).code); vm.etch(MEZO, address(impl).code);
        // the BTC/USD oracle under PriceFeed is a precompile too: replay what it returned on testnet at this block
        vm.mockCall(BTC_ORACLE, abi.encodeWithSignature("latestRoundData()"), abi.encode(uint80(1), int256(77_500 ether), block.timestamp, block.timestamp, uint80(1)));
        vm.mockCall(PRICEFEED, abi.encodeWithSignature("fetchPrice()"), abi.encode(uint256(77_500 ether)));

        cl = new MezoCLAdapter(NPM, GAUGE, POOL, BTC, MUSD, 10);
        btcFeed = new MezoPriceFeedAdapter(PRICEFEED);
        musdFeed = new PythFeedAdapter(PYTH, PYTH_MUSD);
        // the testnet Pyth MUSD feed was last pushed ~99 days before this block; simulate a fresh Pyth push
        vm.mockCall(PYTH, abi.encodeWithSignature("getPriceUnsafe(bytes32)", PYTH_MUSD), abi.encode(int64(100_270_118), uint64(1046118), int32(-8), block.timestamp));

        vault = new HockVault(BTC, MUSD, MEZO, address(cl), address(new MockSwapper(MockToken(BTC), MockToken(MUSD), MockToken(MEZO), 77_500 ether)), treasury, 500);
        oracle = new HockOracle(address(vault), BTC, MUSD, address(cl), address(btcFeed), address(musdFeed), 1 hours);
        vault.setOracle(address(oracle));
        cl.setVault(address(vault));
    }

    function _fund(address who, uint256 btcAmt, uint256 musdAmt) internal {
        MockToken(BTC).mint(who, btcAmt);
        deal(MUSD, who, musdAmt);
    }

    // ---- adapter reads
    function test_spotMatchesFairPrice() public view {
        uint256 spot = cl.spotSqrtPrice();
        uint256 fair = oracle.fairSqrtPrice();
        assertApproxEqRel(spot, fair, 0.05e18, "pool spot within 5% of fair"); // sqrt scale
        console.log("spot sqrt", spot, "fair sqrt", fair);
    }

    function test_feedAdapters() public view {
        (uint256 p, uint256 t) = btcFeed.latest();
        assertEq(p, 77_500 ether); assertEq(t, block.timestamp);
        (uint256 m,) = musdFeed.latest();
        assertApproxEqRel(m, 1.0027e18, 1e14);
    }

    function test_pythAdapterReadsLiveStaleMusdFeed() public {
        vm.clearMockedCalls();
        (uint256 m, uint256 t) = musdFeed.latest();
        assertApproxEqRel(m, 1e18, 0.02e18); // price is near $1
        assertLt(t, block.timestamp - 1 days); // known testnet gap: nobody pushes this feed
        console.log("live Pyth MUSD price", m, "publishTime", t);
    }

    function test_positionConstants() public view {
        // fixed range brackets the live tick
        (uint160 x,,,,,) = abi.decode(_slot0(), (uint160, int24, uint16, uint16, uint16, bool));
        assertTrue(x > 5933190351236521063098400 && x < 17679518415848078729890725252);
    }

    function _slot0() internal view returns (bytes memory r) {
        (, r) = POOL.staticcall(abi.encodeWithSignature("slot0()"));
    }

    // ---- vault on the real NPM and gauge
    function test_depositStakesInRealGauge() public {
        _fund(alice, 1 ether, 77_500 ether);
        vm.startPrank(alice);
        MockToken(BTC).approve(address(vault), 1 ether); IERC20Min(MUSD).approve(address(vault), 77_500 ether);
        uint256 sh = vault.deposit(1 ether, 77_500 ether, 0);
        vm.stopPrank();
        uint256 id = vault.tokenId();
        assertGt(id, 0);
        assertEq(IERC721Min(NPM).ownerOf(id), GAUGE, "NFT sits in the gauge");
        assertTrue(ICLGauge(GAUGE).stakedContains(address(cl), id));
        (uint128 liq,,) = cl.position(id);
        assertGt(liq, 0);
        assertApproxEqRel(oracle.totalValue(), sh, 0.005e18); // liquidity rounding and spot vs fair
        // nothing stranded in the adapter
        assertEq(MockToken(BTC).balanceOf(address(cl)), 0);
        assertEq(IERC20Min(MUSD).balanceOf(address(cl)), 0);
        console.log("tokenId", id, "liq", liq); console.log("shares", sh);
    }

    function test_secondDepositRestakesAndWithdrawWorks() public {
        _fund(alice, 2 ether, 155_000 ether);
        vm.startPrank(alice);
        MockToken(BTC).approve(address(vault), 2 ether); IERC20Min(MUSD).approve(address(vault), 155_000 ether);
        uint256 s1 = vault.deposit(1 ether, 77_500 ether, 0);
        uint256 s2 = vault.deposit(1 ether, 77_500 ether, 0);
        uint256 id = vault.tokenId();
        assertTrue(ICLGauge(GAUGE).stakedContains(address(cl), id), "restaked");
        assertApproxEqRel(s2, s1, 0.01e18);
        (uint256 o0, uint256 o1) = vault.withdraw(s1);
        vm.stopPrank();
        assertTrue(ICLGauge(GAUGE).stakedContains(address(cl), id), "still staked after partial withdraw");
        assertApproxEqRel(o0 * 77_500 + o1, 77_500 ether * 2 - 0, 0.05e18);
        console.log("withdrew btc", o0, "musd", o1);
    }

    function test_harvestPullsGaugeRewards() public {
        _fund(alice, 1 ether, 77_500 ether);
        vm.startPrank(alice);
        MockToken(BTC).approve(address(vault), 1 ether); IERC20Min(MUSD).approve(address(vault), 77_500 ether);
        vault.deposit(1 ether, 77_500 ether, 0);
        vm.stopPrank();
        MockToken(MEZO).mint(GAUGE, 1_000_000 ether); // the gauge pays from its own balance; fund the mocked MEZO
        skip(1 days);
        uint256 tid = vault.tokenId();
        vm.prank(address(vault));
        uint256 r = cl.getReward(tid);
        console.log("reward after 1 day", r);
        assertEq(MockToken(MEZO).balanceOf(address(vault)), r);
    }

    // ---- router on the real Morpho
    function _market() internal view returns (MarketParams memory) {
        return MarketParams(MUSD, address(vault), address(oracle), IRM, LLTV);
    }

    function test_routerDepositPostBorrow() public {
        MarketParams memory mp = _market();
        IMorphoFull(MORPHO).createMarket(mp);
        address lender = address(0x1E4D);
        deal(MUSD, lender, 1_000_000 ether);
        vm.startPrank(lender); IERC20Min(MUSD).approve(MORPHO, type(uint256).max);
        IMorphoFull(MORPHO).supply(mp, 1_000_000 ether, 0, lender, ""); vm.stopPrank();

        HockRouter router = new HockRouter(address(vault), BTC, MUSD, MORPHO, mp);
        _fund(alice, 1 ether, 77_500 ether);
        uint256 before_ = IERC20Min(MUSD).balanceOf(alice);
        vm.startPrank(alice);
        IMorphoFull(MORPHO).setAuthorization(address(router), true);
        MockToken(BTC).approve(address(router), 1 ether); IERC20Min(MUSD).approve(address(router), 77_500 ether);
        uint256 sh = router.depositAndBorrow(1 ether, 77_500 ether, 0, 50_000 ether);
        vm.stopPrank();

        bytes32 id = keccak256(abi.encode(mp));
        (, uint128 borrowShares, uint128 coll) = IMorphoFull(MORPHO).position(id, alice);
        assertEq(coll, sh, "all shares are collateral");
        assertGt(borrowShares, 0);
        assertEq(vault.balanceOf(alice), 0);
        uint256 after_ = IERC20Min(MUSD).balanceOf(alice);
        assertGe(after_, before_ - 77_500 ether + 50_000 ether, "borrowed MUSD reached alice");
        assertLt(after_, before_ - 77_500 ether + 50_000 ether + 1_000 ether, "only dust refunded");
        assertEq(MockToken(BTC).balanceOf(address(router)), 0);
        assertEq(vault.balanceOf(address(router)), 0);
        console.log("collateral shares", coll);
    }

    function test_routerRevertsWithoutMorphoAuthorization() public {
        MarketParams memory mp = _market();
        HockRouter router = new HockRouter(address(vault), BTC, MUSD, MORPHO, mp);
        _fund(alice, 1 ether, 77_500 ether);
        vm.startPrank(alice);
        MockToken(BTC).approve(address(router), 1 ether); IERC20Min(MUSD).approve(address(router), 77_500 ether);
        vm.expectRevert(HockRouter.NotAuthorized.selector);
        router.depositAndBorrow(1 ether, 77_500 ether, 0, 1 ether);
        vm.stopPrank();
    }
}

interface IERC20Min { function approve(address, uint256) external returns (bool); function balanceOf(address) external view returns (uint256); }
