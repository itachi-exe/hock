# Hock web app

Next.js static export. Node 22.

```
npm ci
npm test
npm run build
```

The export is written to `out/`.

- `/` landing page
- `/app/` simulation: in-memory deposit, borrow, repay and withdraw with fictional values. No wallet, no chain.
- `/app/testnet/` the real thing on Mezo Testnet (chain 31611): connect a wallet, deposit and borrow, repay, exit.

Chain wiring lives in `app/app/chain-context.jsx` and `app/chain/`. Contract addresses are in `app/chain/deployed.json`.

## Live end-to-end run

`e2e/testnet-live.mjs` drives `/app/testnet/` in a headless browser with a real signing wallet and runs the whole cycle on chain. It spends test BTC and needs test MUSD in the wallet. It also needs `puppeteer` installed.

```
DEPLOYER_PRIVATE_KEY=0x... node e2e/testnet-live.mjs http://127.0.0.1:47311 0.0002
```
