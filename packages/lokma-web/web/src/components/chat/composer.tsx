import * as React from 'react';
import {
  Brain,
  ChevronDown,
  LifeBuoy,
  ListTree,
  LoaderCircle,
  Mic,
  Paperclip,
  Search,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { PROMPT_FILE_CHAR_CAP, PROMPT_IMAGE_BASE64_CHARS, PROMPT_MAX_FILES, PROMPT_MAX_IMAGES, type PromptFile, type PromptImage, type ReasoningEffort } from '@lokma/shared/protocol/ws';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api, type SlashCommandInfo } from '@/lib/api';
import { useProviderStore } from '@/stores';
import { emitToast } from '@/components/shell';
import { MAX_IMAGE_EDGE, downscaleDims, formatImageMarker, hasOsFiles, isImageAttachment, isSlashPrefix, parseMentions, parseSlashCommand, removeMention } from './composer-utils';
import { appendMention } from '@/components/files';
import { enabledModels } from '@/components/providers/models';

/**
 * Composer — chat input ported from the concept shell into the harness.
 * Real wiring only: models come from the providerStore cache
 * (`GET /api/models`), `/` lists the server-owned `GET /api/commands`
 * registry, `@path` mentions travel to the server as `contextPaths`
 * (the server reads them into model context), attachments inline their
 * real content (Ctrl+V paste + OS drag-drop feed the same path —
 * images attach as thumbnail + marker), stop fires the WS interrupt.
 */

export type ComposerSend = { text: string; model: string; contextPaths: string[]; reasoningEffort: ReasoningEffort; images: PromptImage[]; files: PromptFile[] };

type QueuedPrompt = { key: number; text: string };

const MODE_KEY = 'lokma-composer-mode';
const THINKING_KEY = 'lokma-composer-thinking';
/**
 * Composer thinking picker (REQ-133 → REQ-139) — `off` sends no reasoning
 * field. The list is Hermes' EFFORT_LADDER verbatim (minimal → max) rather
 * than a per-model menu: adapters clamp the pick down to the nearest level the
 * model accepts, so the list can stay honest without lying about the model.
 */
const THINKING_LEVELS: { id: ReasoningEffort; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra High' },
  { id: 'max', label: 'Max' },
];

/** Persisted pick; unknown/stale values fall back to `off`. */
export function readThinking(): ReasoningEffort {
  try {
    const raw = localStorage.getItem(THINKING_KEY);
    return THINKING_LEVELS.some((l) => l.id === raw) ? (raw as ReasoningEffort) : 'off';
  } catch {
    return 'off';
  }
}

const MAX_ATTACH_BYTES = 50 * 1024 * 1024;
/** How much of a text file is inlined into the prompt (REQ-113/REQ-187) —
 *  the rest is noted, not sent, so a 50MB attach cannot nuke the context
 *  window. Sourced from the shared protocol cap: the frame validator rejects
 *  more, and the slack there covers the truncation marker. */
const INLINE_BUDGET_CHARS = PROMPT_FILE_CHAR_CAP;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACH_FILES = 20;
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

/** One file queued on the composer — text inlines content, images carry a thumbnail + real wire bytes (REQ-186). */
export type Attachment = { name: string; mime: string; size: number; content: string; kind: 'text' | 'image'; previewUrl?: string; image?: PromptImage };

/** One wire-ready image (REQ-186) — the encoded payload plus display facts. */
type EncodedImage = {
  image: PromptImage;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scaled: boolean;
  bytes: number;
};

/**
 * Downscale + encode one image for the prompt frame (REQ-186). The frame
 * budget is finite (the server caps WS payloads), so an oversize encode
 * steps down a ladder of edges/qualities; a payload that still exceeds the
 * shared protocol cap is refused with an honest error instead of wedging
 * the socket.
 */
async function encodeImageForWire(file: File): Promise<EncodedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: image could not be decoded`);
  }
  try {
    const steps: { edge: number; quality: number }[] = [
      { edge: MAX_IMAGE_EDGE, quality: 0.85 },
      { edge: 1176, quality: 0.8 },
      { edge: 882, quality: 0.75 },
    ];
    for (const step of steps) {
      const { width, height, scaled } = downscaleDims(bitmap.width, bitmap.height, step.edge);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(`${file.name}: this browser cannot encode images`);
      // JPEG has no alpha — composite over white so transparent PNGs don't
      // come out black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', step.quality);
      const comma = dataUrl.indexOf(',');
      const dataBase64 = comma === -1 ? '' : dataUrl.slice(comma + 1);
      const encoded: EncodedImage = {
        image: { name: file.name, mime: 'image/jpeg', dataBase64 },
        width,
        height,
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
        scaled,
        bytes: Math.round(dataBase64.length * 0.75),
      };
      if (dataBase64.length > 0 && dataBase64.length <= PROMPT_IMAGE_BASE64_CHARS) return encoded;
    }
    throw new Error(`${file.name}: image stays too large to send after downscaling — try a smaller crop`);
  } finally {
    bitmap.close();
  }
}

/** Read a pasted/dropped image — thumbnail + marker, plus the real wire bytes (REQ-186). */
async function readImageAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error(`${file.name}: images must be under 5MB`));
  }
  const previewUrl = URL.createObjectURL(file);
  try {
    const encoded = await encodeImageForWire(file);
    const sizeKb = Math.max(1, Math.round(encoded.bytes / 1024));
    const dims = `${encoded.width}x${encoded.height}`;
    const scaledFrom = encoded.scaled ? `${encoded.sourceWidth}x${encoded.sourceHeight}` : undefined;
    return {
      name: file.name,
      mime: encoded.image.mime,
      size: file.size,
      content: formatImageMarker(file.name, dims, sizeKb, scaledFrom),
      kind: 'image',
      previewUrl,
      image: encoded.image,
    };
  } catch (e) {
    URL.revokeObjectURL(previewUrl);
    throw e;
  }
}

/** Release a thumbnail object URL (no-op for text attachments). */
function revokeAttachment(a: Attachment): void {
  if (!a.previewUrl) return;
  try {
    URL.revokeObjectURL(a.previewUrl);
  } catch {
    // Already revoked or never created — the chip is gone either way.
  }
}

/**
 * REQ-187: wire shape for the text-kind attachments (pure — probe it).
 * Images are NOT files: they ride `ComposerSend.images` as bytes (REQ-186).
 */
export function promptFilesFor(attachments: Attachment[]): PromptFile[] {
  return attachments.flatMap((a) =>
    a.kind === 'text'
      ? [{ name: a.name, mime: a.mime, size: a.size, content: a.content }]
      : [],
  );
}

/**
 * REQ-071/REQ-187: double-Enter guard key — the text plus the attachment
 * names, so two sends with the same text but different files never collapse
 * and a fast second Enter on an identical payload still does.
 */
export function sendDedupeKey(body: string, attachments: Attachment[]): string {
  return `${body}\n--${attachments.map((a) => a.name).join('\n')}`;
}
/** Best-effort MIME for a file the browser left untyped (common text names). */
function mimeForFile(file: File): string {
  if (file.type) return file.type;
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  const map: Record<string, string> = {
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'text/toml',
    '.log': 'text/plain',
  };
  return map[ext] ?? 'text/plain';
}

/** Read a user-attached file as text (binary/oversize files are refused). */
function readAttachment(file: File): Promise<Attachment> {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (file.size > MAX_ATTACH_BYTES) {
    return Promise.reject(
      new Error(`${file.name}: files over 50MB cannot be attached`),
    );
  }
  if (!TEXT_EXTENSIONS.has(ext)) {
    return Promise.reject(
      new Error(
        `${file.name}: binary files can't be inlined as text — convert to .txt/.md first`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const full = typeof reader.result === 'string' ? reader.result : '';
      // REQ-113/REQ-187: cap what rides into the prompt; note the remainder.
      const content =
        full.length > INLINE_BUDGET_CHARS
          ? `${full.slice(0, INLINE_BUDGET_CHARS)}\n…[file truncated: ${full.length} chars total, first ${INLINE_BUDGET_CHARS} shown]`
          : full;
      resolve({ name: file.name, mime: mimeForFile(file), size: file.size, content, kind: 'text' as const });
    };
    reader.onerror = () => reject(new Error(`${file.name}: could not be read`));
    reader.readAsText(file);
  });
}

/** Route one file to the text or image attachment path. */
function readOneAttachment(file: File): Promise<Attachment> {
  if (isImageAttachment(file.name, file.type)) return readImageAttachment(file);
  if (file.name.toLowerCase().endsWith('.pdf')) return extractPdfAttachment(file);
  return readAttachment(file);
}

/** PDF attach (REQ-114) — bytes go to the server, extracted text comes back. */
function extractPdfAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      if (!(buf instanceof ArrayBuffer)) {
        reject(new Error(`${file.name}: could not be read`));
        return;
      }
      const bytes = new Uint8Array(buf);
      let bin = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      api
        .extractPdf({ name: file.name, dataBase64: btoa(bin) })
        .then((r) =>
          resolve({ name: file.name, mime: 'application/pdf', size: file.size, content: r.text, kind: 'text' as const }),
        )
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          reject(new Error(`${file.name}: ${msg}`));
        });
    };
    reader.onerror = () => reject(new Error(`${file.name}: could not be read`));
    reader.readAsArrayBuffer(file);
  });
}

export function Composer({
  model,
  streaming,
  status,
  socketOpen,
  paletteSignal,
  dropSignal,
  onSend,
  onStop,
  onSlash,
  onPickModel,
  placeholder,
}: {
  model: string;
  streaming: boolean;
  /** Live run status line (REQ-112) — shown under the input while working. */
  status?: string | null;
  socketOpen: boolean;
  /** Increment to force-open the `/` palette (the `/help` command). */
  paletteSignal: number;
  /** File dropped from the explorer (or its context menu) — spliced as `@path`. */
  dropSignal?: { path: string; key: number } | null;
  onSend: (send: ComposerSend) => void;
  onStop: () => void;
  onSlash: (id: string, args: string, fullText: string) => void;
  onPickModel: (id: string) => void;
  /** REQ-161 — caller-supplied copy (Bots mode: `Message <bot name>`). */
  placeholder?: string;
}) {
  const [text, setText] = React.useState('');
  const [mode, setMode] = React.useState<'steer' | 'queue'>(readMode);
  const [thinking, setThinking] = React.useState<ReasoningEffort>(readThinking);
  const [thinkOpen, setThinkOpen] = React.useState(false);
  const [modelOpen, setModelOpen] = React.useState(false);
  const [modelQuery, setModelQuery] = React.useState('');
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [commands, setCommands] = React.useState<SlashCommandInfo[]>([]);
  const [queued, setQueued] = React.useState<QueuedPrompt[]>([]);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [dragActive, setDragActive] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const keySeq = React.useRef(0);
  /** Nesting depth for the OS-file drag overlay (dragenter/leave fire per child). */
  const dragDepth = React.useRef(0);
  /** REQ-071: double-Enter guard — setText is async, so a fast second Enter
   * re-delivers the same text before the box clears (double user rows). */
  const lastSent = React.useRef<{ text: string; at: number }>({ text: '', at: 0 });

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
    const groups = new Map<string, { id: string; label: string; provider: string; unsupported?: boolean }[]>();
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
      // REQ-187: attachments are first-class inputs — a file-only (or
      // image-only) message has no text but is still a send.
      if (!body && attachments.length === 0) return;
      // REQ-186: image markers stay in the text (they orient the model).
      // REQ-187: file content NO LONGER dumps into the text — files ride the
      // frame's `files` array, the server assembles the model's `<file>`
      // blocks, and the chat renders a card instead of a raw content wall.
      const images = attachments.flatMap((a) => (a.kind === 'image' && a.image ? [a.image] : []));
      let full = body;
      if (images.length > 0) {
        full += attachments
          .filter((a) => a.kind === 'image')
          .map((a) => `\n\n${a.content}`)
          .join('');
      }
      const files = promptFilesFor(attachments);
      const now = Date.now();
      const sendKey = sendDedupeKey(body, attachments);
      if (sendKey === lastSent.current.text && now - lastSent.current.at < 1500) return;
      lastSent.current = { text: sendKey, at: now };
      const slash = parseSlashCommand(body);
      if (slash && commands.some((c) => c.id === slash.id)) {
        onSlash(slash.id, slash.args, body);
        return;
      }
      if (slash) {
        emitToast(`Unknown command /${slash.id} — try /help`);
        return;
      }
      if (attachments.length) {
        for (const a of attachments) revokeAttachment(a);
        setAttachments([]);
      }
      onSend({ text: full, model, contextPaths: parseMentions(body).map((m) => m.path), reasoningEffort: thinking, images, files });
    },
    [attachments, commands, contextPaths, model, onSend, thinking],
  );

  const handleSend = (): void => {
    if ((!text.trim() && attachments.length === 0) || (!socketOpen && mode === 'steer')) return;
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
    if (arr.length === 0) return;
    if (attachments.length + arr.length > MAX_ATTACH_FILES) {
      emitToast(`At most ${MAX_ATTACH_FILES} files per message`);
      return;
    }
    // REQ-186: images ride the prompt frame as bytes — the protocol caps how
    // many fit, so refuse the excess here instead of failing the send.
    const imagesHeld = attachments.filter((a) => a.kind === 'image').length;
    const incomingImages = arr.filter((f) => isImageAttachment(f.name, f.type)).length;
    if (imagesHeld + incomingImages > PROMPT_MAX_IMAGES) {
      emitToast(`At most ${PROMPT_MAX_IMAGES} images per message`);
      return;
    }
    // REQ-187: same for text files — the frame caps how many files ride.
    const filesHeld = attachments.filter((a) => a.kind === 'text').length;
    const incomingFiles = arr.filter((f) => !isImageAttachment(f.name, f.type)).length;
    if (filesHeld + incomingFiles > PROMPT_MAX_FILES) {
      emitToast(`At most ${PROMPT_MAX_FILES} files per message`);
      return;
    }
    void Promise.all(arr.map(readOneAttachment))
      .then((items) => {
        setAttachments((prev) => [...prev, ...items]);
      })
      .catch((e: Error) => emitToast(e.message));
  };

  const removeAttachment = (name: string): void => {
    setAttachments((prev) => {
      for (const a of prev) {
        if (a.name === name) revokeAttachment(a);
      }
      return prev.filter((x) => x.name !== name);
    });
  };

  /** OS-file drag helpers — explorer @path drags (no `Files` type) stay on the parent Card. */
  const dragHasFiles = (e: React.DragEvent): boolean => hasOsFiles(Array.from(e.dataTransfer.types));

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

  const canSend = (text.trim().length > 0 || attachments.length > 0) && (socketOpen || (mode === 'queue' && streaming));

  return (
    <div
      className="relative rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(38,38,36,0.06),0_4px_12px_rgba(38,38,36,0.04)] dark:bg-[#1E1E21]"
      onDragEnter={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragOver={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!dragHasFiles(e)) return;
        e.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDrop={(e) => {
        if (!dragHasFiles(e) || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragActive(false);
        attachFiles(e.dataTransfer.files);
        taRef.current?.focus();
      }}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-terracotta bg-[#FDF0E6]/90 dark:bg-[#2A1E15]/90">
          <span className="flex items-center gap-2 text-[13px] font-medium text-terracotta">
            <Paperclip className="h-4 w-4" /> Drop files to attach
          </span>
        </div>
      )}
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
          <div className="inline-flex rounded-full border border-line bg-muted p-0.5 dark:border-[#262624] dark:bg-[#262624]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => switchMode('steer')}
              title="Steer — send immediately"
              aria-label="Steer mode — send immediately"
              aria-pressed={mode === 'steer'}
              className={cn(
                'h-6 w-6 rounded-full p-0',
                mode === 'steer' ? 'bg-white text-ink shadow-sm hover:bg-white' : 'text-zinc-500 hover:bg-white hover:text-ink dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white',
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
                mode === 'queue' ? 'bg-white text-ink shadow-sm hover:bg-white' : 'text-zinc-500 hover:bg-white hover:text-ink dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white',
              )}
            >
              <ListTree className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Button
              id="lokma-composer-model"
              variant="outline"
              size="sm"
              onClick={() => setModelOpen((v) => !v)}
              title="Model select (Ctrl+M)"
              className="h-6 max-w-[150px] gap-1 rounded-full border-line bg-white pr-1 pl-1.5 text-xs"
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#262624] text-[9px] text-white">L</span>
              <span className="truncate">{activeLabel}</span>
              <ChevronDown className={cn('h-3 w-3 shrink-0 text-zinc-400 transition-transform', modelOpen && 'rotate-180')} />
            </Button>
            {modelOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} />
                <div className="absolute right-0 bottom-[calc(100%+8px)] z-50 flex max-h-[420px] w-[340px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-2xl dark:border-[#2A2A2E] dark:bg-[#111113]">
                  <div className="border-b border-line p-2 dark:border-white/10">
                    <div className="relative">
                      <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                      <input
                        autoFocus
                        placeholder="Search models"
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                        className="h-8 w-full rounded-lg border border-line bg-muted pr-3 pl-8 text-[13px] text-ink placeholder:text-zinc-400 focus:outline-none dark:border-white/10 dark:bg-[#1E1E20] dark:text-white dark:placeholder:text-zinc-500"
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
                              'mx-1 w-[calc(100%-8px)] justify-start text-[13px] text-ink hover:bg-muted dark:text-white dark:hover:bg-white/10 dark:hover:text-white',
                              model === m.id && 'border border-line bg-muted dark:border-white/5 dark:bg-white/10',
                            )}
                          >
                            <span className="flex items-center gap-1.5">
                              {model === m.id && <span className="h-1.5 w-1.5 rounded-full bg-terracotta" />}
                              {m.label}
                              {m.unsupported === true && (
                                <span
                                  className="shrink-0 rounded border border-amber-300 bg-amber-50 px-1 py-px text-[9px] font-medium text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-500"
                                  title="Upstream reported this model id as unsupported on this endpoint"
                                >
                                  not on server
                                </span>
                              )}
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
          placeholder={placeholder ?? (socketOpen ? 'Ask Lokma — @file for context, / for commands' : 'Connecting…')}
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
          onPaste={(e) => {
            const files = e.clipboardData?.files;
            if (files && files.length > 0) attachFiles(files);
          }}
          className="min-h-[28px] w-full resize-none bg-transparent px-1 py-1 text-[13px] focus:outline-none disabled:opacity-60"
        />
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {attachments.map((a) => (
              <Badge
                key={a.name}
                variant="outline"
                className="gap-1 border-[#F2D5C2] bg-[#FDF0E6] pr-1 text-terracotta"
                title={a.kind === 'image' ? a.content : undefined}
              >
                {a.kind === 'image' && a.previewUrl ? (
                  <img src={a.previewUrl} alt={a.name} className="h-6 w-6 rounded object-cover" />
                ) : (
                  <Paperclip className="h-3 w-3" />
                )}
                <span className="max-w-[120px] truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.name)}
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
            accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.py,.rs,.go,.yaml,.yml,.toml,.sh,.sql,.xml,.log,.pdf,.png,.jpg,.jpeg,.gif,.webp"
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
          {/* REQ-133: thinking budget for the next prompt — sits with the input tools. */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThinkOpen((v) => !v)}
              title="Thinking budget for the next prompt — the level rides every request; a model that does not publish reasoning shows no thinking block."
              aria-label="Thinking budget"
              aria-expanded={thinkOpen}
              className={cn(
                'h-7 gap-1 px-2 text-[11px]',
                thinking !== 'off' &&
                  'border-[#F2D5C2] bg-[#FDF0E6] text-terracotta dark:border-[#5A3A28] dark:bg-[#2A1E15] dark:text-[#E8A87C]',
              )}
            >
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Thinking</span>
              <span className="font-medium">{THINKING_LEVELS.find((l) => l.id === thinking)?.label}</span>
              <ChevronDown
                className={cn('h-3 w-3 shrink-0 text-zinc-400 transition-transform', thinkOpen && 'rotate-180')}
              />
            </Button>
            {thinkOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setThinkOpen(false)} />
                <div
                  data-effort-menu
                  className="absolute bottom-[calc(100%+8px)] left-0 z-50 max-h-[240px] w-[168px] overflow-y-auto rounded-xl border border-line bg-white p-0.5 shadow-2xl dark:border-[#2A2A2E] dark:bg-[#111113]"
                >
                  <div className="px-2 pt-1.5 pb-0.5 text-[9.5px] font-semibold tracking-widest text-zinc-500 uppercase">
                    Effort
                  </div>
                  {THINKING_LEVELS.map((l) => (
                    <button
                      key={l.id}
                      data-effort-option={l.id}
                      onClick={() => {
                        setThinking(l.id);
                        setThinkOpen(false);
                        try {
                          localStorage.setItem(THINKING_KEY, l.id);
                        } catch {
                          /* Private mode / quota — the pick still applies for this session. */
                        }
                      }}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12.5px] leading-5 text-ink hover:bg-muted dark:text-white dark:hover:bg-white/10',
                        thinking === l.id && 'bg-muted font-medium dark:bg-white/10',
                      )}
                    >
                      <span className="flex w-2 shrink-0 justify-center">
                        {thinking === l.id && <span className="h-1.5 w-1.5 rounded-full bg-terracotta" />}
                      </span>
                      {l.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
        {streaming && status ? (
          <div className="flex items-center gap-1.5 px-1 pt-1.5 text-[11px] text-zinc-500" role="status" aria-live="polite">
            <LoaderCircle className="h-3 w-3 animate-spin text-[#C96442]" />
            <span className="animate-pulse">{status}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
