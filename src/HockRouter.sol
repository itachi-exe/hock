// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./Interfaces.sol";

interface IHockVaultLike is IERC20 {
    function oracle() external view returns (address);
    function deposit(uint256 a0, uint256 a1, uint256 minShares) external returns (uint256);
    function depositWithRefund(uint256 a0, uint256 a1, uint256 minShares, address refundTo) external returns (uint256);
    function deposit(uint256 a0, uint256 a1, uint256 minShares, bytes[] calldata priceUpdate) external payable returns (uint256);
}

struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }

interface IMorpho {
    function supplyCollateral(MarketParams memory mp, uint256 assets, address onBehalf, bytes memory data) external;
    function borrow(MarketParams memory mp, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256, uint256);
    function isAuthorized(address authorizer, address authorized) external view returns (bool);
}

/// One transaction: pull BTC + MUSD, mint HOCK shares, post them as Morpho collateral for the caller, borrow MUSD.
/// The caller must call morpho.setAuthorization(router, true) once so the router may borrow on their behalf.
/// The router never keeps funds: leftovers go back to the caller and borrowed MUSD goes straight to the caller.
contract HockRouter {
    IHockVaultLike public immutable vault;
    IERC20 public immutable btc;
    IERC20 public immutable musd;
    IMorpho public immutable morpho;
    MarketParams public mp;

    error BadMarket();
    error NotAuthorized();

    constructor(address _vault, address _btc, address _musd, address _morpho, MarketParams memory _mp) {
        if (_mp.collateralToken != _vault || _mp.loanToken != _musd || _mp.oracle != IHockVaultLike(_vault).oracle()) revert BadMarket();
        vault = IHockVaultLike(_vault); btc = IERC20(_btc); musd = IERC20(_musd); morpho = IMorpho(_morpho); mp = _mp;
    }

    function depositAndBorrow(uint256 a0, uint256 a1, uint256 minShares, uint256 borrowAmount) external returns (uint256 shares) {
        return _depositAndBorrow(a0, a1, minShares, borrowAmount, new bytes[](0));
    }

    function depositAndBorrow(uint256 a0, uint256 a1, uint256 minShares, uint256 borrowAmount, bytes[] calldata priceUpdate) external payable returns (uint256 shares) {
        return _depositAndBorrow(a0, a1, minShares, borrowAmount, priceUpdate);
    }

    function _depositAndBorrow(uint256 a0, uint256 a1, uint256 minShares, uint256 borrowAmount, bytes[] memory priceUpdate) internal returns (uint256 shares) {
        if (borrowAmount > 0 && !morpho.isAuthorized(msg.sender, address(this))) revert NotAuthorized();
        btc.transferFrom(msg.sender, address(this), a0);
        musd.transferFrom(msg.sender, address(this), a1);
        btc.approve(address(vault), a0); musd.approve(address(vault), a1);
        // The vault refunds unused tokens straight to the user (reading BTC balances inside a contract reverts on Mezo).
        if (priceUpdate.length == 0 && msg.value == 0) shares = vault.depositWithRefund(a0, a1, minShares, msg.sender);
        else { shares = vault.deposit{value: msg.value}(a0, a1, minShares, priceUpdate); }
        vault.approve(address(morpho), shares);
        morpho.supplyCollateral(mp, shares, msg.sender, "");
        if (borrowAmount > 0) morpho.borrow(mp, borrowAmount, 0, msg.sender, msg.sender);
    }
}
