import * as React from 'react';
import {
  ChevronDown,
  LifeBuoy,
  ListTree,
  Mic,
  Paperclip,
  Search,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api, type SlashCommandInfo } from '@/lib/api';
import { useProviderStore } from '@/stores';
import { emitToast } from '@/components/shell';
import { isSlashPrefix, parseMentions, parseSlashCommand, removeMention } from './composer-utils';
import { appendMention } from '@/components/files';
import { enabledModels } from '@/components/providers/models';

/**
 * Composer — chat input ported from the concept shell into the harness.
 * Real wiring only: models come from the providerStore cache
 * (`GET /api/models`), `/` lists the server-owned `GET /api/commands`
 * registry, `@path` mentions travel to the server as `contextPaths`
 * (the server reads them into model context), attachments inline their
 * real content, stop fires the WS interrupt.
 */

export type ComposerSend = { text: string; model: string; contextPaths: string[] };

type QueuedPrompt = { key: number; text: string };

const MODE_KEY = 'lokma-composer-mode';
const MAX_ATTACH_BYTES = 100 * 1024;
const MAX_ATTACH_FILES = 3;
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.css', '.html',
  '.py', '.rs', '.go', '.yaml', '.yml', '.toml', '.sh', '.sql', '.xml', '.log',
]);

function readMode(): 'steer' | 'queue' {
  try {
    return localStorage.getItem(MODE_KEY) === 'queue' ? 'queue' : 'steer';
  } catch {
    return 'steer';
  }
}

/** Read a user-attached file as text (binary/oversize files are refused). */
function readAttachment(file: File): Promise<string> {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!TEXT_EXTENSIONS.has(ext) || file.size > MAX_ATTACH_BYTES) {
    return Promise.reject(
      new Error(`${file.name}: only text files under 100KB can be attached`),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error(`${file.name}: could not be read`));
    reader.readAsText(file);
  });
}

export function Composer({
  model,
  streaming,
  socketOpen,
  paletteSignal,
  dropSignal,
  onSend,
  onStop,
  onSlash,
  onPickModel,
}: {
  model: string;
  streaming: boolean;
  socketOpen: boolean;
  /** Increment to force-open the `/` palette (the `/help` command). */
  paletteSignal: number;
  /** File dropped from the explorer (or its context menu) — spliced as `@path`. */
  dropSignal?: { path: string; key: number } | null;
  onSend: (send: ComposerSend) => void;
  onStop: () => void;
  onSlash: (id: string, args: string, fullText: string) => void;
  onPickModel: (id: string) => void;
}) {
  const [text, setText] = React.useState('');
  const [mode, setMode] = React.useState<'steer' | 'queue'>(readMode);
  const [modelOpen, setModelOpen] = React.useState(false);
  const [modelQuery, setModelQuery] = React.useState('');
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [commands, setCommands] = React.useState<SlashCommandInfo[]>([]);
  const [queued, setQueued] = React.useState<QueuedPrompt[]>([]);
  const [attachments, setAttachments] = React.useState<{ name: string; content: string }[]>([]);
  const [recording, setRecording] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const keySeq = React.useRef(0);

  const storeModels = useProviderStore((s) => s.models);
  const refreshProviders = useProviderStore((s) => s.refresh);

  React.useEffect(() => {
    void refreshProviders();
    api
      .listCommands()
      .then((res) => setCommands(res.commands))
      .catch(() => emitToast('Slash commands unavailable — server unreachable'));
  }, [refreshProviders]);

  // `/help` opens the palette from the Chat layer.
  React.useEffect(() => {
    if (paletteSignal > 0) {
      setPaletteOpen(true);
      taRef.current?.focus();
    }
  }, [paletteSignal]);

  // File dropped from the explorer — splice `@path` into the draft (the
  // existing mention parser turns it into `contextPaths` on send).
  const dropKey = dropSignal?.key ?? 0;
  const dropPath = dropSignal?.path ?? '';
  React.useEffect(() => {
    if (dropKey > 0 && dropPath) {
      setText((prev) => appendMention(prev, dropPath));
      taRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropKey]);

  const mentions = React.useMemo(() => parseMentions(text), [text]);
  const contextPaths = React.useMemo(
    () => Array.from(new Set(mentions.map((m) => m.path))),
    [mentions],
  );

  const groupedModels = React.useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    const groups = new Map<string, { id: string; label: string; provider: string }[]>();
    // Single source: the Models tab owns enable/disable — only enabled
    // models are offered here (concept note: "Only enabled models appear
    // in Composer + Ctrl+M").
    for (const m of enabledModels(storeModels)) {
      if (q && !`${m.label} ${m.id}`.toLowerCase().includes(q)) continue;
      const list = groups.get(m.provider) ?? [];
      list.push(m);
      groups.set(m.provider, list);
    }
    return [...groups.entries()];
  }, [storeModels, modelQuery]);

  const activeLabel = storeModels.find((m) => m.id === model)?.label ?? model ?? 'Select model';

  const switchMode = (next: 'steer' | 'queue'): void => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Mode still applies for this tab without persistence.
    }
  };

  const deliver = React.useCallback(
    (raw: string) => {
      const body = raw.trim();
      if (!body) return;
      const slash = parseSlashCommand(body);
      if (slash && commands.some((c) => c.id === slash.id)) {
        onSlash(slash.id, slash.args, body);
        return;
      }
      if (slash) {
        emitToast(`Unknown command /${slash.id} — try /help`);
        return;
      }
      let full = body;
      if (attachments.length) {
        full += attachments
          .map((a) => `\n\n<attachment name="${a.name}">\n${a.content}\n</attachment>`)
          .join('');
        setAttachments([]);
      }
      onSend({ text: full, model, contextPaths: parseMentions(body).map((m) => m.path) });
    },
    [attachments, commands, contextPaths, model, onSend],
  );

  const handleSend = (): void => {
    if (!text.trim() || (!socketOpen && mode === 'steer')) return;
    if (mode === 'queue' && streaming) {
      keySeq.current += 1;
      setQueued((prev) => [...prev, { key: keySeq.current, text }]);
      setText('');
      if (taRef.current) taRef.current.style.height = 'auto';
      return;
    }
    deliver(text);
    setText('');
    setPaletteOpen(false);
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  // Queue drains one prompt per finished stream (real ordering, client-side).
  React.useEffect(() => {
    if (streaming || queued.length === 0) return;
    const [next, ...rest] = queued;
    if (!next) return;
    setQueued(rest);
    deliver(next.text);
  }, [streaming, queued, deliver]);

  const attachFiles = (files: FileList | File[]): void => {
    const arr = Array.from(files);
    if (attachments.length + arr.length > MAX_ATTACH_FILES) {
      emitToast(`At most ${MAX_ATTACH_FILES} files per message`);
      return;
    }
    void Promise.all(arr.map(readAttachment))
      .then((contents) => {
        setAttachments((prev) => [...prev, ...arr.map((f, i) => ({ name: f.name, content: contents[i] ?? '' }))]);
      })
      .catch((e: Error) => emitToast(e.message));
  };

  const toggleMic = (): void => {
    if (recording) {
      setRecording(false);
      return;
    }
    const SR =
      (window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown })
        .webkitSpeechRecognition ??
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    if (!SR) {
      emitToast('Microphone is not supported in this browser');
      return;
    }
    try {
      const rec = new (
        SR as unknown as new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
          onend: () => void;
          start: () => void;
        }
      )();
      rec.lang = 'tr-TR';
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e) => {
        setText(Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(''));
      };
      rec.onend = () => setRecording(false);
      rec.start();
      setRecording(true);
    } catch {
      emitToast('Microphone could not start');
    }
  };

  const paletteItems = React.useMemo(() => {
    const prefix = text.trim().slice(1).toLowerCase();
    return commands.filter((c) => !prefix || c.id.startsWith(prefix) || c.hint.toLowerCase().includes(prefix));
  }, [commands, text]);

  const canSend = text.trim().length > 0 && (socketOpen || (mode === 'queue' && streaming));

  return (
    <div className="relative rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(38,38,36,0.06),0_4px_12px_rgba(38,38,36,0.04)] dark:bg-[#1E1E21]">
      {/* Top row — mention chips + steer/queue + model picker */}
      <div className="flex flex-wrap items-center gap-1 rounded-t-xl border-b border-line/50 bg-[#FDFCFB] px-2 py-1 dark:bg-[#161618]">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {contextPaths.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded-full bg-[#262624] py-0.5 pl-1.5 pr-0.5 text-[11px] text-white"
              title={`Included in model context (@${p})`}
            >
              <span className="h-1 w-1 rounded-full bg-emerald-500" />@{p}
              <button
                onClick={() => setText((t) => removeMention(t, p))}
                className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-white/10"
                title={`Remove @${p}`}
                aria-label={`Remove @${p} from context`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {contextPaths.length === 0 && (
            <span className="px-1 text-[11px] text-zinc-400">Type @path to attach workspace files</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="inline-flex rounded-full border border-[#262624] bg-[#262624] p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => switchMode('steer')}
              title="Steer — send immediately"
              aria-label="Steer mode — send immediately"
              aria-pressed={mode === 'steer'}
              className={cn(
                'h-6 w-6 rounded-full p-0',
                mode === 'steer' ? 'bg-white text-ink hover:bg-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <LifeBuoy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => switchMode('queue')}
              title="Queue — send when the stream finishes"
              aria-label="Queue mode — send when the stream finishes"
              aria-pressed={mode === 'queue'}
              className={cn(
                'h-6 w-6 rounded-full p-0',
                mode === 'queue' ? 'bg-white text-ink hover:bg-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <ListTree className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModelOpen((v) => !v)}
              title="Model select (Ctrl+M in header)"
              className="h-6 max-w-[150px] gap-1 rounded-full border-line bg-white pr-1 pl-1.5 text-xs"
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#262624] text-[9px] text-white">L</span>
              <span className="truncate">{activeLabel}</span>
              <ChevronDown className={cn('h-3 w-3 shrink-0 text-zinc-400 transition-transform', modelOpen && 'rotate-180')} />
            </Button>
            {modelOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} />
                <div className="absolute right-0 bottom-[calc(100%+8px)] z-50 flex max-h-[420px] w-[340px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-[#2A2A2E] bg-[#111113] shadow-2xl">
                  <div className="border-b border-white/10 p-2">
                    <div className="relative">
                      <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                      <input
                        autoFocus
                        placeholder="Search models"
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                        className="h-8 w-full rounded-lg border border-white/10 bg-[#1E1E20] pr-3 pl-8 text-[13px] text-white placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto py-1">
                    {groupedModels.length === 0 && (
                      <div className="px-3 py-6 text-center text-xs text-zinc-500">No models — check Providers</div>
                    )}
                    {groupedModels.map(([provider, items]) => (
                      <div key={provider}>
                        <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
                          {provider}
                        </div>
                        {items.map((m) => (
                          <Button
                            key={m.id}
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onPickModel(m.id);
                              setModelOpen(false);
                              setModelQuery('');
                            }}
                            className={cn(
                              'mx-1 w-[calc(100%-8px)] justify-start text-[13px] text-white hover:bg-white/10 hover:text-white',
                              model === m.id && 'border border-white/5 bg-white/10',
                            )}
                          >
                            <span className="flex items-center gap-1.5">
                              {model === m.id && <span className="h-1.5 w-1.5 rounded-full bg-terracotta" />}
                              {m.label}
                            </span>
                          </Button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Text area + slash palette */}
      <div className="relative p-1.5">
        {paletteOpen && paletteItems.length > 0 && (
          <div className="absolute bottom-[calc(100%+4px)] right-1.5 left-1.5 z-50 overflow-hidden rounded-lg border border-line bg-white shadow-xl dark:bg-[#1E1E21]">
            {paletteItems.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setText('');
                  setPaletteOpen(false);
                  onSlash(c.id, '', c.name);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[#FDF0E6] dark:hover:bg-[#2A1E15]"
              >
                <span className="font-mono font-semibold text-terracotta">{c.name}</span>
                <span className="text-zinc-500">{c.hint}</span>
                <span className="ml-auto hidden font-mono text-[11px] text-zinc-400 sm:inline">{c.usage}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          rows={1}
          aria-label="Message Lokma"
          placeholder={socketOpen ? 'Ask Lokma — @file for context, / for commands' : 'Connecting…'}
          value={text}
          disabled={!socketOpen && !(mode === 'queue' && streaming)}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            setPaletteOpen(isSlashPrefix(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
            if (e.key === 'Escape') setPaletteOpen(false);
          }}
          className="min-h-[28px] w-full resize-none bg-transparent px-1 py-1 text-[13px] focus:outline-none disabled:opacity-60"
        />
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {attachments.map((a) => (
              <Badge key={a.name} variant="outline" className="gap-1 border-[#F2D5C2] bg-[#FDF0E6] pr-1 text-terracotta">
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{a.name}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.name !== a.name))}
                  className="ml-1 grid h-4 w-4 place-items-center rounded-full hover:bg-black/5"
                  aria-label={`Remove attachment ${a.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {queued.length > 0 && (
          <div className="mt-2 space-y-1">
            {queued.map((q) => (
              <div key={q.key} className="flex items-center gap-2 rounded-md border border-dashed border-line px-2 py-1 text-xs text-zinc-500">
                <span className="truncate">Queued: {q.text}</span>
                <button
                  onClick={() => setQueued((prev) => prev.filter((x) => x.key !== q.key))}
                  className="ml-auto grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-black/5"
                  title="Remove from queue"
                  aria-label={`Remove queued message: ${q.text.slice(0, 60)}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} title="Attach text files (inlined into the prompt)" aria-label="Attach text files (inlined into the prompt)" className="h-7 w-7 p-0">
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.py,.rs,.go,.yaml,.yml,.toml,.sh,.sql,.xml,.log"
            onChange={(e) => {
              if (e.target.files) attachFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={toggleMic}
            title="Dictate"
            aria-label={recording ? 'Stop dictation' : 'Dictate with microphone'}
            aria-pressed={recording}
            className={cn('h-7 w-7 p-0', recording && 'animate-pulse border-red-300 text-red-600')}
          >
            <Mic className="h-3.5 w-3.5" />
          </Button>
          {recording && (
            <span className="flex items-center gap-1 text-[11px] text-red-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Rec
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden text-[11px] text-zinc-400 sm:inline">Enter send · Shift+Enter newline · / commands</span>
            {streaming ? (
              <Button onClick={onStop} title="Stop the stream (keeps partial output)" className="h-7 gap-1 rounded-full border-0 bg-[#262624] pr-3 pl-3 text-white hover:bg-black">
                <Square className="h-3 w-3" /> Stop
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!canSend}
                className="h-7 gap-1 rounded-full border-0 bg-[#C96442] pr-1.5 pl-3 text-white hover:bg-[#B85736]"
              >
                Send
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20">
                  <Sparkles className="h-3 w-3" />
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
