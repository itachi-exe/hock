# No-cost oracle options, November 6, 2026

Owner stopped to question Pyth API cost. No subscription purchase, free-trial enrollment or credential use authorized. Do not use the credential pasted in chat, copy it to files, or reproduce it. Owner advised to revoke it. No secret material is recorded here.

Fresh primary-source findings:

- https://docs.pyth.network/price-feeds/core/upgrade/preparing explicitly says Hermes requires an API key, a free trial is included, and paid plans cover ongoing usage. Do not describe it as an indefinitely free API. Trial eligibility, duration, payment-card requirements, current MUSD availability and actual account entitlement are unverified.
- https://mezo.org/docs/developers/architecture/oracles/read-oracle/ says native Skip supports BTC/USD only, so native BTC pricing does not replace Hock's MUSD/USD feed. Pyth deployed feeds are readable without an HTTP API key when already updated onchain.
- Read-only eth_call to getPriceUnsafe(MUSD/USD) on Mezo testnet via https://rpc.test.mezo.org, deployed Pyth address and exact feed id from PROGRESS.md, returned price_raw100270118 and publish time2026-07-27T09:48:07Z. At this check it was8831963 seconds old. No updates were broadcast. This feed still fails current-price acceptance.
- A guessed mainnet RPC hostname failed DNS, so no mainnet freshness conclusion is supported. Do not cite it as an onchain failure.
- Mezo docs list Stork/Supra, but no free current MUSD/USD feed on those providers has been established. Do not claim they are drop-in alternatives.

Recommended order:
1. No spend. Ask Mezo organizers for testnet MUSD feed maintenance or no-cost hackathon Pyth access. A current chain-maintained feed may remove the need for our own API subscription, but freshness must be verified continuously and the frontend must fail closed when stale.
2. If owner explicitly approves a no-charge trial with acceptable terms and a replacement key saved privately, test one current signed MUSD update against the actual verifier. A trial is a bounded hackathon route, not a free production architecture.
3. If neither is available, finish all independent frontend/contract integration and use an explicitly labelled TESTNET test-oracle deployment only if owner selects that tradeoff. A test feed proves transactions, not authentic market pricing or production readiness. Do not silently weaken current oracle contracts, assume MUSD=$1, or replace them with a manipulable spot quote. Any alternative production oracle needs separate design, coverage and risk verification.

Tonight's job should inspect this note and PROGRESS.md, continue safe independent work, and report only narrow remaining oracle/funding/production gates. Do not insist the owner buy Pyth as the only possible path.
