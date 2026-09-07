/**
 * FooterBar — thin live status strip (REQ-018).
 * Shows real harness numbers instead of static hints: gateway reachability
 * + round-trip latency, the active session's project, host CPU/RAM from
 * `GET /api/metrics`, stream throughput from the WS cost feed, and the
 * lokma version. Unknown values render a placeholder, never a fake 0.
 * Shortcut hints live in the `?` dialog (SHORTCUTS registry) — only the
 * `?` button stays here. Lucide icons only.
 */
import { Activity, Cpu, FolderGit2, MemoryStick, Tag, Zap } from 'lucide-react';
import { requestShortcutsDialog } from './shortcuts';

export type FooterMetrics = {
  serverUp: boolean | null;
  /** Round-trip ms of the last `/api/health` poll (null while unknown). */
  latencyMs: number | null;
  /** Basename of the active session cwd (null when no session selected). */
  projectName: string | null;
  /** System CPU % from `/api/metrics` (null on the first sample). */
  cpuPercent: number | null;
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  /** Stream throughput derived from WS cost deltas (null while idle). */
  tokensPerSec: number | null;
  version: string | null;
};

/** `17179869184` → `16.0 GB`. */
function formatBytes(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

/** `1530` → `1.5k tok/s`, `42` → `42 tok/s`. */
function formatRate(tokensPerSec: number): string {
  if (tokensPerSec >= 1000) return `${(tokensPerSec / 1000).toFixed(1)}k tok/s`;
  return `${Math.round(tokensPerSec)} tok/s`;
}

const itemClass = 'flex items-center gap-1 whitespace-nowrap';

export function FooterBar(metrics: FooterMetrics) {
  const { serverUp, latencyMs, projectName, cpuPercent, memUsedBytes, memTotalBytes, tokensPerSec, version } = metrics;
  const dot = serverUp === null ? 'bg-zinc-400' : serverUp ? 'bg-emerald-500' : 'bg-red-500';
  const gatewayLabel =
    serverUp === null ? 'gateway …' : serverUp ? `gateway · ${latencyMs === null ? '…' : `${Math.round(latencyMs)}ms`}` : 'gateway down';
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-[#E8E4DE] bg-[#FDFCFB] px-3 text-[11px] text-zinc-500">
      <span className={itemClass} title={serverUp === null ? 'Checking harness reachability' : serverUp ? 'Harness reachable (round-trip of the last /api/health poll)' : 'Harness unreachable'}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <Activity className="h-3 w-3" />
        <span>{gatewayLabel}</span>
      </span>
      <span className={itemClass} title={projectName === null ? 'No session selected' : 'Active session working directory'}>
        <FolderGit2 className="h-3 w-3" />
        <span className="max-w-40 truncate">{projectName ?? 'no project'}</span>
      </span>
      <span className="hidden sm:flex sm:items-center sm:gap-1 sm:whitespace-nowrap" title={cpuPercent === null ? 'First metrics sample — CPU % arrives on the next poll' : 'Host CPU usage since the previous poll'}>
        <Cpu className="h-3 w-3" />
        <span>{cpuPercent === null ? 'cpu …' : `cpu ${cpuPercent.toFixed(1)}%`}</span>
      </span>
      <span className="hidden md:flex md:items-center md:gap-1 md:whitespace-nowrap" title="Host memory used / total">
        <MemoryStick className="h-3 w-3" />
        <span>{memUsedBytes === null || memTotalBytes === null ? 'ram …' : `ram ${formatBytes(memUsedBytes)} / ${formatBytes(memTotalBytes)}`}</span>
      </span>
      <span className="hidden sm:flex sm:items-center sm:gap-1 sm:whitespace-nowrap" title={tokensPerSec === null ? 'No active stream — throughput appears while the model streams' : 'Stream throughput from WS cost deltas'}>
        <Zap className="h-3 w-3" />
        <span>{tokensPerSec === null ? 'idle' : formatRate(tokensPerSec)}</span>
      </span>
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={requestShortcutsDialog}
          aria-label="Open keyboard shortcuts"
          className="rounded px-0.5 font-mono underline decoration-dotted underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ?
        </button>
        <span className="hidden items-center gap-1 sm:flex" title="Lokma harness version (server /api/metrics)">
          <Tag className="h-3 w-3" />
          <span className="font-mono">{version === null ? '…' : `v${version}`}</span>
        </span>
      </span>
    </div>
  );
}
