#!/usr/bin/env python3
"""Watch a probe child process: sample RSS every 2s, report how it died.

Used to diagnose `omniroute/auto/*` probes dying with SIGKILL — is it memory
growth (OOM-ish), an external kill, or an early crash?
"""
import os
import signal
import subprocess
import sys
import time

model = sys.argv[1] if len(sys.argv) > 1 else "omniroute/auto/gemini"
env = {k: v for k, v in os.environ.items() if k not in ("NODE_CHANNEL_FD", "NODE_ENV")}
cmd = ["bun", "scripts/probe-live-tools.ts", model]

start = time.time()
p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
peak = 0
samples = []
while p.poll() is None:
    rss = 0
    try:
        with open(f"/proc/{p.pid}/statm") as fh:
            rss = int(fh.read().split()[1]) * (os.sysconf("SC_PAGE_SIZE") // 1024)
    except Exception:
        pass
    for child in os.listdir("/proc"):
        if not child.isdigit():
            continue
        try:
            with open(f"/proc/{child}/stat") as fh:
                parts = fh.read().rsplit(") ", 1)[1].split()
            if int(parts[1]) == p.pid:  # ppid == probe pid
                with open(f"/proc/{child}/statm") as fh:
                    rss += int(fh.read().split()[1]) * (os.sysconf("SC_PAGE_SIZE") // 1024)
        except Exception:
            pass
    peak = max(peak, rss)
    samples.append((round(time.time() - start, 1), rss))
    if time.time() - start > 180:
        p.kill()
        break
    time.sleep(2)

out = p.stdout.read() if p.stdout else ""
rc = p.returncode
dur = round(time.time() - start, 1)

print(f"model={model} elapsed={dur}s rc={rc} peak_rss={peak // 1024}MB")
if rc is not None and rc < 0:
    print(f"  died by signal {abs(rc)} ({signal.Signals(abs(rc)).name})")
print("  rss trace:", " ".join(f"{t}s:{m // 1024}M" for t, m in samples[-16:]))
tail = [ln for ln in out.splitlines() if ln.strip()][-6:]
for ln in tail:
    print("  |", ln[:180])
