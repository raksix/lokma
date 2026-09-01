
import * as React from 'react';
import { Header } from '@/components/header';
import { Sidebar, SessionsPanel, InfoPanel } from '@/components/sidebar';
import { Chat } from '@/components/chat';
import { HealthBadge } from '@/components/status/health-badge';

/**
 * AppShell — Phase 0 static layout (header + left + center + right).
 * Phase 1 swaps to flexlayout-react draggable panes — this static shell proves
 * two surfaces import same lokma-shared and two shells can exist.
 */

export function AppShell({ sessionId }: { sessionId: string }) {
  const [sessions, setSessions] = React.useState<string[]>([]);

  React.useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((j: { sessions: { id: string }[] }) => setSessions(j.sessions.map((s) => s.id)))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header health={{ ok: true }} sessionId={sessionId} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar side="left" title="Explorer">
          <div className="space-y-4">
            <SessionsPanel sessions={sessions} />
            <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Server</div>
              <div className="mt-1 flex items-center gap-2">
                <HealthBadge />
                <span>Fastify :3456</span>
              </div>
            </div>
          </div>
        </Sidebar>

        <main className="flex flex-1 flex-col overflow-hidden p-3">
          <Chat sessionId={sessionId} />
          <div className="mt-2 text-center text-[11px] text-muted-foreground">
            Phase 0 scaffold — mock WS chat streams via <code className="rounded bg-muted px-1">lokma-ai</code> + persists to{' '}
            <code className="rounded bg-muted px-1">~/.lokma/projects/&lt;hash&gt;/sessions/*.jsonl</code> (CLI + Web share)
          </div>
        </main>

        <Sidebar side="right" title="Inspector">
          <InfoPanel />
        </Sidebar>
      </div>
    </div>
  );
}
