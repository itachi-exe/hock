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

## Phase 2a (2026-11-03): real adapters, router, fork tests. 15/15 phase 1 + 9/9 fork green

Run: `forge test` (15 pass, fork suite skipped) and `forge test --fork-url https://rpc.test.mezo.org --fork-block-number 16553087` (24 passed, 0 failed). Local commit only, nothing broadcast.

New files: `src/adapters/IMezo.sol`, `src/adapters/MezoCLAdapter.sol`, `src/adapters/MezoFeeds.sol` (MezoPriceFeedAdapter, PythFeedAdapter), `src/HockRouter.sol`, `test/HockFork.t.sol`.

Real addresses (Mezo testnet, chain 31611, read by RPC):
- NonfungiblePositionManager `0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062` (docs)
- BTC/MUSD CL pool `0xFe31b6033BCda0ebEc9FB789ee21bbc400175997`, tickSpacing 10, token0 = MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, token1 = BTC `0x7b7C000000000000000000000000000000000000`
- CLGauge `0x41271070bBCA4A5D4B0007093c64ADaB7aA8C05F` (EIP-1167 clone of impl `0x1aE1a27b709A5eb4BbcF7B7AA2c28620c593a3EE`), reward token MEZO `0x7B7c000000000000000000000000000000000001`
- Mezo PriceFeed `0x86bCF0841622a5dAC14A313a15f96A95421b9366` (proxy; underlying oracle precompile `0x7b7c...0015`)
- Pyth `0x2880aB155794e7179c9eE2e38200202908C17B43`, MUSD/USD id `0x0617a9b7...06c6de`
- Morpho Blue `0xCe1da828cA15cb1FDAfa84C366A53C8106655a73`, AdaptiveCurveIrm `0x0c97Fe017628636649ff374aD499529F91167441` (taken from two existing testnet markets), LLTV 0.77

Findings that shaped the code:
- The live CLGauge has only `deposit`, `withdraw`, `getReward`. There is NO `increaseStakedLiquidity` or `decreaseStakedLiquidity` (selectors absent from the implementation bytecode). The adapter hides unstake, change, restake, and holds the NFT (it implements `onERC721Received`).
- Pool order is token0 = MUSD, token1 = BTC; the vault convention is the reverse. The adapter flips amounts and inverts sqrt price (`2^96 * 1e18 / sqrtPriceX96`). Liquidity L is identical in both orderings.
- Position is a fixed range, ticks -190000..-30000 (about 20 to 180M MUSD per BTC), sqrt bounds hard-coded as constants from TickMath.
- NPM `mint` has no fee field: `(token0, token1, tickSpacing, tickLower, tickUpper, ...amounts, mins, recipient, deadline, sqrtPriceX96)`.

Tested on a fork (real NPM, pool, gauge, MUSD, Morpho, PriceFeed and Pyth code):
- spot sqrt within 5% of fair; both feed adapters read and scale to 1e18
- vault.deposit mints a real NFT, stakes it in the real gauge (NFT owned by gauge, `stakedContains` true), nothing stranded in the adapter
- second deposit (unstake, increaseLiquidity, restake) and partial withdraw (decrease, collect to vault, restake)
- getReward pulls MEZO from the gauge and forwards to the vault
- router: real `createMarket` on Morpho with HockOracle, a lender supplies, one tx deposits, posts shares as collateral and borrows 50k MUSD to the user; reverts with NotAuthorized if the user did not `setAuthorization`

Honest gaps:
- Fork caveats: BTC and MEZO are precompile tokens the local EVM cannot execute, so their code is replaced with a mock ERC-20 (`vm.etch`). The BTC oracle precompile under PriceFeed is mocked (`latestRoundData`, `fetchPrice`). The live testnet Pyth MUSD price is ~99 days old (publishTime 1785145687), so tests mock a fresh Pyth push. A real deploy needs someone to push Pyth MUSD/USD via Hermes `updatePriceFeeds`, or HockOracle reverts StalePrice for every user.
- Not tested live: real BTC precompile transfers, real PriceFeed `fetchPrice` path, real MEZO payout from the gauge (funded with mock MEZO), liquidation on the real Morpho (still the Phase 1 health-formula test).
- No real harvest swapper yet: harvest still uses the Phase 1 `ISwapper` (mock in tests). Needs a CL swap router adapter (testnet CLSwapRouter `0x3112908bB72ce9c26a321Eeb22EC8e051F3b6E6a`) and MEZO has no fair feed, so min-out stays 0.
- Adapter slippage mins are 0; protection is the vault's 2% (configurable) spot-vs-fair drift check, which runs before the add.
- Router has no repay-and-withdraw path yet; users exit via Morpho directly then `vault.withdraw`.
- Gauge `stakedLiquidity` was 0 at the fork block, so reward-per-day figures in tests are inflated (our deposit is the only staked liquidity).
- Rewards accrued before an unstake are held by the adapter until the next `getReward`, which forwards all of them.
