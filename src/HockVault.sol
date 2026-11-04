// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, ICL, ISwapper} from "./Interfaces.sol";
import {HockOracle} from "./HockOracle.sol";

/// One wide-range BTC/MUSD CL position, staked in the gauge. Rewards (MEZO) are compounded,
/// 10% to the treasury. Shares are plain ERC-20 so they can sit as Morpho collateral.
contract HockVault {
    string public constant name = "Hock Share";
    string public constant symbol = "HOCK";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 v);
    event Approval(address indexed o, address indexed s, uint256 v);

    IERC20 public immutable btc;
    IERC20 public immutable musd;
    IERC20 public immutable mezo;
    ICL public immutable cl;
    ISwapper public immutable swapper;
    address public immutable treasury;
    uint256 public constant FEE_BPS = 1000;
    uint256 public immutable maxDriftBps;
    HockOracle public oracle;
    uint256 public tokenId;
    address public owner;

    event Deposit(address indexed who, uint256 a0, uint256 a1, uint256 shares);
    event Withdraw(address indexed who, uint256 shares, uint256 a0, uint256 a1);
    event Harvest(uint256 reward, uint256 fee, uint256 compounded);

    error Drift();
    error Slippage();
    error NotOwner();
    error NotKeeper();
    error OracleSet();

    constructor(address _btc, address _musd, address _mezo, address _cl, address _swapper, address _treasury, uint256 _maxDriftBps) {
        btc = IERC20(_btc); musd = IERC20(_musd); mezo = IERC20(_mezo); cl = ICL(_cl);
        swapper = ISwapper(_swapper); treasury = _treasury; maxDriftBps = _maxDriftBps; owner = msg.sender;
    }

    function setOracle(address o) external {
        if (msg.sender != owner) revert NotOwner();
        if (address(oracle) != address(0)) revert OracleSet();
        oracle = HockOracle(o);
    }

    /// Spot may not sit away from the fair price by more than maxDriftBps (on sqrt price).
    function _checkDrift() internal view {
        uint256 fair = oracle.fairSqrtPrice();
        uint256 spot = cl.spotSqrtPrice();
        uint256 d = spot > fair ? spot - fair : fair - spot;
        if (d * 1e4 / fair > maxDriftBps) revert Drift();
    }

    function deposit(uint256 a0, uint256 a1, uint256 minShares) external returns (uint256 shares) {
        return _deposit(a0, a1, minShares);
    }

    function deposit(uint256 a0, uint256 a1, uint256 minShares, bytes[] calldata priceUpdate) external payable returns (uint256 shares) {
        oracle.updatePriceFeeds{value: msg.value}(priceUpdate);
        return _deposit(a0, a1, minShares);
    }

    function _deposit(uint256 a0, uint256 a1, uint256 minShares) internal returns (uint256 shares) {
        _checkDrift();
        uint256 before_ = totalSupply == 0 ? 0 : oracle.totalValue();
        btc.transferFrom(msg.sender, address(this), a0);
        musd.transferFrom(msg.sender, address(this), a1);
        uint256 u0; uint256 u1;
        btc.approve(address(cl), a0); musd.approve(address(cl), a1);
        if (tokenId == 0) (tokenId, u0, u1) = cl.mintStaked(a0, a1);
        else (u0, u1) = cl.increaseStaked(tokenId, a0, a1);
        // unused part goes back to the depositor
        if (a0 > u0) btc.transfer(msg.sender, a0 - u0);
        if (a1 > u1) musd.transfer(msg.sender, a1 - u1);
        uint256 added = oracle.valueOf(u0, u1);
        shares = totalSupply == 0 ? added : added * totalSupply / before_;
        if (shares < minShares) revert Slippage();
        _mint(msg.sender, shares);
        emit Deposit(msg.sender, u0, u1, shares);
    }

    function withdraw(uint256 shares) external returns (uint256 o0, uint256 o1) {
        uint256 s = totalSupply;
        (uint128 liq,,) = cl.position(tokenId);
        _burn(msg.sender, shares);
        (uint256 d0, uint256 d1) = cl.decreaseStaked(tokenId, uint128(uint256(liq) * shares / s));
        // idle balances (compound leftovers) are shared too; d0/d1 already sit in the vault
        o0 = (btc.balanceOf(address(this)) - d0) * shares / s + d0;
        o1 = (musd.balanceOf(address(this)) - d1) * shares / s + d1;
        btc.transfer(msg.sender, o0); musd.transfer(msg.sender, o1);
        emit Withdraw(msg.sender, shares, o0, o1);
    }

    /// Only the deploying owner may choose the keeper's per-leg minimum outputs.
    function harvest(uint256 minBtc, uint256 minMusd, bytes[] calldata priceUpdate) external payable returns (uint256 reward) {
        if (msg.sender != owner) revert NotKeeper();
        if (minBtc == 0 || minMusd == 0) revert Slippage();
        oracle.updatePriceFeeds{value: msg.value}(priceUpdate);
        _checkDrift();
        reward = cl.getReward(tokenId);
        if (reward == 0) return 0;
        uint256 fee = reward * FEE_BPS / 1e4;
        mezo.transfer(treasury, fee);
        uint256 rest = reward - fee;
        mezo.approve(address(swapper), rest);
        uint256 half = rest / 2;
        uint256 g0 = _swap(btc, half, minBtc);
        uint256 g1 = _swap(musd, rest - half, minMusd);
        uint256 b0 = btc.balanceOf(address(this)); uint256 b1 = musd.balanceOf(address(this));
        btc.approve(address(cl), b0); musd.approve(address(cl), b1);
        _checkDrift();
        cl.increaseStaked(tokenId, b0, b1);
        emit Harvest(reward, fee, g0 + g1);
    }

    // A swapper's claimed output cannot satisfy a bound on the vault's actual receipt.
    function _swap(IERC20 out, uint256 amount, uint256 minimum) internal returns (uint256 received) {
        uint256 before_ = out.balanceOf(address(this));
        swapper.swap(address(mezo), address(out), amount, minimum);
        uint256 after_ = out.balanceOf(address(this));
        if (after_ < before_ || after_ - before_ < minimum) revert Slippage();
        return after_ - before_;
    }

    // ERC-20
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; emit Approval(msg.sender, s, v); return true; }
    function transfer(address t, uint256 v) external returns (bool) { _move(msg.sender, t, v); return true; }
    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _move(f, t, v); return true;
    }
    function _move(address f, address t, uint256 v) internal { balanceOf[f] -= v; balanceOf[t] += v; emit Transfer(f, t, v); }
    function _mint(address t, uint256 v) internal { totalSupply += v; balanceOf[t] += v; emit Transfer(address(0), t, v); }
    function _burn(address f, uint256 v) internal { balanceOf[f] -= v; totalSupply -= v; emit Transfer(f, address(0), v); }
}
