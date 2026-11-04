// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MezoSwapAdapter} from "../src/adapters/MezoSwapAdapter.sol";
import {MezoCLAdapter} from "../src/adapters/MezoCLAdapter.sol";
import {HockVault} from "../src/HockVault.sol";
import {HockOracle} from "../src/HockOracle.sol";
import {IERC20} from "../src/Interfaces.sol";
import {ICLGauge} from "../src/adapters/IMezo.sol";
import {MockToken, MockFeed} from "./mocks/Mocks.sol";

interface IForkCLPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function tickSpacing() external view returns (int24);
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, bool);
}
interface IForkCLFactory { function getPool(address, address, int24) external view returns (address); }
interface IForkCLRouter { function factory() external view returns (address); }

/// Real deployed router, pools, canonical MUSD, NPM and gauge. BTC/MEZO precompile code is replaced.
/// Exact original pool balances are restored for the replaced tokens; no pool, router or MUSD mock.
contract MezoSwapForkTest is Test {
    address constant BTC = 0x7b7C000000000000000000000000000000000000;
    address constant MEZO = 0x7B7c000000000000000000000000000000000001;
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant CL_ROUTER = 0x3112908bB72ce9c26a321Eeb22EC8e051F3b6E6a;
    address constant MEZO_MUSD_POOL = 0x6192597d177a72e9EaA2E74986fd3CeA9b5ac598;
    address constant BTC_MUSD_POOL = 0xFe31b6033BCda0ebEc9FB789ee21bbc400175997;
    address constant NPM = 0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062;
    address constant GAUGE = 0x41271070bBCA4A5D4B0007093c64ADaB7aA8C05F;
    uint256 constant FORK_BLOCK = 16553087;
    uint256 constant FORK_TIMESTAMP = 1793733934;
    // Read-only RPC evidence: scratch/hock-phase2b-20261104/swap-pool-balances.json.
    uint256 constant ORIGINAL_POOL_MEZO = 9169690239613107889;
    uint256 constant ORIGINAL_POOL_BTC = 467417654499254076;
    address alice = address(0xA11CE);
    address treasury = address(0x7EA5);
    MezoSwapAdapter swapper;
    uint256 aliceMusdBefore;

    function setUp() public {
        if (block.chainid != 31611) vm.skip(true);
        assertEq(block.number, FORK_BLOCK, "pin the integration fork");
        assertEq(block.timestamp, FORK_TIMESTAMP);
        MockToken impl = new MockToken();
        vm.etch(BTC, address(impl).code); vm.etch(MEZO, address(impl).code);
        MockToken(MEZO).mint(MEZO_MUSD_POOL, ORIGINAL_POOL_MEZO);
        MockToken(BTC).mint(BTC_MUSD_POOL, ORIGINAL_POOL_BTC);
        MockToken(MEZO).mint(alice, 1 ether); // Local test funding only.
        aliceMusdBefore = IERC20(MUSD).balanceOf(alice);
        swapper = new MezoSwapAdapter(CL_ROUTER, BTC, MUSD, MEZO, 50, 10);
        address factory = IForkCLRouter(CL_ROUTER).factory();
        assertEq(IForkCLFactory(factory).getPool(MEZO, MUSD, 50), MEZO_MUSD_POOL);
        assertEq(IForkCLFactory(factory).getPool(MUSD, BTC, 10), BTC_MUSD_POOL);
        assertEq(IForkCLPool(MEZO_MUSD_POOL).token0(), MUSD);
        assertEq(IForkCLPool(MEZO_MUSD_POOL).token1(), MEZO);
        assertEq(IForkCLPool(MEZO_MUSD_POOL).tickSpacing(), 50);
        assertEq(IForkCLPool(BTC_MUSD_POOL).token0(), MUSD);
        assertEq(IForkCLPool(BTC_MUSD_POOL).token1(), BTC);
        assertEq(IForkCLPool(BTC_MUSD_POOL).tickSpacing(), 10);
    }

    function _sqrt(address pool) internal view returns (uint160 sqrt) {
        (sqrt,,,,,) = IForkCLPool(pool).slot0();
    }

    function _swap(address out, uint256 minimum) internal returns (uint256) {
        vm.startPrank(alice);
        IERC20(MEZO).approve(address(swapper), 1 ether);
        uint256 received = swapper.swap(MEZO, out, 1 ether, minimum);
        vm.stopPrank();
        return received;
    }

    function _assertNoAdapterDust() internal view {
        assertEq(IERC20(MEZO).balanceOf(address(swapper)), 0);
        assertEq(IERC20(MUSD).balanceOf(address(swapper)), 0);
        assertEq(IERC20(BTC).balanceOf(address(swapper)), 0);
        assertEq(MockToken(MEZO).allowance(address(swapper), CL_ROUTER), 0);
    }

    function test_realMezoToMusdSwap() public {
        uint160 sqrtBefore = _sqrt(MEZO_MUSD_POOL);
        uint256 received = _swap(MUSD, 0.8 ether);
        assertGe(received, 0.8 ether);
        assertEq(IERC20(MUSD).balanceOf(alice) - aliceMusdBefore, received);
        assertEq(IERC20(MEZO).balanceOf(alice), 0);
        assertGt(_sqrt(MEZO_MUSD_POOL), sqrtBefore);
        _assertNoAdapterDust();
        console.log("real MEZO->MUSD output wei", received);
    }

    function test_realMezoToBtcSwap() public {
        uint160 mezoBefore = _sqrt(MEZO_MUSD_POOL); uint160 btcBefore = _sqrt(BTC_MUSD_POOL);
        uint256 received = _swap(BTC, 0.00001 ether);
        assertGe(received, 0.00001 ether);
        assertEq(IERC20(BTC).balanceOf(alice), received);
        assertEq(IERC20(MUSD).balanceOf(alice), aliceMusdBefore);
        assertEq(IERC20(MEZO).balanceOf(alice), 0);
        assertGt(_sqrt(MEZO_MUSD_POOL), mezoBefore);
        assertLt(_sqrt(BTC_MUSD_POOL), btcBefore);
        _assertNoAdapterDust();
        console.log("real MEZO->MUSD->BTC output wei", received);
    }

    function testFuzz_realRouterEnforcesOutputMinimumAtomically(bool toBtc) public {
        uint160 mezoBefore = _sqrt(MEZO_MUSD_POOL); uint160 btcBefore = _sqrt(BTC_MUSD_POOL);
        uint256 musdBefore = IERC20(MUSD).balanceOf(MEZO_MUSD_POOL);
        vm.startPrank(alice);
        IERC20(MEZO).approve(address(swapper), 1 ether);
        vm.expectRevert(bytes("Too little received"));
        swapper.swap(MEZO, toBtc ? BTC : MUSD, 1 ether, 1_000_000 ether);
        vm.stopPrank();
        assertEq(IERC20(MEZO).balanceOf(alice), 1 ether);
        assertEq(IERC20(MUSD).balanceOf(alice), aliceMusdBefore); assertEq(IERC20(BTC).balanceOf(alice), 0);
        assertEq(IERC20(MEZO).balanceOf(MEZO_MUSD_POOL), ORIGINAL_POOL_MEZO);
        assertEq(IERC20(BTC).balanceOf(BTC_MUSD_POOL), ORIGINAL_POOL_BTC);
        assertEq(IERC20(MUSD).balanceOf(MEZO_MUSD_POOL), musdBefore);
        assertEq(_sqrt(MEZO_MUSD_POOL), mezoBefore); assertEq(_sqrt(BTC_MUSD_POOL), btcBefore);
        _assertNoAdapterDust();
    }

    function test_harvestCompoundsThroughRealRouterAndGauge() public {
        MezoCLAdapter cl = new MezoCLAdapter(NPM, GAUGE, BTC_MUSD_POOL, BTC, MUSD, 10);
        HockVault vault = new HockVault(BTC, MUSD, MEZO, address(cl), address(swapper), treasury, 500);
        // Pricing seams only for this harvest test. This is NOT authenticated Pyth evidence.
        MockFeed btcFeed = new MockFeed(77_500 ether); MockFeed musdFeed = new MockFeed(1.00270118 ether);
        HockOracle oracle = new HockOracle(address(vault), BTC, MUSD, address(cl), address(btcFeed), address(musdFeed), 1 hours);
        vault.setOracle(address(oracle)); cl.setVault(address(vault));
        MockToken(BTC).mint(alice, 1 ether); deal(MUSD, alice, 77_500 ether);
        MockToken(MEZO).mint(GAUGE, 1_000_000 ether); // Precompile gauge funding is local only.
        vm.startPrank(alice);
        IERC20(BTC).approve(address(vault), 1 ether); IERC20(MUSD).approve(address(vault), 77_500 ether);
        vault.deposit(1 ether, 77_500 ether, 1 ether);
        vm.stopPrank();
        (uint128 liquidityBefore,,) = cl.position(vault.tokenId());
        skip(1);
        uint256 reward = vault.harvest(0.00000045 ether, 0.036 ether, new bytes[](0));
        assertGt(reward, 0); assertLt(reward, 1 ether);
        assertEq(IERC20(MEZO).balanceOf(treasury), reward / 10);
        (uint128 liquidityAfter,,) = cl.position(vault.tokenId());
        assertGt(liquidityAfter, liquidityBefore);
        assertTrue(ICLGauge(GAUGE).stakedContains(address(cl), vault.tokenId()));
        assertEq(IERC20(MEZO).balanceOf(address(vault)), 0);
        _assertNoAdapterDust();
        console.log("real harvest MEZO reward wei", reward);
        console.log("real harvest liquidity increase", liquidityAfter - liquidityBefore);
    }
}
