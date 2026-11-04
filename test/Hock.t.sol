// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {HockVault} from "../src/HockVault.sol";
import {HockOracle} from "../src/HockOracle.sol";
import {HockMath} from "../src/HockMath.sol";
import {MockToken, MockCL, MockSwapper, MockFeed} from "./mocks/Mocks.sol";

interface IBoundedHarvest {
    function harvest(uint256 minBtc, uint256 minMusd, bytes[] calldata priceUpdate) external payable returns (uint256);
}

/// Delivers one wei below the bound on one leg while claiming the full minimum.
contract LyingSwapper {
    MockToken public immutable btc;
    MockToken public immutable mezo;
    bool public immutable shortBtc;
    constructor(MockToken _btc, MockToken _mezo, bool _shortBtc) { btc = _btc; mezo = _mezo; shortBtc = _shortBtc; }
    function swap(address, address out, uint256 amount, uint256 minOut) external returns (uint256) {
        mezo.transferFrom(msg.sender, address(this), amount);
        bool short = (out == address(btc)) == shortBtc;
        MockToken(out).mint(msg.sender, short ? minOut - 1 : minOut);
        return minOut;
    }
}

contract HockTest is Test {
    MockToken btc; MockToken musd; MockToken mezo;
    MockCL cl; MockSwapper sw; MockFeed btcFeed; MockFeed musdFeed;
    HockVault vault; HockOracle oracle;
    address alice = address(0xA11CE); address attacker = address(0xBAD); address treasury = address(0x7EA5);
    uint256 constant P = 100_000 ether; // MUSD per BTC

    uint256 constant LLTV = 0.77 ether; // the only value enabled on Mezo testnet Morpho

    function setUp() public {
        vm.warp(1_000_000);
        btc = new MockToken(); musd = new MockToken(); mezo = new MockToken();
        btcFeed = new MockFeed(P); musdFeed = new MockFeed(1 ether);
        // wide range: 0.25x to 4x of 100k
        uint256 sA = HockMath.sqrtWad(25_000 ether); uint256 sB = HockMath.sqrtWad(400_000 ether);
        cl = new MockCL(btc, musd, mezo, HockMath.sqrtWad(P), sA, sB);
        sw = new MockSwapper(btc, musd, mezo, P);
        vault = new HockVault(address(btc), address(musd), address(mezo), address(cl), address(sw), treasury, 200);
        oracle = new HockOracle(address(vault), address(btc), address(musd), address(cl), address(btcFeed), address(musdFeed), 1 hours);
        vault.setOracle(address(oracle));
    }

    function _deposit(address who, uint256 a0, uint256 a1) internal returns (uint256 sh) {
        btc.mint(who, a0); musd.mint(who, a1);
        vm.startPrank(who);
        btc.approve(address(vault), a0); musd.approve(address(vault), a1);
        sh = vault.deposit(a0, a1, 0);
        vm.stopPrank();
    }

    // ---- deposit
    function test_deposit_mintsSharesAtFairValue() public {
        uint256 sh = _deposit(alice, 1 ether, 100_000 ether);
        assertEq(vault.balanceOf(alice), sh);
        assertGt(sh, 190_000 ether);              // about 200k MUSD of value
        assertLt(sh, 200_001 ether);
        assertApproxEqRel(oracle.totalValue(), sh, 1e12);
    }

    function test_secondDepositorGetsProportionalShares() public {
        uint256 s1 = _deposit(alice, 1 ether, 100_000 ether);
        uint256 s2 = _deposit(address(0xB0B), 2 ether, 200_000 ether);
        assertApproxEqRel(s2, s1 * 2, 1e12);
    }

    function test_withdrawReturnsAssets() public {
        uint256 sh = _deposit(alice, 1 ether, 100_000 ether);
        vm.prank(alice);
        (uint256 o0, uint256 o1) = vault.withdraw(sh);
        assertApproxEqRel(o0 * P / 1e18 + o1, 200_000 ether, 1e12);
        assertEq(vault.totalSupply(), 0);
    }

    // ---- harvest and compound
    function test_driftIsCheckedBeforeCallingSwapper() public {
        _deposit(alice, 1 ether, 100_000 ether);
        skip(1 hours);
        cl.setSpot(HockMath.sqrtWad(P) * 9 / 10);
        vm.mockCallRevert(address(sw), abi.encodeWithSelector(sw.swap.selector), abi.encodeWithSignature("Error(string)", "swap ran before drift check"));
        vm.expectRevert(HockVault.Drift.selector);
        vault.harvest(0.005 ether, 600 ether, new bytes[](0));
    }

    function testFuzz_shortLegRevertsAtomicallyDespiteClaimAndIdleFunds(bool shortBtc) public {
        LyingSwapper liar = new LyingSwapper(btc, mezo, shortBtc);
        vault = new HockVault(address(btc), address(musd), address(mezo), address(cl), address(liar), treasury, 200);
        oracle = new HockOracle(address(vault), address(btc), address(musd), address(cl), address(btcFeed), address(musdFeed), 1 hours);
        vault.setOracle(address(oracle));
        uint256 shares = _deposit(alice, 1 ether, 100_000 ether);
        btc.mint(address(vault), 1 ether); musd.mint(address(vault), 1_000 ether);
        uint128 liquidityBefore = cl.liq();
        uint256 lastClaimBefore = cl.lastClaim();
        skip(1 hours);
        vm.expectRevert(HockVault.Slippage.selector);
        vault.harvest(0.005 ether, 600 ether, new bytes[](0));
        assertEq(cl.lastClaim(), lastClaimBefore);
        assertEq(cl.liq(), liquidityBefore);
        assertEq(mezo.balanceOf(treasury), 0);
        assertEq(mezo.balanceOf(address(liar)), 0);
        assertEq(btc.balanceOf(address(vault)), 1 ether);
        assertEq(musd.balanceOf(address(vault)), 1_000 ether);
        assertEq(vault.totalSupply(), shares);
    }

    function testFuzz_keeperCannotDisableEitherMinimum(bool zeroBtc) public {
        _deposit(alice, 1 ether, 100_000 ether);
        skip(1 hours);
        vm.expectRevert(HockVault.Slippage.selector);
        vault.harvest(zeroBtc ? 0 : 0.005 ether, zeroBtc ? 600 ether : 0, new bytes[](0));
    }

    function test_onlyKeeperMayChooseHarvestMinima() public {
        _deposit(alice, 1 ether, 100_000 ether);
        skip(1 hours);
        vm.prank(attacker);
        (bool ok,) = address(vault).call(abi.encodeWithSignature("harvest()"));
        assertFalse(ok, "unbounded harvest() remained callable");
        vm.prank(attacker);
        vm.expectRevert(bytes4(keccak256("NotKeeper()")));
        IBoundedHarvest(address(vault)).harvest(1, 1, new bytes[](0));
        uint256 reward = IBoundedHarvest(address(vault)).harvest(0.005 ether, 600 ether, new bytes[](0));
        assertGt(reward, 0);
        assertEq(mezo.balanceOf(treasury), reward / 10);
    }

    function test_harvest_compoundsAndPaysFee() public {
        uint256 sh = _deposit(alice, 1 ether, 100_000 ether);
        uint256 v0 = oracle.totalValue();
        skip(1 days);
        btcFeed.set(P); musdFeed.set(1 ether);                    // keepers refresh feeds
        uint256 reward = vault.harvest(0.14 ether, 14_000 ether, new bytes[](0));
        assertEq(reward, 86_400 * 0.77 ether);
        assertEq(mezo.balanceOf(treasury), reward / 10);          // 10% fee
        assertGt(oracle.totalValue(), v0);                        // value grew, shares did not
        assertEq(vault.balanceOf(alice), sh);
        // compounded value is about 90% of reward at 0.5 MUSD per MEZO
        assertApproxEqRel(oracle.totalValue() - v0, reward * 9 / 10 / 2, 1e15);
    }

    // ---- oracle ignores spot
    function test_oracle_price_matches_fair_value_per_share() public {
        uint256 sh = _deposit(alice, 1 ether, 100_000 ether);
        assertApproxEqRel(oracle.price(), oracle.totalValue() * 1e36 / sh, 1e6);
        assertApproxEqRel(oracle.price(), 1e36, 1e15);            // 1 share is about 1 MUSD at start
    }

    function test_spotManipulation_cannotInflateCollateral() public {
        uint256 sh = _deposit(alice, 1 ether, 100_000 ether);
        uint256 before_ = oracle.price();
        // flash swap pushes spot to 1.5x price (sqrt scale 1.5 => price 2.25x)
        cl.setSpot(HockMath.sqrtWad(P) * 3 / 2);
        assertEq(oracle.price(), before_, "oracle moved with spot");
        // and the opposite direction
        cl.setSpot(HockMath.sqrtWad(P) / 2);
        assertEq(oracle.price(), before_, "oracle moved with spot (down)");
        sh;
    }

    function test_manipulatedSpot_blocksDeposit() public {
        _deposit(alice, 1 ether, 100_000 ether);
        cl.setSpot(HockMath.sqrtWad(P) * 11 / 10);                // 10% sqrt drift > 2% bound
        btc.mint(attacker, 1 ether); musd.mint(attacker, 100_000 ether);
        vm.startPrank(attacker);
        btc.approve(address(vault), type(uint256).max); musd.approve(address(vault), type(uint256).max);
        vm.expectRevert(HockVault.Drift.selector);
        vault.deposit(1 ether, 100_000 ether, 0);
        vm.stopPrank();
    }

    function test_manipulatedSpot_blocksHarvest() public {
        _deposit(alice, 1 ether, 100_000 ether);
        skip(1 hours);
        cl.setSpot(HockMath.sqrtWad(P) * 9 / 10);
        vm.expectRevert(HockVault.Drift.selector);
        vault.harvest(0.005 ether, 600 ether, new bytes[](0));
    }

    // ---- oracle feed safety
    function test_staleFeed_reverts() public {
        _deposit(alice, 1 ether, 100_000 ether);
        skip(2 hours);
        vm.expectRevert(HockOracle.StalePrice.selector);
        oracle.price();
    }

    function test_musdDepeg_isPriced_notAssumedOneDollar() public {
        _deposit(alice, 1 ether, 100_000 ether);
        uint256 p0 = oracle.price();
        musdFeed.set(0.9 ether);                                  // MUSD at 0.90 USD
        // fair MUSD/BTC rises to 111,111, so the BTC side is worth more MUSD
        assertEq(oracle.fairPrice(), P * 1e18 / 0.9 ether);
        assertTrue(oracle.price() != p0);
    }

    function test_zeroPrice_reverts() public {
        btcFeed.set(0);
        vm.expectRevert(HockOracle.BadPrice.selector);
        oracle.fairPrice();
    }

    // ---- price shock to liquidation (Morpho health check: collateral * price / 1e36 * LLTV >= debt)
    function _healthy(uint256 collateral, uint256 debt) internal view returns (bool) {
        uint256 maxBorrow = collateral * oracle.price() / 1e36 * LLTV / 1e18;
        return debt <= maxBorrow;
    }

    function test_priceShock_makesPositionLiquidatable() public {
        uint256 sh = _deposit(alice, 1 ether, 100_000 ether);     // about 200k MUSD of collateral
        uint256 debt = sh * 70 / 100;                              // borrow 70% of collateral value
        assertTrue(_healthy(sh, debt), "healthy at open");
        // BTC drops 50%; pool spot follows, LP converts to BTC. Fair feed updates too.
        btcFeed.set(P / 2);
        cl.setSpot(HockMath.sqrtWad(P / 2));
        assertFalse(_healthy(sh, debt), "liquidatable after 50% crash");
    }

    function test_priceShock_smallDipStaysHealthy() public {
        uint256 sh = _deposit(alice, 1 ether, 100_000 ether);
        uint256 debt = sh * 50 / 100;
        btcFeed.set(P * 90 / 100);
        cl.setSpot(HockMath.sqrtWad(P * 90 / 100));
        assertTrue(_healthy(sh, debt), "50% LTV survives a 10% dip");
    }

    function test_spotCrashWithoutFeedMove_doesNotLiquidate() public {
        uint256 sh = _deposit(alice, 1 ether, 100_000 ether);
        uint256 debt = sh * 70 / 100;
        cl.setSpot(HockMath.sqrtWad(P / 4));                       // attacker dumps spot only
        assertTrue(_healthy(sh, debt), "spot-only crash must not liquidate");
    }

    function test_lltvConstantIsTestnetValue() public pure {
        assertEq(LLTV, 0.77 ether);
    }
}
