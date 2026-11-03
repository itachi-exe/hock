# Hock progress

## Phase 1 contracts (2026-11-03): done, forge test green (15/15)

Built in Foundry, local only (git init, no remote):
- src/HockVault.sol: ERC-20 share vault over one wide-range BTC/MUSD CL position staked in the gauge. deposit, withdraw, harvest (claims MEZO, 10% to treasury, rest swapped and compounded). Deposit and harvest revert if pool spot drifts from the fair price by more than 2% (sqrt scale).
- src/HockOracle.sol: Morpho IOracle. Values position amounts at the FAIR price (BTC/USD feed divided by MUSD/USD feed), never pool spot. Reverts on stale or zero feeds. MUSD is priced for real, no hard-coded $1.
- src/HockMath.sol: CL amount and liquidity math in 1e18 sqrt scale.
- test/mocks: mock pool plus gauge (no Mezo precompiles), swapper, feeds.

Tests cover: deposit shares at fair value, proportional second deposit, withdraw, harvest and compound with 10% fee, oracle price per share, spot manipulation up and down leaves oracle unchanged, manipulated spot blocks deposit and harvest, stale feed, MUSD depeg priced, zero price, price shock to liquidation at LLTV 0.77 (70% borrow liquidates after a 50% BTC crash, 50% borrow survives a 10% dip), spot-only crash does not liquidate.

## Known gaps for phase 2
- ICL is an abstraction. Phase 2 needs a real adapter over the Mezo CL NonfungiblePositionManager and CLGauge (stake, increaseStakedLiquidity, decrease, getReward) and real PriceFeed and Pyth adapters. Addresses in IDEAS.md.
- Harvest swap min-out is 0 (MEZO has no fair feed). Small value, but flag it in the README.
- HockRouter (one-tx deposit, post collateral, borrow) not written yet.
- Morpho Blue itself is not in the unit tests: liquidation is checked with Morpho's health formula against oracle.price(). Phase 2 runs the real market on testnet.
- Morpho market must use LLTV 0.77 (only enabled value on testnet).
