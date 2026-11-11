import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, reduce, view, PARAMS} from '../app/engine.mjs';
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} not near ${b}`);
const lender = () => reduce(reduce(initialState(), {type: 'faucet'}), {type: 'supply', musd: 10000});

test('borrow rate follows the utilisation curve', () => {
  const m = view(initialState()).market;
  near(m.utilization, 430000 / 900000, 1e-12);
  near(m.borrowRate, PARAMS.irm.base + (PARAMS.irm.kinkRate - PARAMS.irm.base) * m.utilization / PARAMS.irm.kinkUtil, 1e-12);
  near(m.supplyRate, m.borrowRate * m.utilization, 1e-12);
});

test('supplying MUSD moves funds into the market and mints supply shares', () => {
  const s = lender(), v = view(s);
  near(s.user.musd, PARAMS.faucet.musd - 10000);
  near(v.lend.supplied, 10000, 1e-9);
  near(v.market.supplyAssets, 910000, 1e-9);
});

test('supply rejects more than the wallet holds and bad amounts', () => {
  const s = reduce(initialState(), {type: 'faucet'});
  assert.throws(() => reduce(s, {type: 'supply', musd: 1e6}), /MUSD/);
  assert.throws(() => reduce(s, {type: 'supply', musd: -5}), /amount/i);
});

test('time grows a supplier balance by the supply rate and grows market debt by the borrow rate', () => {
  const s0 = lender(), v0 = view(s0);
  const s1 = reduce(s0, {type: 'advance', days: 365}), v1 = view(s1);
  assert.ok(v1.lend.supplied > v0.lend.supplied);
  assert.ok(v1.market.borrowAssets > v0.market.borrowAssets);
  near(v1.lend.supplied / v0.lend.supplied - 1, v0.market.supplyRate, 0.08);
});

test('suppliers can withdraw down to market liquidity and no further', () => {
  const s = lender();
  const out = reduce(s, {type: 'withdrawSupply', musd: 4000});
  near(view(out).lend.supplied, 6000, 1e-9);
  near(out.user.musd, s.user.musd + 4000);
  assert.throws(() => reduce(s, {type: 'withdrawSupply', musd: 10001}), /supplied/i);
  const drained = {...s, market: {...s.market, borrowAssets: s.market.supplyAssets - 100}};
  assert.throws(() => reduce(drained, {type: 'withdrawSupply', musd: 5000}), /liquidity/i);
});

test('withdrawing the whole supply clears the position exactly', () => {
  let s = lender();
  s = reduce(s, {type: 'withdrawSupply', musd: view(s).lend.supplied});
  assert.equal(s.user.supplyShares, 0);
});
