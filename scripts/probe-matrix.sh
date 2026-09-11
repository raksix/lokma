#!/usr/bin/env bash
# Model matrix probe — does native tool calling actually work on every model
# a user can pick in lokma? Runs `probe-live-tools.ts` once per model, writes
# one JSON object per line to /tmp/lokma-matrix.jsonl, and prints a table.
#
# Usage: bash scripts/probe-matrix.sh [model ...]
#   (no args = the built-in matrix below)
set -u
cd "$(dirname "$0")/.." || exit 1

OUT=/tmp/lokma-matrix.jsonl
: > "$OUT"

DEFAULT_MATRIX=(
  # commandcode (the new default provider, 69 models)
  "commandcode/deepseek/deepseek-v4.1-flash"
  "commandcode/deepseek/deepseek-v4-pro"
  "commandcode/deepseek/deepseek-v4-flash"
  "commandcode/claude-sonnet-5"
  "commandcode/claude-opus-5"
  "commandcode/claude-haiku-4-5-20251001"
  "commandcode/google/gemini-3.5-flash"
  "commandcode/google/gemini-3.7-flash"
  "commandcode/Qwen/Qwen3.7-Flash"
  "commandcode/Qwen/Qwen3.8-Max"
  "commandcode/MiniMaxAI/MiniMax-M2.7"
  # omniroute (1066 models, the aggregator)
  "omniroute/auto/best-free"
  "omniroute/auto/best-coding"
  "omniroute/auto/best-chat"
  "omniroute/auto/gemini"
  "omniroute/cmd/Qwen/Qwen3.7-Flash"
  "omniroute/claude-web/claude-sonnet-4-6"
  "omniroute/lmarena/claude-sonnet-5"
  "omniroute/deepseek-web/deepseek-v4-flash"
  "omniroute/gemini-web/gemini-3.5-flash"
  "omniroute/free-opencode"
  # opencode-go (monthly limit reached at the time of writing)
  "opencode-go/deepseek-v4-flash"
  "opencode-go/mimo-v2.5"
  "opencode-go/muse-spark-1.3-contributor"
)

if [ "$#" -gt 0 ]; then
  MODELS=("$@")
else
  MODELS=("${DEFAULT_MATRIX[@]}")
fi

printf '%-46s %-6s %-6s %-8s %s\n' MODEL VERDICT TOOLS SECS DETAIL
for m in "${MODELS[@]}"; do
  t0=$(date +%s)
  raw=$(env -u NODE_CHANNEL_FD -u NODE_ENV timeout 150 bun scripts/probe-live-tools.ts "$m" 2>&1)
  code=$?
  t1=$(date +%s)
  secs=$((t1 - t0))

  tools=$(printf '%s' "$raw" | grep -oE 'tool calls: [0-9]+' | tail -1 | grep -oE '[0-9]+')
  [ -z "$tools" ] && tools=$(printf '%s' "$raw" | grep -oE 'tool_start x[0-9]+' | tail -1 | grep -oE '[0-9]+')
  [ -z "$tools" ] && tools=0

  if [ "$code" -eq 0 ]; then
    verdict=PASS
    detail=$(printf '%s' "$raw" | grep -E '^live probe' | tail -1)
  else
    verdict=FAIL
    detail=$(printf '%s' "$raw" | grep -oE '(ProviderError: .*|Error: .*|FAIL: .*)' | tail -1 | cut -c1-110)
  fi
  [ -z "$detail" ] && detail="exit=$code"

  printf '%-46s %-6s %-6s %-8s %s\n' "$m" "$verdict" "$tools" "${secs}s" "$detail"

  python3 - "$m" "$verdict" "$tools" "$secs" "$detail" <<'PY' >> "$OUT"
import json, sys
m, v, t, s, d = sys.argv[1:6]
print(json.dumps({'model': m, 'verdict': v, 'tools': int(t or 0), 'secs': int(s or 0), 'detail': d}, ensure_ascii=False))
PY
  sleep 2
done
echo "matrix written: $OUT ($(wc -l < "$OUT") rows)"
