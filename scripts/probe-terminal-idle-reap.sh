#!/usr/bin/env bash
# REQ-158 live proof: a full house of IDLE shells must not wedge the pane.
# 1) fill every live slot with untouched shells
# 2) wait past the spawn hand-back window
# 3) the next spawn must succeed (idle shells are handed back), and so must one more
set -u
cd /mnt/apopic/lokma
TK=$(HOME=/root bun scripts/mint-e2e-token.mjs 2>/dev/null | tail -1)
SID=$(curl -s "https://lokma.fermag.com.tr/api/sessions" -H "Authorization: Bearer $TK" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); s=[x for x in d.get('sessions',[]) if x.get('cwd')][:1]; print(s[0]['id'] if s else '')")
post() {
  curl -s -o /tmp/req158-spawn.json -w '%{http_code}' -X POST "https://lokma.fermag.com.tr/api/terminal" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' -d "{\"sessionId\":\"$SID\"}"
}
echo "== filling the live limit =="
for i in $(seq 1 12); do
  code=$(post)
  echo "spawn #$i -> $code $(head -c 90 /tmp/req158-spawn.json)"
  sleep 0.4
done
echo "== waiting 10m40s so every shell counts as idle =="
sleep 640
echo "== spawns after the idle window (both must succeed) =="
for i in 1 2; do
  code=$(post)
  echo "post-idle spawn #$i -> $code $(head -c 90 /tmp/req158-spawn.json)"
  sleep 0.6
done
