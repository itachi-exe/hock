# Hock: AKINDO submission fields

Paste-ready. Everything here matches what is deployed and verified as of 2026-11-11.

## Core fields

| Field | Value |
|---|---|
| Name | Hock |
| Tagline | Borrow MUSD against your share of a BTC/MUSD liquidity position. |
| Category | LP collateral lending |
| Track | DeFi |
| Chain | Mezo Testnet (chain id 31611) |
| Live app | https://hock-preview.vercel.app |
| Testnet page | https://hock-preview.vercel.app/app/testnet/ |
| Repository | https://github.com/itachi-exe/hock |
| Deck | https://hock-preview.vercel.app/deck.pdf |
| Video | https://github.com/itachi-exe/hock/releases/download/submission-v1/hock-pitch.mp4 |
| Tech stack | Solidity, Foundry, Next.js, viem, MUSD, Mezo Pools (concentrated liquidity), CL gauge, Morpho on Mezo |

## Description

Liquidity providers on Mezo have BTC and MUSD sitting inside a staked liquidity position. That capital earns fees and rewards, but it cannot back a loan, because a lending market cannot take a staked position NFT as collateral. An LP who needs MUSD has to pull liquidity.

Hock pools BTC and MUSD into one staked Mezo concentrated-liquidity position and gives depositors ERC-20 shares. A Morpho market on Mezo accepts those shares as collateral, so a depositor can borrow MUSD at up to 77% loan to value and keep the position working. Repaying and exiting returns the BTC and MUSD.

Shares are priced from the BTC/USD and MUSD/USD feeds, never from the pool's spot price, and MUSD is never assumed to be one dollar. Stale, zero or future-dated prices revert. Deposits and harvests revert if spot drifts more than 5% from the fair price.

## What works today

- Seven contracts deployed and source-verified on Mezo Testnet.
- A real Morpho market with Hock shares as collateral and canonical testnet MUSD as the loan asset.
- The full cycle through the web app with a signing wallet: deposit, lock as collateral, borrow, repay in full, release collateral, withdraw. Transaction hashes are in the README.
- 32 contract tests and 74 app unit tests pass.
- A simulation mode for anyone without test funds.

## What does not, stated plainly

- The MUSD/USD price on testnet is our own labelled stand-in feed fixed at 1 USD, because Mezo's testnet Pyth MUSD feed is stale. The MUSD token is the canonical one and the BTC price is Mezo's real feed.
- One-click deposit and borrow does not fit Mezo's gas limits, so the app sends separate transactions.
- Each deposit opens its own staked position, capped at 8.
- Only the borrow page is on chain. Vault, Lend and Market pages are simulation.
- The only user so far is our own wallet. Not audited. No mainnet deployment.

## Why Mezo

Hock is built from Mezo's own parts: canonical MUSD, the BTC/MUSD concentrated-liquidity pool, the CL gauge with MEZO rewards, and the Morpho deployment on Mezo. It gives MUSD a new source of borrowing demand and lets pool liquidity stay in place while it backs credit.

## Business model

10% of harvested MEZO gauge rewards goes to the treasury. No deposit, withdraw or borrow fee. No revenue yet.

## Contracts

| Contract | Address |
|---|---|
| HockVault | 0x5600BDF9c5d6163D73b12e1312f708Cd8916E0c4 |
| HockOracle | 0x6691C934eD714E8403e89c5f0Be83bdBD964a6c9 |
| MezoCLAdapter | 0xF9Bd22C3593d5557f63d77D9642290A82fba09B5 |
| HockRouter | 0xB867956bD3Aeb65cD3587bB00eA29339f49E5884 |
| MezoPriceFeedAdapter | 0x8157deD1Bf3aA6d0E07212a125eE036A8170Dd37 |
| MezoSwapAdapter | 0x70cD55315ee37DD6528c89A3E4ad410f3F1bbd03 |
| TestnetFeed | 0xBA3818256D2D7E6a60aB9FdA9DBAF5018d81997c |

Morpho market id: 0x673871dad81694407421df4e1b333baf8a4d7b34a09c8b655f9259ac37c8f5cf

## Next milestones

1. Replace the stand-in MUSD feed with a live one.
2. Put the Vault and Lend pages on chain.
3. TWAP guard, security review, a real liquidation on testnet.
4. First outside users.

## Yours to fill

Team name and members, contact handle, and anything the form asks about eligibility. I did not guess these.

## Additional form fields

### TL;DR
Borrow canonical MUSD against ERC-20 shares of a staked BTC/MUSD liquidity position on Mezo, without unwinding the position.

### Target group
Mezo BTC/MUSD liquidity providers who want MUSD credit while keeping liquidity staked.

### How it works
Deposit BTC and MUSD into HockVault. The adapter adds and stakes concentrated liquidity. Supply the resulting vault shares as Morpho collateral, then borrow MUSD. Repay by debt shares, release collateral, and redeem the vault shares to exit.

### Status and readiness
Testnet MVP, with the borrow, repay and exit flow exercised through the deployed app. Not production ready or audited. Vault, Lend and Market remain simulation-only. The MUSD/USD testnet price is a labelled owner-updated stand-in feed.

### Updates in this wave
Built and deployed HockVault, the CL adapter, oracle, router, swap adapter and feeds on Mezo Testnet. Verified all seven contracts. Created a real Morpho market with canonical MUSD. Delivered the web app, then exercised deposit, borrow, repay and exit through the deployed URL. Added a public repository, an eight-slide deck and a 2:07 narrated pitch.
