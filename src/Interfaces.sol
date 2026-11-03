// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// Price feed adapter. Price is USD per 1 token, 1e18 scale. Real adapters wrap Mezo PriceFeed (BTC) and Pyth (MUSD).
interface IFeed {
    function latest() external view returns (uint256 price, uint256 updatedAt);
}

/// Concentrated liquidity position manager + gauge, reduced to what Hock needs.
/// token0 = BTC, token1 = MUSD. Sqrt prices are 1e18 scale (sqrt of MUSD per BTC).
/// Staked positions stay staked while liquidity changes (the real adapter hides unstake and restake).
interface ICL {
    function spotSqrtPrice() external view returns (uint256);
    function mintStaked(uint256 a0, uint256 a1) external returns (uint256 tokenId, uint256 used0, uint256 used1);
    function increaseStaked(uint256 tokenId, uint256 a0, uint256 a1) external returns (uint256 used0, uint256 used1);
    function decreaseStaked(uint256 tokenId, uint128 liq) external returns (uint256 a0, uint256 a1);
    function position(uint256 tokenId) external view returns (uint128 liq, uint256 sqrtA, uint256 sqrtB);
    function getReward(uint256 tokenId) external returns (uint256);
}

interface ISwapper {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external returns (uint256);
}

/// Morpho Blue oracle interface.
interface IOracle {
    function price() external view returns (uint256);
}
