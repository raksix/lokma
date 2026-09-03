import * as React from 'react';
import { TriangleAlert } from 'lucide-react';

/**
 * PaneErrorBoundary — isolates one pane so a render crash degrades to a
 * small fallback card instead of blanking the whole harness. Wrap every
 * top-level pane (chat, sidebars, future panes) individually.
 */
type Props = {
  paneName: string;
  children: React.ReactNode;
};

type State = { error: Error | null };

export class PaneErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Surface to the console for `lokma web` log capture; never rethrow.
    console.error(`[pane:${this.props.paneName}] render error`, error);
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="m-2 flex flex-col items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-center">
        <TriangleAlert className="h-4 w-4 text-red-600" />
        <div className="text-xs font-medium text-red-900">{this.props.paneName} crashed</div>
        <div className="max-w-full truncate font-mono text-[11px] text-red-700">{error.message}</div>
        <button
          onClick={this.retry}
          className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-800 hover:bg-red-100"
        >
          Retry pane
        </button>
      </div>
    );
  }
}
