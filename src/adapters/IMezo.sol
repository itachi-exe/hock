// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal interfaces for the live Mezo contracts. Selectors and layouts were checked on testnet by RPC.

interface INPM {
    struct MintParams {
        address token0; address token1; int24 tickSpacing; int24 tickLower; int24 tickUpper;
        uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min;
        address recipient; uint256 deadline; uint160 sqrtPriceX96;
    }
    struct IncreaseParams { uint256 tokenId; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; uint256 deadline; }
    struct DecreaseParams { uint256 tokenId; uint128 liquidity; uint256 amount0Min; uint256 amount1Min; uint256 deadline; }
    struct CollectParams { uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max; }

    function mint(MintParams calldata) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function increaseLiquidity(IncreaseParams calldata) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);
    function decreaseLiquidity(DecreaseParams calldata) external returns (uint256 amount0, uint256 amount1);
    function collect(CollectParams calldata) external returns (uint256 amount0, uint256 amount1);
    // The live function returns 12 values; the ABI decoder ignores the trailing ones, so only liquidity (8th) is declared.
    function positions(uint256 tokenId) external view returns (
        uint96 nonce, address operator, address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity);
    function approve(address to, uint256 tokenId) external;
}

/// The live CLGauge only has deposit, withdraw and getReward. There is no increaseStakedLiquidity,
/// so liquidity changes need unstake, change, restake (the adapter hides this).
interface ICLGauge {
    function deposit(uint256 tokenId) external;
    function withdraw(uint256 tokenId) external;
    function getReward(uint256 tokenId) external;
    function stakedContains(address depositor, uint256 tokenId) external view returns (bool);
    function rewardToken() external view returns (address);
}

interface ICLPool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, bool);
}

/// Verified CL router path format: token, int24 tickSpacing, token. Not a Uniswap fee tier.
interface ICLSwapRouter {
    struct ExactInputParams { bytes path; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256);
}
