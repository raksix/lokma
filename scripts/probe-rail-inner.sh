#!/usr/bin/env bash
# Inner worker: mints a token, runs the REQ-140 live prompt-rail probe, logs everything.
set -uo pipefail
cd /mnt/apopic/lokma
exec > /root/probe-rail-run.log 2>&1
echo "start $(date -Is)"
TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
echo "token: ${TK:0:24}…"
NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-prompt-rail.cjs \
  --url https://lokma.fermag.com.tr --token "$TK"
echo "probe exit: $?"
echo "done $(date -Is)"
