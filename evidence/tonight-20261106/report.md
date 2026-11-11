# Hock mock build evidence, November 6, 2026

## Delivered

Replaced the illustrative-only `/app/` calculator with an interactive local scenario built directly on `web/app/mock-market.mjs`. The workspace is clearly marked Demo mode and explains that every balance is fictional MUSD-equivalent. It supports deposit, borrow, repay, withdraw, amount limits, pending and success messages, actionable validation errors, an empty position state, and reset. The layout continues the existing Hock and Ithaca-led visual direction. The landing page was not replaced. The demo makes no wallet, API, RPC or chain calls and creates no transaction hash or receipt.

## Verified

- `npm test`: 28 passed.
- `npm run build`: production static export passed.
- `frontend_verify.py`: 12/12 checks passed on source.
- `/opt/hermes/.foundry/bin/forge test --no-match-contract '.*ForkTest' -v`: 32 passed, 0 failed, 0 skipped.
- `git diff --check`: clean.
- Real Chromium CDP interactions: deposited 1,000, borrowed 400, repaid 100, withdrew 100, got an over-limit borrow error, then reset all balances.
- Browser geometry: no horizontal overflow at 320, 375, 768, 1280 and 1440 pixels.
- Screenshots: `app-desktop.png` (1440 by 1200), `app-phone.png` (390 by 1100). Interaction output: `browser-interactions.json`.

## Still pending

Vision review could not run because its Gemini free-tier route returned HTTP429. Screenshots are saved; artistic approval is not claimed. The public preview was not deployed or pushed, so its URL still serves the previous version. Real oracle/API access, funded testnet, actual contract interaction and live-market status remain deferred and are not represented by this mock.

The mock adapter is not a production market integration contract. Confirm interface and business rules against the eventual API before replacing it.
