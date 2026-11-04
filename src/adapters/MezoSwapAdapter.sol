// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, ISwapper} from "../Interfaces.sol";
import {ICLSwapRouter} from "./IMezo.sol";

/// Fixed harvest routes: MEZO -> MUSD, and MEZO -> MUSD -> BTC.
contract MezoSwapAdapter is ISwapper {
    ICLSwapRouter public immutable router;
    IERC20 public immutable btc;
    IERC20 public immutable musd;
    IERC20 public immutable mezo;
    int24 public immutable mezoMusdTickSpacing;
    int24 public immutable btcMusdTickSpacing;

    constructor(address _router, address _btc, address _musd, address _mezo, int24 _mezoMusdTickSpacing, int24 _btcMusdTickSpacing) {
        router = ICLSwapRouter(_router); btc = IERC20(_btc); musd = IERC20(_musd); mezo = IERC20(_mezo);
        mezoMusdTickSpacing = _mezoMusdTickSpacing; btcMusdTickSpacing = _btcMusdTickSpacing;
    }

    error Slippage();
    error BadRoute();
    error IncompleteSwap();
    error TokenTransferFailed();

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external returns (uint256 received) {
        if (tokenIn != address(mezo) || (tokenOut != address(btc) && tokenOut != address(musd))) revert BadRoute();
        if (amountIn == 0 || minOut == 0) revert Slippage();
        bytes memory path = abi.encodePacked(address(mezo), mezoMusdTickSpacing, address(musd));
        if (tokenOut == address(btc)) path = bytes.concat(path, abi.encodePacked(btcMusdTickSpacing, address(btc)));
        uint256 before_ = IERC20(tokenOut).balanceOf(address(this));
        uint256 inputBefore = mezo.balanceOf(address(this));
        if (!mezo.transferFrom(msg.sender, address(this), amountIn)) revert TokenTransferFailed();
        if (!mezo.approve(address(router), amountIn)) revert TokenTransferFailed();
        router.exactInput(ICLSwapRouter.ExactInputParams(path, address(this), block.timestamp, amountIn, minOut));
        if (mezo.balanceOf(address(this)) != inputBefore) revert IncompleteSwap();
        if (!mezo.approve(address(router), 0)) revert TokenTransferFailed();
        received = IERC20(tokenOut).balanceOf(address(this)) - before_;
        if (received < minOut) revert Slippage();
        if (!IERC20(tokenOut).transfer(msg.sender, received)) revert TokenTransferFailed();
    }
}
