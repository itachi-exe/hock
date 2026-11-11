// Hock market engine. Pure, deterministic, no I/O. Every value is simulated.
// reduce(state, action) returns a new state or throws an Error with a user readable message.
// An on-chain adapter would expose the same actions; this engine is the demo market.
export const PARAMS = Object.freeze({
  lltv: 0.77,
  safeLtv: 0.65,
  faucet: Object.freeze({btc: 0.5, musd: 25000, maxClaims: 5}),
  vault: Object.freeze({emissionApr: 0.18, feeRate: 0.1}),
  irm: Object.freeze({base: 0.015, kinkUtil: 0.9, kinkRate: 0.08, maxRate: 0.8}),
  liquidationIncentive: Math.min(1.15, 1 / (1 - 0.3 * (1 - 0.77))),
  limits: Object.freeze({minBtc: 20000, maxBtc: 300000, minPeg: 0.5, maxPeg: 1.1, maxAmount: 1e9}),
});

const EPS = 1e-9;
const fail = (message) => { throw new Error(message); };
const clone = (s) => structuredClone(s);

export function initialState() {
  return {
    t: 0,
    prices: {btc: 100000, musd: 1},
    vault: {L: 1_200_000 / (2 * Math.sqrt(100000)), shares: 1_200_000, lastHarvest: 0, treasury: 0},
    market: {supplyAssets: 900_000, supplyShares: 900_000, borrowAssets: 430_000, borrowShares: 430_000, lastAccrue: 0, badDebt: 0},
    user: {btc: 0, musd: 0, shares: 0, collateral: 0, supplyShares: 0, borrowShares: 0, claims: 0},
    log: [],
  };
}

const price = (s) => s.prices.btc / s.prices.musd; // BTC priced in MUSD
const vaultValue = (s) => 2 * s.vault.L * Math.sqrt(price(s));
const sharePrice = (s) => vaultValue(s) / s.vault.shares;

function amount(raw, label, {allowZero = false} = {}) {
  const n = typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n < 0 || n > PARAMS.limits.maxAmount) fail(`Enter a valid ${label} amount.`);
  if (!allowZero && n <= 0) fail(`Enter a valid ${label} amount.`);
  return n;
}

function note(s, type, summary) {
  s.log.unshift({id: s.log.length ? s.log[0].id + 1 : 1, t: s.t, type, summary, simulated: true});
  if (s.log.length > 200) s.log.length = 200;
}

function pendingRewards(s) {
  return vaultValue(s) * PARAMS.vault.emissionApr * (s.t - s.vault.lastHarvest) / 365;
}

function harvest(s) {
  const pending = pendingRewards(s);
  if (pending <= EPS) { s.vault.lastHarvest = s.t; return 0; }
  const fee = pending * PARAMS.vault.feeRate;
  s.vault.L += (pending - fee) / (2 * Math.sqrt(price(s)));
  s.vault.treasury += fee;
  s.vault.lastHarvest = s.t;
  return pending;
}

function utilization(m) { return m.supplyAssets > 0 ? Math.min(1, m.borrowAssets / m.supplyAssets) : 0; }

function borrowRate(m) {
  const {base, kinkUtil, kinkRate, maxRate} = PARAMS.irm, u = utilization(m);
  return u <= kinkUtil ? base + (kinkRate - base) * u / kinkUtil : kinkRate + (maxRate - kinkRate) * (u - kinkUtil) / (1 - kinkUtil);
}

const supplied = (s) => s.market.supplyShares > 0 ? s.user.supplyShares * s.market.supplyAssets / s.market.supplyShares : 0;
const userDebt = (s) => s.market.borrowShares > 0 ? s.user.borrowShares * s.market.borrowAssets / s.market.borrowShares : 0;

function positionView(s) {
  const sp = sharePrice(s), debt = userDebt(s), shares = s.user.collateral;
  const collateralValue = shares * sp, limit = collateralValue * PARAMS.lltv;
  const myL = shares / s.vault.shares * s.vault.L;
  // Health reaches one when 2 * L * sqrt(p) * lltv = debt, solved for the BTC price.
  const liqSqrt = myL > 0 && debt > 0 ? debt / PARAMS.lltv / (2 * myL) : 0;
  return {
    collateralShares: shares, collateralValue, debt, limit,
    ltv: collateralValue > 0 ? debt / collateralValue : 0,
    health: debt > EPS ? limit / debt : null,
    liquidatable: debt > EPS && debt > limit,
    maxBorrow: Math.max(0, Math.min(limit - debt, s.market.supplyAssets - s.market.borrowAssets)),
    liquidationBtcPrice: liqSqrt > 0 ? liqSqrt * liqSqrt * s.prices.musd : null,
    yearlyCost: debt * borrowRate(s.market),
    yearlyEarn: collateralValue * PARAMS.vault.emissionApr * (1 - PARAMS.vault.feeRate),
  };
}

// Interest compounds daily so utilisation changes are followed through long jumps.
function accrue(s, days) {
  for (let d = 0; d < days; d++) {
    const step = Math.min(1, days - d);
    const interest = s.market.borrowAssets * (Math.exp(borrowRate(s.market) * step / 365) - 1);
    s.market.borrowAssets += interest;
    s.market.supplyAssets += interest;
  }
}

const handlers = {
  faucet(s) {
    if (s.user.claims >= PARAMS.faucet.maxClaims) fail('The demo faucet is empty. Reset to start over.');
    s.user.claims += 1;
    s.user.btc += PARAMS.faucet.btc;
    s.user.musd += PARAMS.faucet.musd;
    note(s, 'faucet', `Claimed ${PARAMS.faucet.btc} BTC and ${PARAMS.faucet.musd.toLocaleString('en-US')} MUSD of demo funds`);
  },

  vaultDeposit(s, {btc, musd}) {
    const b = amount(btc, 'BTC', {allowZero: true}), m = amount(musd, 'MUSD', {allowZero: true});
    if (b <= 0 || m <= 0) fail('Add both BTC and MUSD. The pool needs both sides.');
    if (b > s.user.btc + EPS) fail('Not enough BTC in your wallet.');
    if (m > s.user.musd + EPS) fail('Not enough MUSD in your wallet.');
    harvest(s);
    const p = Math.sqrt(price(s));
    const L = Math.min(b * p, m / p);
    const usedBtc = L / p, usedMusd = L * p;
    const minted = L / s.vault.L * s.vault.shares;
    s.user.btc -= usedBtc; s.user.musd -= usedMusd; s.user.shares += minted;
    s.vault.L += L; s.vault.shares += minted;
    note(s, 'vault', `Added ${fmt(usedBtc, 4)} BTC and ${fmt(usedMusd)} MUSD, received ${fmt(minted)} hock shares`);
  },

  vaultWithdraw(s, {shares}) {
    const n = amount(shares, 'share');
    if (n > s.user.shares + EPS) fail('You do not hold that many shares outside the market. Remove collateral first.');
    harvest(s);
    const L = n / s.vault.shares * s.vault.L, p = Math.sqrt(price(s));
    s.user.shares = Math.max(0, s.user.shares - n);
    if (s.user.shares < EPS) s.user.shares = 0;
    s.vault.L -= L; s.vault.shares -= n;
    s.user.btc += L / p; s.user.musd += L * p;
    note(s, 'vault', `Withdrew ${fmt(n)} shares for ${fmt(L / p, 4)} BTC and ${fmt(L * p)} MUSD`);
  },

  harvest(s) {
    const pending = harvest(s);
    if (pending <= EPS) fail('Nothing to harvest yet. Advance time first.');
    note(s, 'harvest', `Harvested ${fmt(pending)} MUSD of MEZO, compounded ${fmt(pending * (1 - PARAMS.vault.feeRate))}, fee ${fmt(pending * PARAMS.vault.feeRate)}`);
  },

  shock(s, {btcPrice, musdPrice}) {
    const {minBtc, maxBtc, minPeg, maxPeg} = PARAMS.limits;
    if (btcPrice !== undefined) {
      if (!Number.isFinite(btcPrice) || btcPrice < minBtc || btcPrice > maxBtc) fail(`Pick a BTC price from ${minBtc.toLocaleString('en-US')} to ${maxBtc.toLocaleString('en-US')}.`);
      s.prices.btc = btcPrice;
    }
    if (musdPrice !== undefined) {
      if (!Number.isFinite(musdPrice) || musdPrice < minPeg || musdPrice > maxPeg) fail(`Pick a MUSD price from ${minPeg} to ${maxPeg}.`);
      s.prices.musd = musdPrice;
    }
    note(s, 'price', `Oracle moved: BTC ${fmt(s.prices.btc, 0)} USD, MUSD ${fmt(s.prices.musd, 3)} USD`);
  },

  postCollateral(s, {shares}) {
    const n = amount(shares, 'share');
    if (n > s.user.shares + EPS) fail('You do not hold that many shares in your wallet.');
    s.user.shares = s.user.shares - n < EPS ? 0 : s.user.shares - n;
    s.user.collateral += n;
    note(s, 'collateral', `Posted ${fmt(n)} shares as collateral`);
  },

  removeCollateral(s, {shares}) {
    const n = amount(shares, 'share');
    if (n > s.user.collateral + EPS) fail('That is more collateral than you have posted.');
    const left = s.user.collateral - n < EPS ? 0 : s.user.collateral - n;
    if (userDebt(s) > left * sharePrice(s) * PARAMS.lltv + EPS) fail('Repay some debt first. Removing this much would break the health limit.');
    s.user.collateral = left; s.user.shares += n;
    note(s, 'collateral', `Took ${fmt(n)} shares back out of the market`);
  },

  borrow(s, {musd}) {
    const n = amount(musd, 'MUSD');
    if (n > s.market.supplyAssets - s.market.borrowAssets + EPS) fail('Not enough liquidity in the market. Try a smaller amount.');
    if (userDebt(s) + n > s.user.collateral * sharePrice(s) * PARAMS.lltv + EPS) fail('Above your borrowing limit. Add collateral or borrow less.');
    const shares = s.market.borrowAssets > 0 ? n * s.market.borrowShares / s.market.borrowAssets : n;
    s.user.borrowShares += shares; s.user.musd += n;
    s.market.borrowShares += shares; s.market.borrowAssets += n;
    note(s, 'borrow', `Borrowed ${fmt(n)} MUSD`);
  },

  repay(s, {musd}) {
    const n = amount(musd, 'MUSD'), debt = userDebt(s);
    if (debt <= EPS) fail('You have no debt to repay.');
    if (n > debt + 0.005) fail('That is more than your debt.');
    const pay = Math.min(n, debt); // a cent of rounding slack lets Max clear the debt exactly
    if (pay > s.user.musd + EPS) fail('Not enough MUSD in your wallet.');
    const all = pay >= debt - EPS;
    const shares = all ? s.user.borrowShares : pay * s.market.borrowShares / s.market.borrowAssets;
    s.user.borrowShares = all ? 0 : s.user.borrowShares - shares;
    s.user.musd -= pay;
    s.market.borrowShares -= shares; s.market.borrowAssets = Math.max(0, s.market.borrowAssets - pay);
    note(s, 'repay', `Repaid ${fmt(pay)} MUSD`);
  },

  liquidate(s) {
    const unhealthy = () => userDebt(s) > EPS && userDebt(s) > s.user.collateral * sharePrice(s) * PARAMS.lltv;
    if (!unhealthy()) fail('This position is healthy. Nothing to liquidate.');
    // Keepers close up to half the debt per round and keep going until the position is safe or empty.
    const lif = PARAMS.liquidationIncentive;
    let repaidTotal = 0, seizedTotal = 0, bad = 0;
    for (let round = 0; round < 60 && unhealthy(); round++) {
      const debt = userDebt(s), sp = sharePrice(s);
      const want = debt < 100 ? debt : debt * 0.5;
      const seize = Math.min(s.user.collateral, want * lif / sp);
      const repaid = Math.min(debt, seize * sp / lif);
      const burn = repaid >= debt - EPS ? s.user.borrowShares : repaid * s.market.borrowShares / s.market.borrowAssets;
      s.user.collateral -= seize; s.user.borrowShares -= burn;
      s.market.borrowShares -= burn; s.market.borrowAssets -= repaid;
      repaidTotal += repaid; seizedTotal += seize;
      if (s.user.collateral < EPS) {
        s.user.collateral = 0;
        bad = userDebt(s);
        s.market.borrowAssets = Math.max(0, s.market.borrowAssets - bad);
        s.market.supplyAssets = Math.max(0, s.market.supplyAssets - bad);
        s.market.borrowShares -= s.user.borrowShares; s.user.borrowShares = 0;
        s.market.badDebt += bad;
      }
    }
    note(s, 'liquidation', `Keepers repaid ${fmt(repaidTotal)} MUSD and seized ${fmt(seizedTotal)} shares${bad > EPS ? `, ${fmt(bad)} MUSD became bad debt` : ''}`);
  },

  hock(s, {btc, musd, ltv}) {
    if (!Number.isFinite(ltv) || ltv <= 0 || ltv >= PARAMS.lltv) fail(`Choose a ratio below ${PARAMS.lltv * 100}%.`);
    const held = s.user.shares;
    handlers.vaultDeposit(s, {btc, musd});
    handlers.postCollateral(s, {shares: s.user.shares - held});
    handlers.borrow(s, {musd: s.user.collateral * sharePrice(s) * ltv - userDebt(s)});
  },

  reset(s) { Object.assign(s, initialState()); },

  supply(s, {musd}) {
    const n = amount(musd, 'MUSD');
    if (n > s.user.musd + EPS) fail('Not enough MUSD in your wallet.');
    const shares = s.market.supplyAssets > 0 ? n * s.market.supplyShares / s.market.supplyAssets : n;
    s.user.musd -= n; s.user.supplyShares += shares;
    s.market.supplyAssets += n; s.market.supplyShares += shares;
    note(s, 'lend', `Supplied ${fmt(n)} MUSD`);
  },

  withdrawSupply(s, {musd}) {
    const n = amount(musd, 'MUSD');
    const owned = supplied(s);
    if (n > owned + EPS) fail('You have not supplied that much MUSD.');
    if (n > s.market.supplyAssets - s.market.borrowAssets + EPS) fail('Not enough liquidity right now. Borrowers must repay first.');
    const all = n >= owned - EPS;
    const shares = all ? s.user.supplyShares : n * s.market.supplyShares / s.market.supplyAssets;
    s.user.supplyShares -= shares; s.user.musd += n;
    s.market.supplyAssets -= n; s.market.supplyShares -= shares;
    if (all) s.user.supplyShares = 0;
    note(s, 'lend', `Withdrew ${fmt(n)} MUSD of supply`);
  },

  advance(s, {days}) {
    if (!Number.isFinite(days) || days <= 0 || days > 365) fail('Choose 1 to 365 days.');
    accrue(s, days);
    s.t += days;
    note(s, 'time', `Time moved forward ${days} day${days === 1 ? '' : 's'}`);
  },
};

export function fmt(n, digits = 2) {
  return new Intl.NumberFormat('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits}).format(n);
}

export function reduce(state, action) {
  const handler = handlers[action?.type];
  if (!handler) fail('Unknown action.');
  const next = clone(state);
  handler(next, action);
  return next;
}

export function view(s) {
  const tvl = vaultValue(s);
  return {
    t: s.t,
    prices: {...s.prices, btcInMusd: price(s)},
    vault: {tvl, sharePrice: sharePrice(s), shares: s.vault.shares, pendingRewards: pendingRewards(s), treasury: s.vault.treasury, emissionApr: PARAMS.vault.emissionApr},
    market: {
      supplyAssets: s.market.supplyAssets, borrowAssets: s.market.borrowAssets,
      liquidity: s.market.supplyAssets - s.market.borrowAssets,
      utilization: utilization(s.market), borrowRate: borrowRate(s.market),
      supplyRate: borrowRate(s.market) * utilization(s.market), badDebt: s.market.badDebt,
    },
    lend: {supplied: supplied(s)},
    position: positionView(s),
    wallet: {btc: s.user.btc, musd: s.user.musd, shares: s.user.shares, shareValue: s.user.shares * sharePrice(s)},
    faucetLeft: PARAMS.faucet.maxClaims - s.user.claims,
    log: s.log,
  };
}
