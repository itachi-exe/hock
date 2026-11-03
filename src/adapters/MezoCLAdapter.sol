// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, ICL} from "../Interfaces.sol";
import {INPM, ICLGauge, ICLPool} from "./IMezo.sol";

/// ICL over the live Mezo CL NonfungiblePositionManager and CLGauge. The adapter owns the NFT and keeps it
/// staked; only the vault may move funds. Real pool order is token0 = MUSD, token1 = BTC, so every amount
/// and price is flipped to the vault's convention (token0 = BTC, sqrt of MUSD per BTC, 1e18).
/// Liquidity needs no conversion: L is the same number in both orderings.
contract MezoCLAdapter is ICL {
    // Fixed wide range on tickSpacing 10: ticks -190000..-30000 of BTC/MUSD = about 20 to 180M MUSD per BTC.
    int24 public constant TICK_LOWER = -190000;
    int24 public constant TICK_UPPER = -30000;
    // sqrt(MUSD per BTC) in 1e18 at those ticks (shortcut: constants from Uniswap TickMath, tied to this range).
    uint256 internal constant SQRT_A = 4481352978667309329;      // tick -30000
    uint256 internal constant SQRT_B = 13353382889148769411635;  // tick -190000

    INPM public immutable npm;
    ICLGauge public immutable gauge;
    ICLPool public immutable pool;
    IERC20 public immutable btc;   // pool token1
    IERC20 public immutable musd;  // pool token0
    IERC20 public immutable reward;
    int24 public immutable tickSpacing;
    address public immutable owner;
    address public vault;

    error NotVault();
    error VaultSet();

    constructor(address _npm, address _gauge, address _pool, address _btc, address _musd, int24 _tickSpacing) {
        npm = INPM(_npm); gauge = ICLGauge(_gauge); pool = ICLPool(_pool);
        btc = IERC20(_btc); musd = IERC20(_musd); reward = IERC20(ICLGauge(_gauge).rewardToken());
        tickSpacing = _tickSpacing; owner = msg.sender;
    }

    function setVault(address v) external {
        if (msg.sender != owner || vault != address(0)) revert VaultSet();
        vault = v;
    }

    modifier onlyVault() { if (msg.sender != vault) revert NotVault(); _; }

    function spotSqrtPrice() external view returns (uint256) {
        (uint160 x,,,,,) = pool.slot0();
        return (uint256(1) << 96) * 1e18 / x;
    }

    function position(uint256 id) external view returns (uint128 liq, uint256 sqrtA, uint256 sqrtB) {
        (,,,,,,, liq) = npm.positions(id);
        return (liq, SQRT_A, SQRT_B);
    }

    // Slippage mins are 0 on purpose: the vault checks pool spot against the fair price before every add.
    function mintStaked(uint256 a0, uint256 a1) external onlyVault returns (uint256 id, uint256 used0, uint256 used1) {
        _pull(a0, a1);
        uint256 usedMusd; uint256 usedBtc;
        (id,, usedMusd, usedBtc) = npm.mint(INPM.MintParams(
            address(musd), address(btc), tickSpacing, TICK_LOWER, TICK_UPPER, a1, a0, 0, 0, address(this), block.timestamp, 0));
        _stake(id);
        _sweep();
        return (id, usedBtc, usedMusd);
    }

    function increaseStaked(uint256 id, uint256 a0, uint256 a1) external onlyVault returns (uint256 used0, uint256 used1) {
        _pull(a0, a1);
        _unstake(id);
        uint256 usedMusd; uint256 usedBtc;
        (, usedMusd, usedBtc) = npm.increaseLiquidity(INPM.IncreaseParams(id, a1, a0, 0, 0, block.timestamp));
        _stake(id);
        _sweep();
        return (usedBtc, usedMusd);
    }

    function decreaseStaked(uint256 id, uint128 liq) external onlyVault returns (uint256 a0, uint256 a1) {
        _unstake(id);
        (uint256 musdOut, uint256 btcOut) = npm.decreaseLiquidity(INPM.DecreaseParams(id, liq, 0, 0, block.timestamp));
        // collect exactly what was removed; accrued fees stay in the position
        npm.collect(INPM.CollectParams(id, vault, uint128(musdOut), uint128(btcOut)));
        _stake(id);
        return (btcOut, musdOut);
    }

    /// Claims MEZO and sends everything held (including rewards paid out by earlier unstakes) to the vault.
    function getReward(uint256 id) external onlyVault returns (uint256 r) {
        if (gauge.stakedContains(address(this), id)) gauge.getReward(id);
        r = reward.balanceOf(address(this));
        if (r > 0) reward.transfer(vault, r);
    }

    /// The gauge returns the NFT with safeTransferFrom on unstake.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function _pull(uint256 a0, uint256 a1) internal {
        btc.transferFrom(msg.sender, address(this), a0);
        musd.transferFrom(msg.sender, address(this), a1);
        btc.approve(address(npm), a0);
        musd.approve(address(npm), a1);
    }

    function _unstake(uint256 id) internal {
        if (gauge.stakedContains(address(this), id)) gauge.withdraw(id);
    }

    /// An empty position (all liquidity removed) stays unstaked until the next deposit.
    function _stake(uint256 id) internal {
        (,,,,,,, uint128 liq) = npm.positions(id);
        if (liq == 0) return;
        npm.approve(address(gauge), id);
        gauge.deposit(id);
    }

    function _sweep() internal {
        uint256 b = btc.balanceOf(address(this));
        uint256 m = musd.balanceOf(address(this));
        if (b > 0) btc.transfer(vault, b);
        if (m > 0) musd.transfer(vault, m);
    }
}
