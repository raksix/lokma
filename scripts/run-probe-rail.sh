#!/usr/bin/env bash
# One-shot runner for the REQ-140 live prompt-rail probe.
set -uo pipefail
cd /mnt/apopic/lokma
TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
echo "token: ${TK:0:24}…"
NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-prompt-rail.cjs \
  --url https://lokma.fermag.com.tr --token "$TK"
echo "probe exit: $?"
