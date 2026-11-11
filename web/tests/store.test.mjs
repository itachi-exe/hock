import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore, STORAGE_KEY} from '../app/store.mjs';
import {initialState} from '../app/engine.mjs';
const memory = (seed = {}) => { const m = {...seed}; return {getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: (k) => { delete m[k]; }, raw: m}; };

test('a fresh store starts from the initial market', () => {
  assert.deepEqual(createStore(memory()).getState(), initialState());
});

test('dispatch applies the action, saves it and tells subscribers', () => {
  const mem = memory(), store = createStore(mem);
  let calls = 0; store.subscribe(() => { calls++; });
  assert.deepEqual(store.dispatch({type: 'faucet'}), {ok: true});
  assert.equal(calls, 1);
  assert.equal(store.getState().user.btc, 0.5);
  assert.equal(createStore(mem).getState().user.btc, 0.5);
});

test('a rejected action returns the message and changes nothing, saved or live', () => {
  const mem = memory(), store = createStore(mem);
  let calls = 0; store.subscribe(() => { calls++; });
  const before = store.getState();
  const res = store.dispatch({type: 'borrow', musd: 100});
  assert.equal(res.ok, false);
  assert.match(res.error, /limit/i);
  assert.equal(store.getState(), before);
  assert.equal(calls, 0);
  assert.equal(mem.raw[STORAGE_KEY], undefined);
});

test('corrupt, foreign or tampered saved state is ignored', () => {
  for (const raw of ['not json', '{}', '{"t":"x"}', JSON.stringify({...initialState(), user: {btc: 'lots'}}), JSON.stringify({...initialState(), prices: {btc: NaN, musd: 1}}), 'null']) {
    assert.deepEqual(createStore(memory({[STORAGE_KEY]: raw})).getState(), initialState(), raw);
  }
});

test('storage that throws does not break the store', () => {
  const broken = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }};
  const store = createStore(broken);
  assert.equal(store.dispatch({type: 'faucet'}).ok, true);
  assert.equal(store.getState().user.btc, 0.5);
});

test('preview shows the result of an action without committing it', () => {
  const store = createStore(memory());
  store.dispatch({type: 'faucet'});
  const p = store.preview({type: 'vaultDeposit', btc: 0.1, musd: 10000});
  assert.equal(p.ok, true);
  assert.equal(p.view.wallet.shares, 20000);
  assert.equal(store.getState().user.shares, 0);
  assert.equal(store.preview({type: 'borrow', musd: 1}).ok, false);
});

test('unsubscribing stops notifications', () => {
  const store = createStore(memory());
  let calls = 0; const off = store.subscribe(() => { calls++; });
  off(); store.dispatch({type: 'faucet'});
  assert.equal(calls, 0);
});
