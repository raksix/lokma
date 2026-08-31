import { Badge } from '@/components/ui/badge';

/**
 * Header — top bar with brand + health + session info.
 * Single component, no duplication — reused in layout.
 */

export function Header({ health, sessionId }: { health?: { ok: boolean }; sessionId: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">L</div>
        <div>
          <div className="text-sm font-semibold leading-none">Lokma</div>
          <div className="text-xs text-muted-foreground">harness · {sessionId.slice(0, 12)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={health?.ok ? 'default' : 'secondary'}>{health?.ok ? '● server up' : '○ server down'}</Badge>
        <Badge variant="outline">Phase 0 scaffold</Badge>
      </div>
    </header>
  );
}
