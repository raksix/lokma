/**
 * TunnelPane — the Share/tunnel settings surface (REQ-193 Kapsam 4).
 *
 * This is the PANEL half of the tunnel feature: slice 6 wrote the server
 * module + three routes, slice 7 the CLI. Both of those could report an honest
 * "nothing is running, here is the install command" while the panel had no
 * surface at all — the user asking "is my box reachable from outside?" had
 * nowhere to look. This pane is the only consumer of
 * `GET/POST /api/cloud/tunnel`, and it is deliberately thin:
 *
 *   - the STATE shown is the server's, never a client-side guess;
 *   - the URL shown is the one the provider printed — see `displayUrl()` in
 *     ./tunnel.ts, which returns null on every branch that has no real url;
 *   - a refusal renders the server's `installHint` FIELD as a copyable line
 *     (slice 7's rule), not a sentence the pane re-parses;
 *   - a failed start re-reads the status instead of trusting its own copy, so a
 *     501/400 renders as what the server actually said.
 *
 * Renders inside the Settings modal's `Share` section (REQ-193 slice 8).
 */
import * as React from 'react';
import { AlertTriangle, Copy, ExternalLink, Globe, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError, type TunnelStatusRes } from '@/lib/api';
import { displayUrl, expiryLine, formatStamp, installHint, isLive, portPayload, stateView } from './tunnel';

/** Read a refused start's install command off the error the route sent. */
function hintFromError(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const details = err.details as { installHint?: unknown } | undefined;
  const hint = typeof details?.installHint === 'string' ? details.installHint.trim() : '';
  return hint === '' ? null : hint;
}

/** The refusal sentence: the server's field when present, else its message. */
function reasonFromError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : 'The tunnel request failed.';
}

export function TunnelPane() {
  const [status, setStatus] = React.useState<TunnelStatusRes | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [port, setPort] = React.useState('');
  const mounted = React.useRef(true);

  // `keepError` is the fix for a race measured on this pane: the refusal path
  // set the error and then re-read the status, and that re-read cleared it —
  // so a failed Start showed the state row and NO reason (the pane looked like
  // it had done nothing). The re-read now only refreshes state/hint.
  const load = React.useCallback(async (keepError = false) => {
    try {
      const res = await api.getTunnelStatus();
      if (!mounted.current) return;
      setStatus(res);
      setHint(res.installHint ?? null);
      if (!keepError) setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(reasonFromError(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const run = async (action: 'start' | 'stop') => {
    setBusy(true);
    setCopied(false);
    try {
      const res =
        action === 'start' ? await api.startTunnel(portPayload(port)) : await api.stopTunnel();
      if (!mounted.current) return;
      setStatus(res);
      setHint(res.installHint ?? null);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      // A refusal is not a thrown-away state: show the server's sentence AND
      // its install command, then re-read the status so the state row tells the
      // truth about what is actually running.
      setError(reasonFromError(e));
      setHint(hintFromError(e) ?? hint);
      void load(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const live = isLive(status);
  const url = displayUrl(status);
  const row = stateView(status?.state);
  const install = live ? null : (hint ?? installHint(status));
  const expires = expiryLine(status);

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      if (mounted.current) setCopied(true);
    } catch {
      // Clipboard denied (no permission / insecure origin): the url stays
      // selectable text, so the failure needs no second error line.
    }
  };

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex items-start gap-2">
        <Globe className="mt-0.5 h-4 w-4 shrink-0 text-terracotta" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-medium">Share this box</div>
          <div className="text-xs text-zinc-500">
            Publishes this install on the internet through an installed tunnel provider
            (<span className="font-mono">cloudflared</span> / <span className="font-mono">ngrok</span>)
            or the configured relay. Anyone with the url can sign in, so treat it as a public link.
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-line px-2.5 py-2">
        <span className={`flex items-center gap-1.5 font-medium ${row.tone}`} data-tunnel-state={status?.state ?? 'unknown'}>
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : status?.state === 'error' ? 'bg-red-500' : 'bg-zinc-400'}`}
          />
          {loading ? 'Checking…' : row.label}
        </span>
        {status?.provider ? <span className="font-mono text-[11px] text-zinc-500">{status.provider}</span> : null}
        <button
          type="button"
          onClick={() => void load(false)}
          aria-label="Refresh tunnel status"
          className="ml-auto grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-muted hover:text-zinc-800"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {url ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50/60 px-2.5 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            data-tunnel-url="1"
            className="min-w-0 flex-1 truncate font-mono text-xs text-emerald-800 hover:underline dark:text-emerald-300"
          >
            {url}
          </a>
          <button
            type="button"
            onClick={() => void copyUrl()}
            aria-label="Copy public url"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900"
          >
            {copied ? <span className="text-[10px] font-semibold">OK</span> : <Copy className="h-3 w-3" />}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open public url in a new tab"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ) : null}

      {status?.message ? (
        <div className="text-xs text-zinc-500" data-tunnel-message="1">
          {status.message}
        </div>
      ) : null}
      {expires ? <div className="text-[11px] text-zinc-400">{expires}</div> : null}
      {status?.startedAt && live ? (
        <div className="text-[11px] text-zinc-400">Started {formatStamp(status.startedAt)}</div>
      ) : null}

      {install ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Nothing is published yet</div>
            <code className="mt-1 block break-all font-mono" data-tunnel-hint="1">
              {install}
            </code>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span data-tunnel-error="1">{error}</span>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Port</span>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            inputMode="numeric"
            placeholder="3456"
            aria-label="Port to publish (blank = the harness port)"
            disabled={busy || live}
            className="h-7 font-mono text-xs"
          />
        </label>
        {live ? (
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void run('stop')}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Square className="mr-1 h-3 w-3" />}
            Stop
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void run('start')}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
            Start
          </Button>
        )}
      </div>
      <div className="text-[11px] text-zinc-400">
        Same actions from the shell: <code className="font-mono">lokma tunnel status|start|stop</code>
      </div>
    </div>
  );
}