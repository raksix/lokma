import type { FastifyInstance } from 'fastify';
import { SessionStore, UsageLedger } from 'lokma-core';

/**
 * Usage — real token/cost accounting for the Usage pane (W2-7).
 * The WS handler records one ledger line per completed run
 * (`~/.lokma/projects/<hash>/usage.jsonl`); these endpoints read it:
 * `GET /api/usage/summary` (KPIs + stacked series + per-model split),
 * `GET /api/usage/sessions` (per-session rows joined with session titles),
 * `GET /api/usage/export` (real CSV/JSONL download, not a toast).
 * Tokens are estimated (`ceil(chars/4)`) and costed from the core price
 * table — unpriced models report costUsd 0 + `priced: false`.
 * See Docs/22 §usage.
 */

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

function parseRange(raw: unknown): number | null {
  if (raw === undefined) return 7;
  if (typeof raw !== 'string') return null;
  return RANGE_DAYS[raw] ?? null;
}

function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/usage/summary', async (req, reply) => {
    const rangeDays = parseRange((req.query as { range?: unknown })?.range);
    if (rangeDays === null) {
      return reply
        .status(400)
        .send({ code: 'bad_range', message: 'range must be one of 7d, 30d, 90d' });
    }
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const ledger = new UsageLedger(cwd);
    const summary = await ledger.summarize(rangeDays);
    return { ok: true, range: `${rangeDays}d`, summary };
  });

  app.get('/api/usage/sessions', async (req, reply) => {
    const rangeDays = parseRange((req.query as { range?: unknown })?.range);
    if (rangeDays === null) {
      return reply
        .status(400)
        .send({ code: 'bad_range', message: 'range must be one of 7d, 30d, 90d' });
    }
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const ledger = new UsageLedger(cwd);
    const store = new SessionStore(cwd);
    const [entries, summaries] = await Promise.all([
      ledger.read(Date.now() - rangeDays * 86_400_000),
      store.listSummaries(),
    ]);
    const titles = new Map(summaries.map((s) => [s.id, s] as const));

    const perSession = new Map<
      string,
      { runs: number; tokens: number; costUsd: number; lastActive: string; model: string }
    >();
    for (const e of entries) {
      const agg = perSession.get(e.sessionId) ?? {
        runs: 0,
        tokens: 0,
        costUsd: 0,
        lastActive: e.ts,
        model: e.model,
      };
      agg.runs += 1;
      agg.tokens += e.inputTokens + e.outputTokens;
      agg.costUsd += e.costUsd;
      if (e.ts > agg.lastActive) {
        agg.lastActive = e.ts;
        agg.model = e.model;
      }
      perSession.set(e.sessionId, agg);
    }

    const sessions = [...perSession.entries()]
      .map(([sessionId, agg]) => ({
        sessionId,
        title: titles.get(sessionId)?.title ?? sessionId,
        model: agg.model,
        runs: agg.runs,
        tokens: agg.tokens,
        costUsd: agg.costUsd,
        lastActive: agg.lastActive,
      }))
      .sort((a, b) => (a.lastActive < b.lastActive ? 1 : -1));
    return { ok: true, range: `${rangeDays}d`, sessions, count: sessions.length };
  });

  app.get('/api/usage/export', async (req, reply) => {
    const query = req.query as { range?: unknown; format?: unknown; cwd?: string };
    const rangeDays = parseRange(query.range);
    if (rangeDays === null) {
      return reply
        .status(400)
        .send({ code: 'bad_range', message: 'range must be one of 7d, 30d, 90d' });
    }
    if (query.format !== 'csv' && query.format !== 'jsonl') {
      return reply
        .status(400)
        .send({ code: 'bad_format', message: 'format must be csv or jsonl' });
    }
    const cwd = query.cwd ?? process.cwd();
    const ledger = new UsageLedger(cwd);
    const entries = await ledger.read(Date.now() - rangeDays * 86_400_000);

    const filename = `lokma-usage-${rangeDays}d.${query.format}`;
    if (query.format === 'jsonl') {
      const body = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
      return reply
        .header('Content-Type', 'application/x-ndjson')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(body);
    }
    const header = 'ts,session_id,provider,model,input_tokens,output_tokens,cost_usd,priced';
    const rows = entries.map((e) =>
      [
        e.ts,
        e.sessionId,
        e.provider,
        e.model,
        e.inputTokens,
        e.outputTokens,
        e.costUsd.toFixed(6),
        e.priced,
      ]
        .map(csvCell)
        .join(','),
    );
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send([header, ...rows].join('\n') + '\n');
  });
}
