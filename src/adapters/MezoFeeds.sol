// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFeed} from "../Interfaces.sol";

interface IMezoPriceFeed {
    function fetchPrice() external view returns (uint256);
    function oracle() external view returns (address);
}

interface IChainlinkLike {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256 updatedAt, uint80);
}

/// BTC/USD from Mezo's own PriceFeed (the one MUSD troves use). fetchPrice has no timestamp, so
/// updatedAt comes from the underlying oracle the PriceFeed points at.
contract MezoPriceFeedAdapter is IFeed {
    IMezoPriceFeed public immutable priceFeed;
    constructor(address _priceFeed) { priceFeed = IMezoPriceFeed(_priceFeed); }

    function latest() external view returns (uint256 price, uint256 updatedAt) {
        price = priceFeed.fetchPrice(); // 1e18 USD per BTC
        (,,, updatedAt,) = IChainlinkLike(priceFeed.oracle()).latestRoundData();
    }
}

interface IPyth {
    function getPriceUnsafe(bytes32 id) external view returns (int64 price, uint64 conf, int32 expo, uint256 publishTime);
    function getUpdateFee(bytes[] calldata priceUpdate) external view returns (uint256);
    function updatePriceFeeds(bytes[] calldata priceUpdate) external payable;
}

/// Any Pyth feed, rescaled to 1e18. Uses getPriceUnsafe on purpose: staleness is HockOracle's job (maxAge),
/// so a stale feed reverts there instead of here with a different error.
contract PythFeedAdapter is IFeed {
    IPyth public immutable pyth;
    bytes32 public immutable id;
    constructor(address _pyth, bytes32 _id) { pyth = IPyth(_pyth); id = _id; }

    error WrongUpdateFee();

    function updatePriceFeeds(bytes[] calldata priceUpdate) external payable {
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        if (msg.value != fee) revert WrongUpdateFee();
        pyth.updatePriceFeeds{value: fee}(priceUpdate);
    }

    function latest() external view returns (uint256 price, uint256 updatedAt) {
        (int64 p,, int32 expo, uint256 t) = pyth.getPriceUnsafe(id);
        if (p <= 0) return (0, t);
        int256 e = 18 + int256(expo);
        price = e >= 0 ? uint256(uint64(p)) * 10 ** uint256(e) : uint256(uint64(p)) / 10 ** uint256(-e);
        updatedAt = t;
    }
}
