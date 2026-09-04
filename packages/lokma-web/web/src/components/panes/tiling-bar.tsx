import * as React from 'react';
import {
  Activity,
  BarChart3,
  Beaker,
  Bot,
  Brain,
  Clock3,
  Cpu,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Info,
  Layers,
  LayoutGrid,
  Package,
  Paintbrush,
  Plug2,
  Puzzle,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Square,
  Star,
  Terminal,
  Users,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TILING_BAR_TABS, inspectorLabel, type InspectorTabId } from './panes';

export const TAB_ICONS: Record<InspectorTabId, React.ReactNode> = {
  info: <Info className="h-3 w-3" />,
  providers: <Plug2 className="h-3 w-3" />,
  models: <Layers className="h-3 w-3" />,
  usage: <BarChart3 className="h-3 w-3" />,
  settings: <Settings className="h-3 w-3" />,
  terminal: <Terminal className="h-3 w-3" />,
  git: <GitBranch className="h-3 w-3" />,
  browser: <Globe className="h-3 w-3" />,
  agents: <Users className="h-3 w-3" />,
  orchestration: <Cpu className="h-3 w-3" />,
  vault: <Folder className="h-3 w-3" />,
  skills: <Puzzle className="h-3 w-3" />,
  archify: <Workflow className="h-3 w-3" />,
  design: <Paintbrush className="h-3 w-3" />,
  testing: <Beaker className="h-3 w-3" />,
  bots: <Bot className="h-3 w-3" />,
  auth: <Shield className="h-3 w-3" />,
  setup: <HardDrive className="h-3 w-3" />,
  plugins: <Package className="h-3 w-3" />,
  observability: <Activity className="h-3 w-3" />,
  cron: <Clock3 className="h-3 w-3" />,
  extras: <Star className="h-3 w-3" />,
  memory: <Brain className="h-3 w-3" />,
};

// TilingBar: concept panes/TilingBar.tsx port. Every button opens a REAL
// Inspector tab as a new split pane (no mock panes). Kept 1:1: the 18
// concept onOpen* actions + the harness browser extra, Pane, windowed
// toggle, save, reset, and single-view exit.
export function TilingBar({
  paneCount,
  tabCount,
  windowed,
  onToggleWindowed,
  onOpenInspector,
  onAddPane,
  onSave,
  onReset,
  onSingle,
}: {
  paneCount: number;
  tabCount: number;
  windowed: boolean;
  onToggleWindowed: () => void;
  onOpenInspector: (id: InspectorTabId) => void;
  onAddPane: () => void;
  onSave: () => void;
  onReset: () => void;
  onSingle: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 rounded border bg-card px-2 py-1.5">
      <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <LayoutGrid className="h-3 w-3" />
        Tiling
      </span>
      <span className="mr-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title="Live pane and tab counts">
        {paneCount} {paneCount === 1 ? 'pane' : 'panes'} · {tabCount} {tabCount === 1 ? 'tab' : 'tabs'}
      </span>
      {TILING_BAR_TABS.map((id) => (
        <Button
          key={id}
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          title={`Open ${inspectorLabel(id)} in a new pane`}
          onClick={() => onOpenInspector(id)}
        >
          {TAB_ICONS[id]}
          {inspectorLabel(id)}
        </Button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      <Button variant="outline" size="sm" className="h-6 px-1.5 text-[11px]" title="Split a new empty pane" onClick={onAddPane}>
        + Pane
      </Button>
      <Button
        variant={windowed ? 'default' : 'outline'}
        size="sm"
        className="h-6 px-1.5 text-[11px]"
        title={windowed ? 'Back to split layout' : 'Float panes as windows'}
        onClick={onToggleWindowed}
      >
        Windowed
      </Button>
      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" title="Layout autosaves; confirm what is stored" onClick={onSave}>
        <Save className="h-3 w-3" />
        Save
      </Button>
      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" title="Reset to the default 3-pane layout" onClick={onReset}>
        <RotateCcw className="h-3 w-3" />
        Reset
      </Button>
      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" title="Back to the single chat view" onClick={onSingle}>
        <Square className="h-3 w-3" />
        Single
      </Button>
    </div>
  );
}
