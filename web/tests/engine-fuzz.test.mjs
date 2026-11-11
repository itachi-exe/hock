import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, reduce, view} from '../app/engine.mjs';

// Seeded random walk over every action. Invalid actions must throw and leave state untouched.
function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const ACTIONS = ['faucet', 'vaultDeposit', 'vaultWithdraw', 'harvest', 'postCollateral', 'removeCollateral', 'borrow', 'repay', 'supply', 'withdrawSupply', 'shock', 'advance', 'liquidate', 'hock'];

function numbers(o, path = '') {
  return Object.entries(o).flatMap(([k, v]) => typeof v === 'number' ? [[path + k, v]] : v && typeof v === 'object' && !Array.isArray(v) ? numbers(v, path + k + '.') : []);
}

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`random walk ${seed} keeps the market finite, non negative and solvent in accounting`, () => {
    const r = rng(seed);
    let s = reduce(initialState(), {type: 'faucet'});
    for (let i = 0; i < 600; i++) {
      const type = ACTIONS[Math.floor(r() * ACTIONS.length)];
      const a = {type, btc: r() * 0.3, musd: r() * 30000, shares: r() * 30000, days: 1 + Math.floor(r() * 40), ltv: r() * 0.7, btcPrice: 25000 + r() * 150000};
      const before = JSON.stringify(s);
      try { s = reduce(s, a); } catch (e) { assert.ok(e instanceof Error && e.message.length > 5); assert.equal(JSON.stringify(s), before); continue; }
      for (const [k, v] of numbers(s)) { assert.ok(Number.isFinite(v), `${k} not finite after ${type}`); assert.ok(v >= -1e-6 || k === 'market.badDebt', `${k}=${v} negative after ${type}`); }
      const v = view(s);
      assert.ok(v.market.liquidity >= -1e-6, `liquidity negative after ${type}`);
      assert.ok(s.market.borrowAssets >= 0 && s.market.supplyAssets >= 0);
    }
  });
}
