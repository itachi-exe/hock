// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HockVault} from "../src/HockVault.sol";
import {HockOracle} from "../src/HockOracle.sol";
import {HockRouter, MarketParams} from "../src/HockRouter.sol";
import {MezoCLAdapter} from "../src/adapters/MezoCLAdapter.sol";
import {MezoPriceFeedAdapter} from "../src/adapters/MezoFeeds.sol";
import {MezoSwapAdapter} from "../src/adapters/MezoSwapAdapter.sol";
import {TestnetFeed} from "../src/testnet/TestnetFeed.sol";

interface IMorphoCreate { function createMarket(MarketParams memory) external; }

/// Mezo testnet (31611). forge script script/DeployTestnet.s.sol --rpc-url https://rpc.test.mezo.org --broadcast
contract DeployTestnet is Script {
    address constant NPM = 0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062;
    address constant POOL = 0xFe31b6033BCda0ebEc9FB789ee21bbc400175997;
    address constant GAUGE = 0x41271070bBCA4A5D4B0007093c64ADaB7aA8C05F;
    address constant BTC = 0x7b7C000000000000000000000000000000000000;
    address constant MEZO = 0x7B7c000000000000000000000000000000000001;
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant PRICEFEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;
    address constant SWAP_ROUTER = 0x3112908bB72ce9c26a321Eeb22EC8e051F3b6E6a;
    address constant MORPHO = 0xCe1da828cA15cb1FDAfa84C366A53C8106655a73;
    address constant IRM = 0x0c97Fe017628636649ff374aD499529F91167441;
    uint256 constant LLTV = 0.77 ether;

    function run() external {
        require(block.chainid == 31611, "mezo testnet only");
        vm.startBroadcast();
        address me = msg.sender;
        TestnetFeed musdFeed = new TestnetFeed(1 ether);
        MezoPriceFeedAdapter btcFeed = new MezoPriceFeedAdapter(PRICEFEED);
        MezoCLAdapter cl = new MezoCLAdapter(NPM, GAUGE, POOL, BTC, MUSD, 10);
        MezoSwapAdapter swapper = new MezoSwapAdapter(SWAP_ROUTER, BTC, MUSD, MEZO, 50, 10);
        HockVault vault = new HockVault(BTC, MUSD, MEZO, address(cl), address(swapper), me, 500);
        HockOracle oracle = new HockOracle(address(vault), BTC, MUSD, address(cl), address(btcFeed), address(musdFeed), 24 hours);
        vault.setOracle(address(oracle));
        cl.setVault(address(vault));
        MarketParams memory mp = MarketParams(MUSD, address(vault), address(oracle), IRM, LLTV);
        IMorphoCreate(MORPHO).createMarket(mp);
        HockRouter router = new HockRouter(address(vault), BTC, MUSD, MORPHO, mp);
        vm.stopBroadcast();
        console.log("MUSD_TEST_FEED", address(musdFeed));
        console.log("BTC_FEED", address(btcFeed));
        console.log("CL_ADAPTER", address(cl));
        console.log("SWAPPER", address(swapper));
        console.log("VAULT", address(vault));
        console.log("ORACLE", address(oracle));
        console.log("ROUTER", address(router));
    }
}
