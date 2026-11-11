#!/usr/bin/env bash
# Refreshes the labelled TestnetFeed (MUSD = 1 USD) when it is older than 6 hours. Run from cron.
# Needs DEPLOYER_PRIVATE_KEY in the environment (never commit it).
set -euo pipefail
R=${RPC:-https://rpc.test.mezo.org}; F=${FEED:-0xBA3818256D2D7E6a60aB9FdA9DBAF5018d81997c}
age=$(( $(date +%s) - $(cast call "$F" 'updatedAt()(uint256)' --rpc-url "$R" | awk '{print $1}') ))
if [ "$age" -gt 21600 ]; then cast send "$F" 'set(uint256)' 1000000000000000000 --gas-limit 300000 --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$R" | grep -E '^status'; else echo "fresh (${age}s old)"; fi
