// Fictional MUSD-equivalent scenario values, not LP token balances or oracle data.
// This adapter never connects a wallet, performs network I/O or signs a transaction.
export function createMockMarket() {
  let wallet = 2500000, collateral = 0, debt = 0, sequence = 0;
  function read() {
    return {
      source: 'mock', label: 'Demo mode · simulated funds', chainId: null,
      walletMUSD: wallet / 100,
      position: {collateralMUSD: collateral / 100, debtMUSD: debt / 100},
      maxBorrowLtv: 75,
      availableBorrowMUSD: Math.max(0, Math.floor(collateral * 0.75) - debt) / 100,
    };
  }
  function execute(action, rawAmount) {
    if (!['deposit', 'borrow', 'repay', 'withdraw'].includes(action)) throw new Error('Choose a demo action.');
    if (typeof rawAmount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(rawAmount.trim())) throw new Error('Enter an amount with up to 2 decimals.');
    const amount = Math.round(Number(rawAmount) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) throw new Error('Use an amount from 0.01 to 1,000,000.');
    if (['deposit', 'repay'].includes(action) && amount > wallet) throw new Error('Not enough demo funds.');
    if (action === 'borrow' && debt + amount > Math.floor(collateral * 0.75)) throw new Error('Above the demo borrowing limit.');
    if (action === 'repay' && amount > debt) throw new Error('Amount exceeds your demo debt.');
    if (action === 'withdraw' && (amount > collateral || debt > Math.floor((collateral - amount) * 0.75))) throw new Error('Repay demo debt before withdrawing this amount.');
    if (action === 'deposit') { wallet -= amount; collateral += amount; }
    if (action === 'borrow') { wallet += amount; debt += amount; }
    if (action === 'repay') { wallet -= amount; debt -= amount; }
    if (action === 'withdraw') { wallet += amount; collateral -= amount; }
    sequence += 1;
    return {id: `mock-${sequence}`, simulated: true, transactionHash: null, action, amountMUSD: amount / 100, snapshot: read()};
  }
  return {read, execute};
}
