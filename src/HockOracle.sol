// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, IFeed, IPullFeed, ICL, IOracle} from "./Interfaces.sol";
import {HockMath} from "./HockMath.sol";

interface IHockVaultView {
    function idsLength() external view returns (uint256);
    function ids(uint256) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

/// Morpho oracle for HOCK shares. Values the position's token amounts at the FAIR price
/// (BTC/USD from PriceFeed divided by MUSD/USD from Pyth), never at pool spot.
/// A flash swap that moves spot changes nothing here. MUSD is priced for real: no hard-coded $1.
contract HockOracle is IOracle {
    IERC20 public immutable btc;
    IERC20 public immutable musd;
    ICL public immutable cl;
    IFeed public immutable btcUsd;
    IFeed public immutable musdUsd;
    address public immutable vault;
    uint256 public immutable maxAge;

    error StalePrice();
    error BadPrice();

    constructor(address _vault, address _btc, address _musd, address _cl, address _btcUsd, address _musdUsd, uint256 _maxAge) {
        vault = _vault; btc = IERC20(_btc); musd = IERC20(_musd); cl = ICL(_cl);
        btcUsd = IFeed(_btcUsd); musdUsd = IFeed(_musdUsd); maxAge = _maxAge;
    }

    error UnexpectedValue();

    function updatePriceFeeds(bytes[] calldata priceUpdate) external payable {
        if (priceUpdate.length != 0) IPullFeed(address(musdUsd)).updatePriceFeeds{value: msg.value}(priceUpdate);
        else if (msg.value != 0) revert UnexpectedValue();
        fairPrice();
    }

    function _read(IFeed f) internal view returns (uint256 p) {
        uint256 t;
        (p, t) = f.latest();
        if (p == 0 || t > block.timestamp) revert BadPrice();
        if (block.timestamp - t > maxAge) revert StalePrice();
    }

    /// MUSD per 1 BTC at the fair price, WAD.
    function fairPrice() public view returns (uint256) {
        return _read(btcUsd) * 1e18 / _read(musdUsd);
    }

    function fairSqrtPrice() public view returns (uint256) {
        return HockMath.sqrtWad(fairPrice());
    }

    /// Total vault value in MUSD wei: staked position at the fair price plus idle balances.
    function totalValue() public view returns (uint256) {
        uint256 fair = fairPrice();
        uint256 a0 = btc.balanceOf(vault);
        uint256 a1 = musd.balanceOf(vault);
        uint256 n = IHockVaultView(vault).idsLength();
        for (uint256 i; i < n; i++) {
            (uint128 liq, uint256 sA, uint256 sB) = cl.position(IHockVaultView(vault).ids(i));
            (uint256 p0, uint256 p1) = HockMath.amounts(liq, HockMath.sqrtWad(fair), sA, sB);
            a0 += p0; a1 += p1;
        }
        return valueOf(a0, a1, fair);
    }

    function valueOf(uint256 a0, uint256 a1) external view returns (uint256) {
        return valueOf(a0, a1, fairPrice());
    }

    function valueOf(uint256 a0, uint256 a1, uint256 fair) public pure returns (uint256) {
        return a0 * fair / 1e18 + a1;
    }

    /// Morpho scale: loan wei per collateral wei, times 1e36.
    function price() external view returns (uint256) {
        uint256 s = IHockVaultView(vault).totalSupply();
        if (s == 0) return 1e36;
        return totalValue() * 1e36 / s;
    }
}
