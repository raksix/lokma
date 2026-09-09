import type { FastifyInstance } from 'fastify';
import { cpus, freemem, totalmem } from 'node:os';

/**
 * GET /health — liveness probe for PM2/nginx.
 * No auth, no DB — just proves the process is up.
 *
 * GET /api/metrics — real host numbers for the REQ-018 status bar:
 * lokma version, server uptime, system CPU % (delta between polls —
 * `null` on the very first sample, never a fake 0), system memory
 * used/total, and the server process RSS/heap. No auth, no secrets.
 */

const VERSION = '0.1.0';

type CpuSnapshot = { idleMs: number; totalMs: number };

let prevCpu: CpuSnapshot | null = null;

function sampleCpu(): CpuSnapshot {
  let idleMs = 0;
  let totalMs = 0;
  for (const cpu of cpus()) {
    const t = cpu.times;
    idleMs += t.idle;
    totalMs += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idleMs, totalMs };
}

/**
 * System CPU % since the previous call. The first call only seeds the
 * baseline and returns null — callers render a placeholder, not 0%.
 */
function cpuPercentSinceLast(): number | null {
  const now = sampleCpu();
  const prev = prevCpu;
  prevCpu = now;
  if (!prev) return null;
  const idleDelta = now.idleMs - prev.idleMs;
  const totalDelta = now.totalMs - prev.totalMs;
  if (totalDelta <= 0) return null;
  const pct = (1 - idleDelta / totalDelta) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return { ok: true, service: 'lokma-server', version: VERSION, uptime: process.uptime() };
  });

  app.get('/api/health', async () => {
    return { ok: true, service: 'lokma-server', version: VERSION };
  });

  app.get('/api/metrics', async () => {
    const totalBytes = totalmem();
    const usedBytes = totalBytes - freemem();
    const mem = process.memoryUsage();
    return {
      version: VERSION,
      uptimeSec: Math.floor(process.uptime()),
      cpuPercent: cpuPercentSinceLast(),
      memory: { totalBytes, usedBytes },
      process: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed },
    };
  });
}
