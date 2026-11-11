import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../app/mock-market.mjs');
test('mock market completes deposit, borrow, repay and withdrawal without a wallet', async () => {
  const {createMockMarket} = await load();
  const market = createMockMarket();
  const initial = market.read();
  assert.equal(initial.source, 'mock');
  assert.equal(initial.chainId, null);
  market.execute('deposit', '10000');
  const receipt = market.execute('borrow', '4000');
  assert.equal(receipt.simulated, true);
  assert.equal(receipt.transactionHash, null);
  assert.equal(market.read().position.debtMUSD, 4000);
  market.execute('repay', '4000');
  market.execute('withdraw', '10000');
  assert.equal(market.read().walletMUSD, initial.walletMUSD);
  assert.deepEqual(market.read().position, initial.position);
});

test('invalid or unaffordable mock actions leave the position unchanged', async () => {
  const {createMockMarket} = await load();
  const market = createMockMarket();
  for (const [action, amount] of [['deposit','-1'],['deposit','NaN'],['deposit','1e3'],['deposit','1.001'],['deposit',''],['deposit','25000.01'],['borrow','1'],['withdraw','1'],['repay','1'],['sign','100']]) {
    const before = market.read();
    assert.throws(() => market.execute(action, amount));
    assert.deepEqual(market.read(), before);
  }
  market.execute('deposit', '10000');
  market.execute('borrow', '7500');
  assert.throws(() => market.execute('borrow', '0.01'));
  assert.throws(() => market.execute('withdraw', '0.01'));
  assert.throws(() => market.execute('repay', '7500.01'));
  assert.equal(market.read().position.debtMUSD, 7500);
  assert.equal(market.execute('repay', '0.01').amountMUSD, 0.01);
});
