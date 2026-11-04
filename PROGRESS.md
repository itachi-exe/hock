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

## Phase 2b checkpoint (2026-11-04): partial, authenticated Pyth integration blocked

The queue item remains pending. Nothing was broadcast, deployed or pushed, and no wallet or credential file was read. The prior phase 2a gaps above describe the historical baseline, not the checkpoint's new harvest implementation.

Implemented locally:
- Payable router and vault deposit overloads accept `bytes[] priceUpdate`. The oracle updates the Pyth adapter before valuation and drift checks; the adapter obtains `getUpdateFee` and forwards exactly that fee to `updatePriceFeeds`. Wrong fees and value with an empty update revert atomically, rather than retaining or refunding currency. Morpho's `price()` remains a view with the same selector; stale, zero and future-dated feeds still fail closed.
- The router requires the market's oracle to match the vault's oracle, so updating one feed cannot leave Morpho checking a different oracle.
- `MezoSwapAdapter` executes the deployed tick-spacing-based CLSwapRouter's `exactInput` routes: MEZO -> MUSD at spacing 50, and MEZO -> MUSD -> BTC with spacing 50 then 10. Invalid routes, zero amounts/minima, incomplete input consumption, false token returns and short actual receipts revert.
- Unbounded `harvest()` was removed. Only the deploying owner is the keeper allowed to choose both strictly positive per-leg minima. The vault enforces actual receipt deltas on both legs, not a swapper's claimed return or existing idle balances. Drift is checked before swapping and again before compounding.

Parent verification after the specialist stopped:
- `/opt/hermes/.foundry/bin/forge test --no-match-contract '.*ForkTest' -v`: 32 passed, 0 failed. All 15 original phase 1 tests remained present and passing.
- `/opt/hermes/.foundry/bin/forge test --fork-url https://rpc.test.mezo.org --fork-block-number 16553087 -vv`: 45 passed, 0 failed, 0 skipped. This is 32 local tests plus 9 original fork tests and 4 new swap/harvest fork tests, not 45 independent live-chain executions. All 24 original combined baseline tests remained green.
- Parent initially reproduced 3 failures in the new fork assertions. The chosen public test address already held 0.1 MUSD at this block; assertions now compare actual deltas or preserved pre-existing balances instead of assuming zero. Canonical MUSD and the pool/router code were not replaced to hide that failure.
- Real deployed router output on the fork: 1 MEZO -> 944537522666152112 MUSD wei, and 1 MEZO -> 11982702665777 BTC wei. Real NPM/gauge harvest compounded a 99189391244091073 MEZO-wei reward, increasing liquidity by 155462898532118. Both routes enforce impossible output minima with atomic rollback.
- `git diff --check` and the added-line static security scan passed. The parent reviewed all changed contracts, new files and affected callers. ABI inspection confirmed `harvest(uint256,uint256,bytes[])`, paid deposit/router overloads, and unchanged Morpho `price()`.

Integration caveats and remaining gate:
- BTC and MEZO are chain precompiles that the local EVM cannot execute. Swap fork fixtures replace only their code and restore the original pool token balances from read-only RPC evidence. Canonical MUSD, router, pools, NPM and gauge are real fork state. The harvest fork test uses mock pricing feeds. Original fork pricing seams and unit `MockPyth` do not prove authenticated Pyth updates.
- Main Hermes, beta Hermes and Pyth Benchmarks returned HTTP 401. Official Pyth upgrade documentation confirms that every Hermes user needs an API key after the August 26, 2026 upgrade. Registering for an account or handling a new credential is outside this run's approval. No genuine Hermes payload could be fetched, so no authenticated current deployed Pyth update passed. Public historical explorer calldata also reverted on the current verifier (`0x2acbe915`); it is not a substitute for the required current payload.
- Only itachi can authorize/provide Pyth API access. Resume by fetching and retaining a genuine MUSD/USD update for `0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de`, its exact request URL, publish time, payload hash and fork timestamp, then execute it against the unmocked deployed Pyth verifier before deposit/borrow. Keep the staleness check strict. Do not mark phase 2b complete until this gate passes.

Evidence was preserved in `hock/evidence/phase2b-20261104/` (55 source artifacts plus a SHA-256 manifest), so it survives scratch pruning. Full discovery work remains at `/opt/hermes/.hermes/cache/scratch/hock-phase2b-20261104/`. The retained set includes paired RED/GREEN logs, `parent-local.log`, `parent-real-swap-fork-red.log`, `parent-full-fork-green.log`, `baseline-preservation.json`, `parent-review.json`, pool snapshots and HTTP 401 headers/bodies.

Specialist failure: session `20261104_004119_17bb1f`, transcript `/opt/hermes/.hermes/cache/delegation/live/deleg_5e897497/task-0.log`. Recorded usage lists 121 calls on `gpt-6.1-sol` through `custom:agentrouter`; the completion attempt failed on the permitted Gemini fallback with HTTP 429 daily quota exhaustion. The child did not return a valid completion or update this log. Dollar cost is unavailable (`cost_status=unknown`), not zero. The parent recovered and independently tested the files; no blocked model was retried and Anthropic remained paused.

Skills loaded: task-model-routing, server-access, hermes-agent, ponytail, test-driven-development, systematic-debugging, evm-chain-onboarding, hackathon-winning, requesting-code-review, ponytail-review, agent-cost-and-token-accounting.
