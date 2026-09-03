import * as React from 'react';
import { Info, Layers, Plug2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoPanel } from '@/components/sidebar';
import { ModelsPane } from './models-pane';
import { ProvidersPane } from './providers-pane';

/**
 * InspectorPanel — right-sidebar tabs. Info stays the default; Providers is
 * the real W2-5 pane (live CRUD + connection test), Models the real W2-6
 * pane (enable/disable over `PATCH /api/models`). Later W2 slices
 * (Usage/Config/…) add tabs here; the W7 pane system may relocate
 * the whole panel without touching the panes themselves.
 */
export function InspectorPanel() {
  const [tab, setTab] = React.useState<'info' | 'providers' | 'models'>('info');

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <Button
          variant={tab === 'info' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('info')}
        >
          <Info className="h-3 w-3" />
          Info
        </Button>
        <Button
          variant={tab === 'providers' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('providers')}
        >
          <Plug2 className="h-3 w-3" />
          Providers
        </Button>
        <Button
          variant={tab === 'models' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('models')}
        >
          <Layers className="h-3 w-3" />
          Models
        </Button>
      </div>
      {tab === 'info' ? <InfoPanel /> : tab === 'providers' ? <ProvidersPane /> : <ModelsPane />}
    </div>
  );
}
