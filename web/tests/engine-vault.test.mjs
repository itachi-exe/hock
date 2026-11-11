import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, reduce, view, PARAMS} from '../app/engine.mjs';
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} not near ${b}`);
const funded = () => reduce(initialState(), {type: 'faucet'});

test('a new session starts at day zero with an empty wallet and a seeded vault', () => {
  const s = initialState(), v = view(s);
  assert.equal(s.t, 0);
  assert.equal(s.user.btc, 0);
  assert.equal(s.user.musd, 0);
  near(v.vault.sharePrice, 1);
  assert.ok(v.vault.tvl > 1_000_000);
});

test('faucet pays demo funds and stops after the claim cap', () => {
  let s = funded();
  assert.equal(s.user.btc, PARAMS.faucet.btc);
  assert.equal(s.user.musd, PARAMS.faucet.musd);
  for (let i = 1; i < PARAMS.faucet.maxClaims; i++) s = reduce(s, {type: 'faucet'});
  assert.throws(() => reduce(s, {type: 'faucet'}), /faucet/i);
});

test('reduce never mutates the previous state', () => {
  const a = initialState();
  const snapshot = JSON.stringify(a);
  reduce(a, {type: 'faucet'});
  assert.equal(JSON.stringify(a), snapshot);
});

test('vault deposit uses the balanced part of both assets and mints shares at the share price', () => {
  const s = reduce(funded(), {type: 'vaultDeposit', btc: 0.1, musd: 20000});
  // at 100000 MUSD per BTC, 0.1 BTC pairs with 10000 MUSD; the extra 10000 MUSD stays in the wallet
  near(s.user.btc, PARAMS.faucet.btc - 0.1);
  near(s.user.musd, PARAMS.faucet.musd - 10000);
  near(s.user.shares, 20000);
});

test('vault deposit rejects missing funds, zero amounts and one sided input', () => {
  const s = funded();
  assert.throws(() => reduce(s, {type: 'vaultDeposit', btc: 5, musd: 1000}), /BTC/);
  assert.throws(() => reduce(s, {type: 'vaultDeposit', btc: 0.1, musd: 999999}), /MUSD/);
  assert.throws(() => reduce(s, {type: 'vaultDeposit', btc: 0, musd: 1000}), /both/i);
  assert.throws(() => reduce(s, {type: 'vaultDeposit', btc: 'x', musd: 1000}), /amount/i);
});

test('withdrawing every share returns the same BTC and MUSD at an unchanged price', () => {
  let s = reduce(funded(), {type: 'vaultDeposit', btc: 0.1, musd: 10000});
  s = reduce(s, {type: 'vaultWithdraw', shares: s.user.shares});
  near(s.user.btc, PARAMS.faucet.btc);
  near(s.user.musd, PARAMS.faucet.musd);
  assert.equal(s.user.shares, 0);
});

test('a BTC price drop costs LP value by the square root rule, not one for one', () => {
  let s = reduce(funded(), {type: 'vaultDeposit', btc: 0.1, musd: 10000});
  s = reduce(s, {type: 'shock', btcPrice: 50000});
  near(view(s).vault.sharePrice, Math.sqrt(0.5), 1e-9);
});

test('harvest after time compounds rewards, pays the 10 percent fee and lifts the share price', () => {
  let s = reduce(funded(), {type: 'vaultDeposit', btc: 0.1, musd: 10000});
  s = reduce(s, {type: 'advance', days: 365});
  const pending = view(s).vault.pendingRewards;
  assert.ok(pending > 0);
  const before = view(s).vault.sharePrice;
  s = reduce(s, {type: 'harvest'});
  const after = view(s);
  assert.ok(after.vault.sharePrice > before);
  near(after.vault.treasury, pending * PARAMS.vault.feeRate, 1e-9);
  near(after.vault.pendingRewards, 0, 1e-9);
  near(after.vault.sharePrice, 1 + PARAMS.vault.emissionApr * (1 - PARAMS.vault.feeRate), 1e-9);
});

test('advance rejects nonsense durations', () => {
  for (const days of [0, -1, 366, NaN, 'a']) assert.throws(() => reduce(initialState(), {type: 'advance', days}), /days/i);
});
