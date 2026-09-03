import { WifiOff } from 'lucide-react';
import type { WsStatus } from '@/lib/ws';

/**
 * OfflineBanner — visible only while the harness WS is not usable.
 * `connecting` (reconnect backoff running) shows a subtle amber strip;
 * `closed`/`error` (retries exhausted or manual close) shows a red strip
 * with a manual retry. `open`/`idle` render nothing.
 */
export function OfflineBanner({ status, onRetry }: { status: WsStatus; onRetry: () => void }) {
  if (status === 'open' || status === 'idle') return null;
  const reconnecting = status === 'connecting';
  return (
    <div
      role="alert"
      className={
        reconnecting
          ? 'flex h-7 shrink-0 items-center justify-center gap-2 bg-amber-50 px-3 text-xs text-amber-800'
          : 'flex h-7 shrink-0 items-center justify-center gap-2 bg-red-50 px-3 text-xs text-red-800'
      }
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>{reconnecting ? 'Connection lost — reconnecting…' : 'Disconnected from harness'}</span>
      {reconnecting ? null : (
        <button onClick={onRetry} className="font-medium underline underline-offset-2 hover:opacity-80">
          Retry
        </button>
      )}
    </div>
  );
}
