import * as React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { emitToast } from '@/components/shell';
import {
  buildMcpPatch,
  isValidMcpName,
  MCP_TRANSPORTS,
  validateMcpForm,
  type McpEntry,
  type NormalizedConfig,
} from './settings';

/**
 * McpPane — MCP servers from the live `mcp.servers` config map
 * (same file the CLI reads, `~/.lokma/config.json`). Add / edit /
 * enable-toggle / delete all persist via PATCH /api/config and reload
 * from the server. The concept's mock rows (filesystem/vault/browser
 * with invented tool counts) and its toast-only Test button are
 * intentionally NOT ported — there is no MCP client in the harness
 * yet, so every row here is real config and every button works.
 */
export function McpPane({ config, onReload }: { config: NormalizedConfig; onReload: () => Promise<void> }) {
  const [servers, setServers] = React.useState<McpEntry[]>(config.mcpServers);
  const [dialog, setDialog] = React.useState<{ mode: 'create' } | { mode: 'edit'; entry: McpEntry } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function persist(next: McpEntry[]): Promise<void> {
    setBusy(true);
    try {
      await api.patchConfig(buildMcpPatch(next));
      setServers(next);
      await onReload();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Save failed');
      setServers(config.mcpServers);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(entry: McpEntry): Promise<void> {
    const next = servers.map((s) => (s.name === entry.name ? { ...s, enabled: !s.enabled } : s));
    setServers(next);
    try {
      await persist(next);
    } catch {
      // persist() already rolled back + toasted.
    }
  }

  async function handleDelete(name: string): Promise<void> {
    if (confirmDelete !== name) {
      setConfirmDelete(name);
      return;
    }
    const next = servers.filter((s) => s.name !== name);
    setConfirmDelete(null);
    try {
      await persist(next);
      emitToast(`Deleted ${name}`);
    } catch {
      // persist() already rolled back + toasted.
    }
  }

  async function handleSubmit(input: { name: string; transport: string; command: string; url: string }): Promise<void> {
    const name = input.name.trim();
    const entry: McpEntry = {
      name,
      transport: input.transport as McpEntry['transport'],
      command: input.command.trim(),
      url: input.url.trim(),
      enabled: dialog?.mode === 'edit' ? dialog.entry.enabled : true,
    };
    const next =
      dialog?.mode === 'edit' ? servers.map((s) => (s.name === dialog.entry.name ? entry : s)) : [...servers, entry];
    await persist(next);
    setDialog(null);
    emitToast(dialog?.mode === 'edit' ? `Saved ${name}` : `Added ${name}`);
  }

  return (
    <div className="space-y-2 p-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium">
          MCP Servers — {servers.length} · stdio / http / sse / ws
        </span>
        <Button size="sm" className="ml-auto h-6 gap-1 text-xs" disabled={busy} onClick={() => setDialog({ mode: 'create' })}>
          <Plus className="h-3 w-3" /> Add MCP
        </Button>
      </div>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-4 text-center text-[11px] text-zinc-500">
          No MCP servers configured. Add one — it lands in global config, where the CLI reads it too.
        </div>
      ) : (
        <div className="space-y-1.5">
          {servers.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-2 rounded-lg border border-line bg-white p-2.5 transition hover:border-terracotta/20 dark:bg-[#1E1E21]"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.enabled ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className="truncate font-mono">{s.name}</span>
                  <span className="rounded border border-line bg-muted px-1 py-0 text-[10px]">{s.transport}</span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">
                  {s.transport === 'stdio' ? s.command || '(no command)' : s.url || '(no url)'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <label className="flex cursor-pointer items-center gap-1 text-[11px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    disabled={busy}
                    onChange={() => handleToggle(s)}
                    className="accent-[#C96442]"
                    aria-label={`Enable ${s.name}`}
                  />
                  on
                </label>
                <button
                  onClick={() => setDialog({ mode: 'edit', entry: s })}
                  disabled={busy}
                  className="grid h-6 w-6 place-items-center rounded hover:bg-muted disabled:opacity-30"
                  aria-label={`Edit ${s.name}`}
                >
                  <Pencil className="h-3 w-3 text-zinc-400" />
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 px-1.5 text-[11px] ${confirmDelete === s.name ? 'text-red-600' : ''}`}
                  disabled={busy}
                  onClick={() => handleDelete(s.name)}
                  title="Delete MCP server"
                  aria-label="Delete MCP server"
                >
                  {confirmDelete === s.name ? 'Sure?' : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border border-dashed border-line bg-muted/50 p-2 text-[11px] text-zinc-500">
        Same map the CLI reads. Tool counts and live connection tests arrive with the plugin-system wave — no fake
        status here.
      </div>

      {dialog !== null && (
        <McpDialog
          key={dialog.mode === 'edit' ? dialog.entry.name : 'create'}
          initial={dialog.mode === 'edit' ? dialog.entry : null}
          taken={servers.map((s) => s.name).filter((n) => dialog.mode !== 'edit' || n !== dialog.entry.name)}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function McpDialog({
  initial,
  taken,
  onClose,
  onSubmit,
}: {
  initial: McpEntry | null;
  taken: string[];
  onClose: () => void;
  onSubmit: (input: { name: string; transport: string; command: string; url: string }) => Promise<void>;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [transport, setTransport] = React.useState<string>(initial?.transport ?? 'stdio');
  const [command, setCommand] = React.useState(initial?.command ?? '');
  const [url, setUrl] = React.useState(initial?.url ?? '');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  async function handleSave(): Promise<void> {
    const errs = validateMcpForm({ name, transport, command, url });
    if (taken.includes(name.trim()) || (initial === null && !isValidMcpName(name))) {
      if (taken.includes(name.trim())) errs.name = 'That name is already used.';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      await onSubmit({ name, transport, command, url });
    } catch {
      // Parent toasted + rolled back; keep the dialog open for a retry.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm space-y-2 rounded-lg border border-line bg-white p-3 dark:bg-[#1E1E21]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={initial ? 'Edit MCP server' : 'Add MCP server'}
      >
        <div className="text-xs font-semibold">{initial ? `Edit ${initial.name}` : 'Add MCP server'}</div>
        <div>
          <label htmlFor="mcp-name" className="text-[11px] font-medium text-zinc-500">
            Name (slug)
          </label>
          <Input
            id="mcp-name"
            value={name}
            disabled={initial !== null}
            onChange={(e) => setName(e.target.value)}
            placeholder="filesystem"
            className="mt-0.5 h-7 font-mono text-xs"
          />
          {errors.name && <div className="mt-0.5 text-[11px] text-red-600">{errors.name}</div>}
        </div>
        <div>
          <label htmlFor="mcp-transport" className="text-[11px] font-medium text-zinc-500">
            Transport
          </label>
          <select
            id="mcp-transport"
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            className="mt-0.5 h-7 w-full rounded-md border border-line bg-white px-2 text-xs dark:bg-[#161618]"
          >
            {MCP_TRANSPORTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {errors.transport && <div className="mt-0.5 text-[11px] text-red-600">{errors.transport}</div>}
        </div>
        {transport === 'stdio' ? (
          <div>
            <label htmlFor="mcp-command" className="text-[11px] font-medium text-zinc-500">
              Command
            </label>
            <Input
              id="mcp-command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx @modelcontextprotocol/server-filesystem /data"
              className="mt-0.5 h-7 font-mono text-xs"
            />
            {errors.command && <div className="mt-0.5 text-[11px] text-red-600">{errors.command}</div>}
          </div>
        ) : (
          <div>
            <label htmlFor="mcp-url" className="text-[11px] font-medium text-zinc-500">
              Endpoint URL
            </label>
            <Input
              id="mcp-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse"
              className="mt-0.5 h-7 font-mono text-xs"
            />
            {errors.url && <div className="mt-0.5 text-[11px] text-red-600">{errors.url}</div>}
          </div>
        )}
        <div className="flex justify-end gap-1 pt-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : initial ? 'Save' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  );
}
