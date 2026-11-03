// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Concentrated liquidity math in 1e18 sqrt-price scale (token0 = BTC, token1 = MUSD).
library HockMath {
    uint256 internal constant WAD = 1e18;

    function sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = x;
        uint256 y = (x + 1) / 2;
        while (y < z) { z = y; y = (x / y + y) / 2; }
    }

    /// sqrt price (WAD) from a price in WAD.
    function sqrtWad(uint256 priceWad) internal pure returns (uint256) {
        return sqrt(priceWad * WAD);
    }

    function clamp(uint256 p, uint256 a, uint256 b) internal pure returns (uint256) {
        return p < a ? a : (p > b ? b : p);
    }

    function amounts(uint256 liq, uint256 sqrtP, uint256 sqrtA, uint256 sqrtB)
        internal pure returns (uint256 a0, uint256 a1)
    {
        uint256 p = clamp(sqrtP, sqrtA, sqrtB);
        a0 = liq * (sqrtB - p) / p * WAD / sqrtB;
        a1 = liq * (p - sqrtA) / WAD;
    }

    function liquidityFor(uint256 a0, uint256 a1, uint256 sqrtP, uint256 sqrtA, uint256 sqrtB)
        internal pure returns (uint256)
    {
        uint256 p = clamp(sqrtP, sqrtA, sqrtB);
        uint256 l0 = p == sqrtB ? type(uint256).max : a0 * p / WAD * sqrtB / (sqrtB - p);
        uint256 l1 = p == sqrtA ? type(uint256).max : a1 * WAD / (p - sqrtA);
        return l0 < l1 ? l0 : l1;
    }
}
