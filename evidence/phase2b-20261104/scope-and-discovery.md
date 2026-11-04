# Phase 2b bounded scope and discovery

Runtime model: gpt-6.1-sol through custom:agentrouter, from the current session context.
Environment session identifier: 20261104_004119_17bb1f. A child-specific identifier is not separately exposed.
Baseline HEAD: 9d4b21b5e0972c4709f448df0d62d4238711e31b. Clean tree, no git remote. Baseline rerun: 15 local and 24 fork tests pass at block 16553087.

Inspected before edits: all src contracts, both test suites, test/mocks/Mocks.sol, foundry.toml, PROGRESS.md, IDEAS.md, RULES.md, oracle and pool source docs. Affected callers: HockVault.deposit/harvest, HockOracle.fairPrice/price/totalValue, HockRouter.depositAndBorrow, PythFeedAdapter.latest, both suites and new regression fixtures. Morpho price() remains an external view returning uint256.

Ranked hypotheses and observations:
1. Staleness is caused by a missing pull-update call, not time passing. The real feed returns publishTime 1785145687. Existing fork tests mock getPriceUnsafe. A paid update must precede every valuation in the payable route.
2. Public payload acquisition is currently an authorization gate. hermes.pyth.network, hermes-beta.pyth.network and benchmarks.pyth.network each return HTTP 401 unauthorized. Current official docs confirm the August 26, 2026 API-key requirement. No credentials, registrations or spending are permitted here.
3. Historic public updates may be available from testnet transaction calldata, but the current verifier was upgraded. Testnet logs show a new implementation, wormhole receiver and allowed data source on August 26. Historic evidence must never be labelled current integration success.
4. Harvest accepts untrusted minima and does not inspect received output. Removing the no-argument path and limiting minima to the immutable deploying owner as keeper closes the caller trust boundary. Actual per-leg balance deltas must enforce minima, not a swapper's return value.
5. CL routing is tick-spacing based, not a Uniswap fee ABI. The verified deployed CLSwapRouter source has exactInputSingle((address,address,int24,address,uint256,uint256,uint256,uint160)) and exactInput((bytes,address,uint256,uint256,uint256)). PoolAddress orders token addresses; Path encodes token/3-byte int24/token. No new library is needed.

Implementation boundaries: native file tools, one writer, sequential tests, no commits, queue edits, .env reads, wallets, signing, broadcasts, mainnet, public deployment, agents, browser or servers. Tests gate available RAM at 1500 MB. Exact fees may be required; rejecting excess value atomically is safe and avoids native currency sinks and refund callbacks.

Fetched source/provenance:
- https://api.explorer.test.mezo.org/api/v2/smart-contracts/0x3112908bB72ce9c26a321Eeb22EC8e051F3b6E6a
- https://api.explorer.test.mezo.org/api/v2/addresses/0x2880aB155794e7179c9eE2e38200202908C17B43/logs
- https://docs.pyth.network/price-feeds/core/how-pyth-works/hermes
- https://docs.pyth.network/price-feeds/core/upgrade/preparing

The RPC requires a browser-style User-Agent for Python HTTP requests. The pool probe's first 403 was retained in tool output, and the explicit User-Agent corrected the read-only probe.
