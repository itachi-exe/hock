// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICL, ISwapper, IFeed} from "../../src/Interfaces.sol";
import {HockMath} from "../../src/HockMath.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address t, uint256 v) external { balanceOf[t] += v; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transfer(address t, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[t] += v; return true; }
    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        allowance[f][msg.sender] -= v; balanceOf[f] -= v; balanceOf[t] += v; return true;
    }
}

/// Stands in for the Slipstream-style pool, position manager and gauge. The Mezo precompiles are not touched.
contract MockCL is ICL {
    MockToken public btc; MockToken public musd; MockToken public mezo;
    uint256 public spot;
    uint256 public sqrtA; uint256 public sqrtB;
    uint128 public liq; uint256 public nextId = 1;
    uint256 public emissionPerSec = 0.77 ether;
    uint256 public lastClaim;

    constructor(MockToken _btc, MockToken _musd, MockToken _mezo, uint256 _spot, uint256 _a, uint256 _b) {
        btc = _btc; musd = _musd; mezo = _mezo; spot = _spot; sqrtA = _a; sqrtB = _b; lastClaim = block.timestamp;
    }
    function setSpot(uint256 s) external { spot = s; }
    function spotSqrtPrice() external view returns (uint256) { return spot; }
    function position(uint256) external view returns (uint128, uint256, uint256) { return (liq, sqrtA, sqrtB); }

    function _add(uint256 a0, uint256 a1) internal returns (uint256 u0, uint256 u1) {
        uint256 l = HockMath.liquidityFor(a0, a1, spot, sqrtA, sqrtB);
        (u0, u1) = HockMath.amounts(l, spot, sqrtA, sqrtB);
        if (u0 > a0) u0 = a0;
        if (u1 > a1) u1 = a1;
        liq += uint128(l);
        btc.transferFrom(msg.sender, address(this), u0);
        musd.transferFrom(msg.sender, address(this), u1);
    }
    function mintStaked(uint256 a0, uint256 a1) external returns (uint256 id, uint256 u0, uint256 u1) {
        id = nextId++; (u0, u1) = _add(a0, a1);
    }
    function increaseStaked(uint256, uint256 a0, uint256 a1) external returns (uint256, uint256) { return _add(a0, a1); }
    function decreaseStaked(uint256, uint128 l) external returns (uint256 a0, uint256 a1) {
        (a0, a1) = HockMath.amounts(l, spot, sqrtA, sqrtB);
        liq -= l;
        btc.transfer(msg.sender, a0); musd.transfer(msg.sender, a1);
    }
    function getReward(uint256) external returns (uint256 r) {
        r = (block.timestamp - lastClaim) * emissionPerSec; lastClaim = block.timestamp;
        mezo.mint(msg.sender, r);
    }
}

/// Fixed-rate swapper: 1 MEZO = rate0 BTC wei-scaled or rate1 MUSD.
contract MockSwapper is ISwapper {
    MockToken btc; MockToken musd; MockToken mezo;
    uint256 public mezoInMusd = 0.5 ether;   // 1 MEZO = 0.5 MUSD
    uint256 public btcPrice;                  // MUSD per BTC
    constructor(MockToken _b, MockToken _m, MockToken _z, uint256 _btcPrice) { btc = _b; musd = _m; mezo = _z; btcPrice = _btcPrice; }
    function swap(address, address out, uint256 amt, uint256) external returns (uint256 o) {
        mezo.transferFrom(msg.sender, address(this), amt);
        uint256 inMusd = amt * mezoInMusd / 1e18;
        if (out == address(musd)) o = inMusd; else o = inMusd * 1e18 / btcPrice;
        MockToken(out).mint(msg.sender, o);
    }
}

contract MockFeed is IFeed {
    uint256 public price; uint256 public t;
    constructor(uint256 p) { price = p; t = block.timestamp; }
    function set(uint256 p) external { price = p; t = block.timestamp; }
    function setAt(uint256 p, uint256 at) external { price = p; t = at; }
    function latest() external view returns (uint256, uint256) { return (price, t); }
}
