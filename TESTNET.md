# Hock on Mezo Testnet (chain 31611)

Contracts (deployed from a throwaway testnet key):

| Contract | Address |
|---|---|
| HockVault | 0x5600BDF9c5d6163D73b12e1312f708Cd8916E0c4 |
| HockOracle | 0x6691C934eD714E8403e89c5f0Be83bdBD964a6c9 |
| MezoCLAdapter | 0xF9Bd22C3593d5557f63d77D9642290A82fba09B5 |
| HockRouter (deployed, not used by the UI) | 0xB867956bD3Aeb65cD3587bB00eA29339f49E5884 |
| TestnetFeed (stand-in MUSD price, not a market price) | 0xBA3818256D2D7E6a60aB9FdA9DBAF5018d81997c |

Proven on chain and through the UI with a real signing wallet: connect, deposit, lock as collateral, borrow, repay, exit.

Known limits:
- Mezo's gas estimator under-reports the vault's staking calls, so the UI sends an explicit gas limit.
- A second deposit into an existing staked position fails on Mezo for a reason we did not pin down. Each deposit opens its own position instead (max 8).
- HockRouter's one-click deposit and borrow reverts on Mezo, so the UI sends the steps separately.
- Mezo's own MUSD price feed is stale, so the market uses a labelled TestnetFeed.
- The simulation mode is the default demo; testnet mode is behind the top-bar toggle.

## Keeper

`keeper/feed-keeper.sh` refreshes the TestnetFeed when it is older than 6h (the oracle rejects prices older than 24h). Run it from cron with the deployer key in the environment.
