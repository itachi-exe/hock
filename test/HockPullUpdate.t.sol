// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {HockVault} from "../src/HockVault.sol";
import {HockOracle} from "../src/HockOracle.sol";
import {HockRouter, MarketParams, IMorpho} from "../src/HockRouter.sol";
import {HockMath} from "../src/HockMath.sol";
import {IOracle} from "../src/Interfaces.sol";
import {PythFeedAdapter} from "../src/adapters/MezoFeeds.sol";
import {MockToken, MockCL, MockSwapper, MockFeed} from "./mocks/Mocks.sol";
import {MockPyth} from "./mocks/MockPyth.sol";

interface IPullRouter {
    function depositAndBorrow(uint256, uint256, uint256, uint256, bytes[] calldata) external payable returns (uint256);
}

/// Tests ordering and fee plumbing against a unit seam, never real Pyth authentication.
contract UnitMorpho is IMorpho {
    mapping(address => mapping(address => bool)) public isAuthorized;
    mapping(address => uint256) public collateral;
    uint256 public borrowed;
    uint256 public checkedPrice;

    function setAuthorization(address who, bool allowed) external { isAuthorized[msg.sender][who] = allowed; }
    function supplyCollateral(MarketParams memory mp, uint256 assets, address who, bytes memory) external {
        HockVault(mp.collateralToken).transferFrom(msg.sender, address(this), assets);
        collateral[who] += assets;
    }
    function borrow(MarketParams memory mp, uint256 assets, uint256, address who, address receiver) external returns (uint256, uint256) {
        require(isAuthorized[who][msg.sender], "unauthorized");
        checkedPrice = IOracle(mp.oracle).price();
        require(assets <= collateral[who] * checkedPrice / 1e36 * mp.lltv / 1e18, "unhealthy");
        borrowed += assets;
        MockToken(mp.loanToken).transfer(receiver, assets);
        return (assets, assets);
    }
}

contract HockPullUpdateTest is Test {
    bytes32 constant MUSD_ID = 0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de;
    uint256 constant P = 100_000 ether;
    MockToken btc; MockToken musd; MockToken mezo;
    MockFeed btcFeed; MockPyth pyth; PythFeedAdapter musdFeed;
    MockCL cl; HockVault vault; HockOracle oracle; UnitMorpho morpho; HockRouter router;
    address alice = address(0xA11CE);

    function setUp() public {
        vm.warp(1_000_000);
        btc = new MockToken(); musd = new MockToken(); mezo = new MockToken();
        btcFeed = new MockFeed(P);
        pyth = new MockPyth(); pyth.seed(MUSD_ID, 100_000_000, -8, block.timestamp);
        musdFeed = new PythFeedAdapter(address(pyth), MUSD_ID);
        cl = new MockCL(btc, musd, mezo, HockMath.sqrtWad(P), HockMath.sqrtWad(25_000 ether), HockMath.sqrtWad(400_000 ether));
        vault = new HockVault(address(btc), address(musd), address(mezo), address(cl), address(new MockSwapper(btc, musd, mezo, P)), address(0x7EA5), 200);
        oracle = new HockOracle(address(vault), address(btc), address(musd), address(cl), address(btcFeed), address(musdFeed), 1 hours);
        vault.setOracle(address(oracle));
        morpho = new UnitMorpho();
        MarketParams memory mp = MarketParams(address(musd), address(vault), address(oracle), address(1), 0.77 ether);
        router = new HockRouter(address(vault), address(btc), address(musd), address(morpho), mp);
        btc.mint(alice, 1 ether); musd.mint(alice, 100_000 ether); musd.mint(address(morpho), 100_000 ether);
        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        btc.approve(address(router), type(uint256).max); musd.approve(address(router), type(uint256).max);
        morpho.setAuthorization(address(router), true);
        vm.stopPrank();
    }

    function _update(bytes32 id, int64 price, uint256 t) internal view returns (bytes[] memory data) {
        data = new bytes[](1);
        data[0] = abi.encode(id, price, int32(-8), t, pyth.MARKER());
    }

    function test_routerRejectsMarketWithDifferentOracle() public {
        MarketParams memory mp = MarketParams(address(musd), address(vault), address(0xBAD), address(1), 0.77 ether);
        vm.expectRevert(HockRouter.BadMarket.selector);
        new HockRouter(address(vault), address(btc), address(musd), address(morpho), mp);
    }

    function test_harvestPullUpdatePrecedesStaleOracleUse() public {
        vm.prank(alice);
        router.depositAndBorrow(1 ether, 100_000 ether, 1 ether, 0);
        uint256 valueBefore = oracle.totalValue();
        skip(1 days); btcFeed.set(P);
        bytes[] memory data = _update(MUSD_ID, 100_000_000, block.timestamp);
        uint256 fee = pyth.FEE();
        vm.deal(address(this), 1 ether);
        uint256 reward = vault.harvest{value: fee}(0.14 ether, 14_000 ether, data);
        assertEq(reward, 86_400 * 0.77 ether);
        assertGt(oracle.totalValue(), valueBefore);
        assertEq(pyth.updates(), 1);
        assertEq(pyth.paid(), fee);
        assertEq(address(vault).balance, 0);
    }

    function test_futureDatedFeedRevertsBadPrice() public {
        pyth.seed(MUSD_ID, 100_000_000, -8, block.timestamp + 1);
        vm.expectRevert(HockOracle.BadPrice.selector);
        oracle.fairPrice();
    }

    function test_oracleUpdateRejectsZeroMusdAtomically() public {
        skip(1); btcFeed.set(P);
        bytes[] memory data = _update(MUSD_ID, 0, block.timestamp);
        uint256 fee = pyth.FEE();
        vm.deal(address(this), 1 ether);
        vm.expectRevert(HockOracle.BadPrice.selector);
        oracle.updatePriceFeeds{value: fee}(data);
        assertEq(pyth.updates(), 0);
        (uint256 p,) = musdFeed.latest();
        assertEq(p, 1 ether);
    }

    function test_emptyUpdateCannotStrandNativeCurrency() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert(bytes4(keccak256("UnexpectedValue()")));
        oracle.updatePriceFeeds{value: 1}(new bytes[](0));
        assertEq(address(oracle).balance, 0);
        assertEq(pyth.updates(), 0);
    }

    function test_updateOverpaymentIsRejectedAtomically() public {
        bytes[] memory data = _update(MUSD_ID, 100_000_000, block.timestamp);
        uint256 fee = pyth.FEE();
        vm.deal(address(this), 1 ether);
        vm.expectRevert(bytes4(keccak256("WrongUpdateFee()")));
        oracle.updatePriceFeeds{value: fee + 1}(data);
        assertEq(pyth.updates(), 0);
        assertEq(address(musdFeed).balance, 0);
        assertEq(address(oracle).balance, 0);
    }

    function test_routerPullUpdateRunsBeforeStaleValuationAndBorrow() public {
        skip(2 hours); btcFeed.set(P);
        vm.expectRevert(HockOracle.StalePrice.selector); oracle.fairPrice();
        bytes[] memory data = _update(MUSD_ID, 100_000_000, block.timestamp);
        uint256 fee = pyth.FEE();
        vm.prank(alice);
        uint256 shares = IPullRouter(address(router)).depositAndBorrow{value: fee}(1 ether, 100_000 ether, 1 ether, 50_000 ether, data);
        assertGt(shares, 190_000 ether);
        assertEq(morpho.collateral(alice), shares);
        assertEq(morpho.borrowed(), 50_000 ether);
        assertGt(morpho.checkedPrice(), 0);
        assertEq(pyth.updates(), 1);
        assertEq(pyth.paid(), pyth.FEE());
        (uint256 price, uint256 t) = musdFeed.latest();
        assertEq(price, 1 ether); assertEq(t, block.timestamp);
        assertEq(address(router).balance, 0); assertEq(address(vault).balance, 0);
        assertEq(address(oracle).balance, 0); assertEq(address(musdFeed).balance, 0);
    }
}
