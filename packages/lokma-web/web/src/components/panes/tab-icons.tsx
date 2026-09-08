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
  FolderOpen,
  GitBranch,
  Globe,
  HardDrive,
  Info,
  Layers,
  Package,
  Paintbrush,
  Plug2,
  Puzzle,
  Settings,
  Shield,
  Star,
  Terminal,
  Users,
  Workflow,
} from 'lucide-react';
import type { InspectorTabId } from './panes';

// REQ-045 — the TilingBar strip is gone; this module keeps only TAB_ICONS
// (shared by the pane tab strip in pane.tsx). Tool buttons live on the
// Inspector rail, splits on the pane strip.

export const TAB_ICONS: Record<InspectorTabId, React.ReactNode> = {
  // REQ-043 — Files page icon (open folder; Vault keeps the closed Folder).
  files: <FolderOpen className="h-3 w-3" />,
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
