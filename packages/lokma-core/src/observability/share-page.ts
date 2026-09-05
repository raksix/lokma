import type { AgentTrace } from './trace.js';
import type { SessionSnapshot, ShareRecord } from './share.js';

/**
 * Public share page renderer — self-contained HTML for one frozen snapshot.
 * `GET /share/:token` serves this with zero external assets (inline CSS +
 * system fonts), so the link works for anyone with the unguessable token —
 * no login, no JS, no CDN. Every interpolated byte goes through `escapeHtml`
 * (titles and transcripts are user-controlled; the probe asserts an
 * injected `<script>` renders inert).
 * Style tokens match the harness: cream #FAF9F5, terracotta #C96442.
 * See Docs/36 §sharing.
 */

/** Rows rendered before the cap note (keeps giant transcripts fast). */
export const SHARE_PAGE_MAX_ROWS = 500;

/** Escape text for HTML element and double-quoted attribute contexts. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function roleBadge(role: string): string {
  if (role === 'user') return 'background:#C96442;color:#fff;border-color:#C96442';
  if (role === 'tool') return 'background:#3f3f46;color:#fff;border-color:#52525b';
  return 'background:#fff;color:#52525b;border-color:#E8E4DE';
}

function agentBody(trace: AgentTrace): string {
  const rows = trace.events
    .slice(0, SHARE_PAGE_MAX_ROWS)
    .map(
      (ev) =>
        `<li class="row"><span class="time">${escapeHtml(ev.ts)}</span>` +
        `<span class="badge">${escapeHtml(ev.kind)}</span>` +
        `<span class="text">${escapeHtml(ev.label)}${ev.detail ? ` — ${escapeHtml(ev.detail)}` : ''}</span></li>`,
    )
    .join('');
  const tail =
    trace.events.length > SHARE_PAGE_MAX_ROWS
      ? `<p class="more">… ${trace.events.length - SHARE_PAGE_MAX_ROWS} more events (open the agent for the full timeline)</p>`
      : '';
  const locks =
    trace.locks.length > 0
      ? `<p class="meta">Locks at freeze: ${trace.locks.map((l) => `<code>${escapeHtml(l.path)}</code>`).join(' ')}</p>`
      : '';
  return `<ol class="timeline">${rows}</ol>${tail}${locks}`;
}

function excerpt(content: string, cap = 2000): { text: string; cut: boolean } {
  if (content.length <= cap) return { text: content, cut: false };
  return { text: content.slice(0, cap), cut: true };
}

function sessionBody(snapshot: SessionSnapshot): string {
  const rows = snapshot.messages
    .slice(0, SHARE_PAGE_MAX_ROWS)
    .map((m) => {
      const { text, cut } = excerpt(m.content);
      return (
        `<li class="row"><span class="badge" style="${roleBadge(m.role)}">${escapeHtml(m.toolName ?? m.role)}</span>` +
        `<span class="text"><span class="time">${escapeHtml(m.timestamp)}</span> ${escapeHtml(text)}${cut ? ' … (truncated for the share page)' : ''}</span></li>`
      );
    })
    .join('');
  const tail =
    snapshot.count > SHARE_PAGE_MAX_ROWS
      ? `<p class="more">… ${snapshot.count - SHARE_PAGE_MAX_ROWS} more rows (open the session for the full transcript)</p>`
      : '';
  const model = snapshot.model ? `<p class="meta">Model at freeze: <code>${escapeHtml(snapshot.model)}</code></p>` : '';
  return `<ol class="transcript">${rows}</ol>${tail}${model}`;
}

function errorBody(code: string, message: string): string {
  return `<div class="error"><h2>${escapeHtml(code)}</h2><p>${escapeHtml(message)}</p></div>`;
}

/**
 * Render the full public page. `record` null renders the same chrome with a
 * 404 body (so unknown tokens get branded HTML, not a JSON blob).
 */
export function renderShareHtml(record: ShareRecord | null): string {
  const title = record ? record.title : 'Share not found';
  const kind = record ? record.kind : 'missing';
  const count = record
    ? record.kind === 'agent'
      ? (record.snapshot as AgentTrace).events.length
      : (record.snapshot as SessionSnapshot).count
    : 0;
  const unit = record ? (record.kind === 'agent' ? 'events' : 'rows') : '';
  const frozen = record ? record.createdAt : '';
  const body = !record
    ? errorBody('share_not_found', 'This share link does not exist — it may have been deleted.')
    : record.kind === 'agent'
      ? agentBody(record.snapshot as AgentTrace)
      : sessionBody(record.snapshot as SessionSnapshot);
  const desc = record
    ? `Frozen Lokma ${kind} share — ${count} ${unit}, captured ${frozen}`
    : 'Unknown Lokma share link';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Lokma share</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:title" content="${escapeHtml(title)} — Lokma share">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:type" content="article">
<style>
:root{color-scheme:light}
body{margin:0;background:#FAF9F5;color:#262624;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:32px 20px 64px}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;letter-spacing:.02em;color:#C96442;text-transform:uppercase}
h1{font-size:26px;line-height:1.25;margin:12px 0 4px;overflow-wrap:anywhere}
.sub{color:#71717a;font-size:12px;margin:0 0 20px}
.sub code{background:#fff;border:1px solid #E8E4DE;border-radius:4px;padding:0 5px;font-size:11px}
ol{list-style:none;margin:0;padding:0}
.row{display:flex;gap:10px;align-items:baseline;background:#fff;border:1px solid #E8E4DE;border-radius:8px;padding:8px 12px;margin:0 0 8px}
.time{color:#a1a1aa;font-size:11px;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.badge{font-size:10px;font-weight:600;border:1px solid #E8E4DE;border-radius:4px;padding:1px 6px;white-space:nowrap;background:#F2F0EB;color:#52525b}
.text{flex:1;min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
.meta{color:#71717a;font-size:12px}
.meta code{background:#fff;border:1px solid #E8E4DE;border-radius:4px;padding:0 5px}
.more{color:#71717a;font-size:12px}
.error{background:#fff;border:1px solid #E8E4DE;border-radius:12px;padding:32px;text-align:center}
.error h2{margin:0 0 8px;font-size:20px}
.error p{margin:0;color:#71717a}
footer{margin-top:32px;padding-top:16px;border-top:1px solid #E8E4DE;color:#a1a1aa;font-size:12px}
footer a{color:#C96442}
</style>
</head>
<body>
<main class="wrap">
<div class="brand">Lokma share</div>
<h1>${escapeHtml(title)}</h1>
<p class="sub">${record ? `Frozen <code>${escapeHtml(kind)}</code> snapshot · ${count} ${escapeHtml(unit)} · captured ${escapeHtml(frozen)} · later edits never rewrite shared history` : 'Unknown link'}</p>
${body}
<footer>A read-only snapshot from the Lokma harness. <a href="/">Open Lokma</a></footer>
</main>
</body>
</html>`;
}
