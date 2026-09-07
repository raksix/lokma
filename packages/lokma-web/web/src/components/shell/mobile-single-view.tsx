import * as React from 'react';
import { FolderOpen, MessageCircle, MessagesSquare, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UseWs } from '@/hooks/use-ws';
import { Chat } from '@/components/chat';
import { FileBrowser } from '@/components/files';
import { InspectorPanel, type InspectorTab } from '@/components/providers';
import { SessionsSidebar } from '@/components/sessions';
import { INSPECTOR_RAIL_ITEMS } from './inspector-rail';
import { MOBILE_TABS, mobileTabLabel, type MobileTab } from './responsive';

/**
 * MobileSingleView — REQ-024 separate simple phone experience.
 *
 * Below the mobile breakpoint the harness drops the tiling/windowed pane
 * system entirely (no splits, no floating windows, no drag-drop): one
 * surface at a time, switched by a thumb-sized bottom tab bar. Every
 * feature stays reachable — chat, the session list, the file explorer
 * (inline preview/edit, no pane tab), and all 23 Inspector tools behind a
 * scrollable pill picker. Settings stay in the header modal, search in
 * Ctrl/Cmd+K — same as desktop.
 */

const TAB_ICONS: Record<MobileTab, typeof MessageCircle> = {
  'chat': MessageCircle,
  'sessions': MessagesSquare,
  'files': FolderOpen,
  'tools': SlidersHorizontal,
};

function MobileNavButton({
  tab,
  active,
  onSelect,
}: {
  tab: MobileTab;
  active: boolean;
  onSelect: (tab: MobileTab) => void;
}) {
  const Icon = TAB_ICONS[tab];
  const label = mobileTabLabel(tab);
  return (
    <button
      type="button"
      onClick={() => onSelect(tab)}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] font-medium transition',
        active ? 'text-terracotta' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function MobileSingleView({
  activeId,
  ws,
  onSelectSession,
  requestedTab,
}: {
  activeId: string;
  ws: UseWs;
  onSelectSession: (id: string) => void;
  requestedTab?: InspectorTab | null;
}) {
  const [tab, setTab] = React.useState<MobileTab>('chat');
  const [toolTab, setToolTab] = React.useState<InspectorTab>(requestedTab ?? 'info');

  // An outside request (activity affordance, deep-link) lands on Tools and
  // selects the tab — same contract as the desktop Inspector rail.
  React.useEffect(() => {
    if (requestedTab) {
      setToolTab(requestedTab);
      setTab('tools');
    }
  }, [requestedTab]);

  const handleSelectSession = React.useCallback(
    (id: string) => {
      onSelectSession(id);
      // Replaces the old drawer-dismiss: picking a session reveals the chat.
      setTab('chat');
    },
    [onSelectSession],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="mobile-single-view">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" role="tabpanel" aria-label={mobileTabLabel(tab)}>
        {tab === 'chat' ? (
          <Chat key={activeId} sessionId={activeId} ws={ws} onOpenSession={handleSelectSession} />
        ) : tab === 'sessions' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1">
            <SessionsSidebar activeId={activeId} onSelect={handleSelectSession} />
          </div>
        ) : tab === 'files' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
            <FileBrowser key={activeId} sessionId={activeId} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1.5" role="tablist" aria-label="Inspector tools">
              {INSPECTOR_RAIL_ITEMS.map(({ tab: itemTab, label }) => (
                <button
                  key={itemTab}
                  type="button"
                  role="tab"
                  aria-selected={toolTab === itemTab}
                  onClick={() => setToolTab(itemTab)}
                  title={label}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
                    toolTab === itemTab
                      ? 'border-terracotta/50 bg-terracotta/10 text-terracotta'
                      : 'border-line bg-white text-zinc-600 dark:bg-[#1E1E21] dark:text-zinc-300',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
              <InspectorPanel onOpenSession={handleSelectSession} sessionId={activeId} ws={ws} requestedTab={toolTab} />
            </div>
          </div>
        )}
      </div>
      <nav
        aria-label="Mobile navigation"
        className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-t border-line bg-card px-2 py-1.5"
      >
        {MOBILE_TABS.map((item) => (
          <MobileNavButton key={item} tab={item} active={tab === item} onSelect={setTab} />
        ))}
      </nav>
    </div>
  );
}
