// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFeed} from "../Interfaces.sol";

/// TESTNET ONLY. Owner-pushed price so the real contracts can run while Mezo's testnet Pyth MUSD feed is stale.
/// This is a stand-in, not a market price. HockOracle still enforces maxAge, so a keeper must keep pushing.
contract TestnetFeed is IFeed {
    string public constant LABEL = "TESTNET FEED, NOT A MARKET PRICE";
    address public immutable owner;
    uint256 public price;
    uint256 public updatedAt;

    error NotOwner();
    event PriceSet(uint256 price, uint256 at);

    constructor(uint256 initial) { owner = msg.sender; _set(initial); }

    function set(uint256 p) external { if (msg.sender != owner) revert NotOwner(); _set(p); }
    function _set(uint256 p) internal { price = p; updatedAt = block.timestamp; emit PriceSet(p, block.timestamp); }
    function latest() external view returns (uint256, uint256) { return (price, updatedAt); }
}
