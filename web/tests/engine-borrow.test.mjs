import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, reduce, view, PARAMS} from '../app/engine.mjs';
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} not near ${b}`);
const run = (s, ...actions) => actions.reduce(reduce, s);
// 0.2 BTC + 20000 MUSD of LP, all posted as collateral: 40000 MUSD of collateral at day zero.
const posted = () => run(initialState(), {type: 'faucet'}, {type: 'vaultDeposit', btc: 0.2, musd: 20000}, {type: 'postCollateral', shares: 40000});

test('posting shares moves them from the wallet into the market', () => {
  const s = posted(), p = view(s).position;
  assert.equal(s.user.shares, 0);
  near(p.collateralValue, 40000, 1e-9);
  assert.equal(p.debt, 0);
  assert.equal(p.health, null);
});

test('posting more shares than the wallet holds is rejected', () => {
  assert.throws(() => reduce(posted(), {type: 'postCollateral', shares: 1}), /shares/i);
});

test('borrowing pays MUSD to the wallet and records debt, up to the 77 percent limit', () => {
  const s = run(posted(), {type: 'borrow', musd: 20000}), p = view(s).position;
  near(s.user.musd, PARAMS.faucet.musd - 20000 + 20000);
  near(p.debt, 20000, 1e-9);
  near(p.ltv, 0.5, 1e-9);
  near(p.health, PARAMS.lltv / 0.5, 1e-9);
  near(p.maxBorrow, 40000 * PARAMS.lltv - 20000, 1e-9);
  near(view(s).market.borrowAssets, 450000, 1e-9);
  assert.throws(() => reduce(s, {type: 'borrow', musd: p.maxBorrow + 1}), /limit/i);
  assert.doesNotThrow(() => reduce(s, {type: 'borrow', musd: p.maxBorrow}));
});

test('borrowing is capped by market liquidity', () => {
  const s = posted();
  const tight = {...s, market: {...s.market, borrowAssets: s.market.supplyAssets - 50}};
  assert.throws(() => reduce(tight, {type: 'borrow', musd: 1000}), /liquidity/i);
});

test('debt grows with time and repaying in full clears it exactly', () => {
  let s = run(posted(), {type: 'borrow', musd: 20000}, {type: 'advance', days: 180});
  const debt = view(s).position.debt;
  assert.ok(debt > 20000);
  s = run(s, {type: 'repay', musd: debt});
  assert.equal(s.user.borrowShares, 0);
  assert.equal(view(s).position.debt, 0);
  assert.throws(() => reduce(s, {type: 'repay', musd: 1}), /debt/i);
});

test('partial repay lowers debt and overpaying is rejected', () => {
  const s = run(posted(), {type: 'borrow', musd: 20000}, {type: 'repay', musd: 5000});
  near(view(s).position.debt, 15000, 1e-9);
  assert.throws(() => reduce(s, {type: 'repay', musd: 15001}), /debt/i);
});

test('removing collateral is blocked when it would leave the position unhealthy', () => {
  const s = run(posted(), {type: 'borrow', musd: 20000});
  assert.throws(() => reduce(s, {type: 'removeCollateral', shares: 30000}), /health|limit/i);
  const ok = reduce(s, {type: 'removeCollateral', shares: 10000});
  assert.equal(ok.user.shares, 10000);
});

test('the reported liquidation price is exactly where health crosses one', () => {
  const s = run(posted(), {type: 'borrow', musd: 20000});
  const liq = view(s).position.liquidationBtcPrice;
  assert.ok(liq < 100000 && liq > 20000);
  assert.ok(view(reduce(s, {type: 'shock', btcPrice: liq * 1.002})).position.health >= 1);
  assert.ok(view(reduce(s, {type: 'shock', btcPrice: liq * 0.998})).position.health < 1);
});

test('a price shock makes the position liquidatable and blocks new borrowing', () => {
  const s = run(posted(), {type: 'borrow', musd: 25000}, {type: 'shock', btcPrice: 60000});
  const p = view(s).position;
  assert.ok(p.health < 1 && p.liquidatable);
  assert.throws(() => reduce(s, {type: 'borrow', musd: 1}), /limit/i);
});

test('liquidation cannot run on a healthy position', () => {
  assert.throws(() => reduce(run(posted(), {type: 'borrow', musd: 10000}), {type: 'liquidate'}), /healthy/i);
});

test('liquidation repays debt and seizes collateral at the incentive', () => {
  const s0 = run(posted(), {type: 'borrow', musd: 25000}, {type: 'shock', btcPrice: 60000});
  const before = view(s0), s1 = reduce(s0, {type: 'liquidate'}), after = view(s1);
  const repaid = before.position.debt - after.position.debt;
  assert.ok(repaid > 0);
  near(before.position.collateralShares - after.position.collateralShares, repaid * PARAMS.liquidationIncentive / before.vault.sharePrice, 1e-9);
  assert.ok(after.position.health >= before.position.health);
  assert.equal(after.market.badDebt, 0);
});

test('a deep crash leaves bad debt that suppliers absorb', () => {
  const s0 = run(posted(), {type: 'borrow', musd: 30000}, {type: 'shock', btcPrice: 20000});
  const supplyBefore = view(s0).market.supplyAssets;
  const s1 = reduce(s0, {type: 'liquidate'}), v = view(s1);
  assert.equal(v.position.collateralShares, 0);
  assert.equal(v.position.debt, 0);
  assert.ok(v.market.badDebt > 0);
  near(supplyBefore - v.market.supplyAssets, v.market.badDebt, 1e-9);
});

test('hock in one step deposits, posts and borrows at the chosen ratio', () => {
  const s = run(initialState(), {type: 'faucet'}, {type: 'hock', btc: 0.2, musd: 20000, ltv: 0.5});
  const p = view(s).position;
  near(p.collateralValue, 40000, 1e-9);
  near(p.debt, 20000, 1e-9);
  assert.equal(s.user.shares, 0);
});

test('hock rejects a ratio at or above the liquidation limit and changes nothing', () => {
  const s = reduce(initialState(), {type: 'faucet'});
  assert.throws(() => reduce(s, {type: 'hock', btc: 0.2, musd: 20000, ltv: 0.78}), /ratio/i);
  assert.equal(s.user.btc, PARAMS.faucet.btc);
});

test('reset returns the pristine market', () => {
  assert.deepEqual(reduce(posted(), {type: 'reset'}), initialState());
});

test('rounding a repayment up to the cent still clears the debt and charges only what is owed', () => {
  let s = run(posted(), {type: 'borrow', musd: 20000}, {type: 'advance', days: 33});
  const debt = view(s).position.debt, walletBefore = s.user.musd;
  s = reduce(s, {type: 'repay', musd: Math.ceil(debt * 100) / 100});
  assert.equal(s.user.borrowShares, 0);
  near(walletBefore - s.user.musd, debt, 1e-9);
});
