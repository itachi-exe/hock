// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPyth} from "../../src/adapters/MezoFeeds.sol";

/// Unit-test seam only. This is not signature verification or Pyth integration evidence.
contract MockPyth is IPyth {
    struct Price { int64 price; uint64 conf; int32 expo; uint256 publishTime; }
    mapping(bytes32 => Price) public prices;
    uint256 public updates;
    uint256 public paid;
    uint256 public constant FEE = 7;
    bytes32 public constant MARKER = bytes32("mock only");

    error InvalidUpdateData();
    error InsufficientFee();
    error UnknownFeed();

    function seed(bytes32 id, int64 price, int32 expo, uint256 t) external {
        prices[id] = Price(price, 0, expo, t);
    }

    function getPriceUnsafe(bytes32 id) external view returns (int64, uint64, int32, uint256) {
        Price memory p = prices[id];
        if (p.publishTime == 0) revert UnknownFeed();
        return (p.price, p.conf, p.expo, p.publishTime);
    }

    function getUpdateFee(bytes[] calldata data) external pure returns (uint256) {
        return FEE * data.length;
    }

    function updatePriceFeeds(bytes[] calldata data) external payable {
        if (msg.value < FEE * data.length) revert InsufficientFee();
        for (uint256 i; i < data.length; i++) {
            (bytes32 id, int64 price, int32 expo, uint256 t, bytes32 marker) =
                abi.decode(data[i], (bytes32, int64, int32, uint256, bytes32));
            if (marker != MARKER) revert InvalidUpdateData();
            if (t > prices[id].publishTime) prices[id] = Price(price, 0, expo, t);
        }
        updates++;
        paid += msg.value;
    }
}
