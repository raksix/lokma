import * as React from 'react';
import { Download, FileText } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * REQ-155 — one agent-sent chat attachment.
 * Images render inline (bytes fetched through the authed `/api/files/raw`
 * endpoint as a blob URL — an `<img src>` cannot carry the Bearer token);
 * everything else becomes a download card via `/api/files/download`.
 */
export type ChatAttachment = { path: string; name: string; mime: string; size: number };

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentView({ attachment, cwd }: { attachment: ChatAttachment; cwd: string }) {
  const inline = attachment.mime.startsWith('image/');
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!inline || !cwd) return;
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    api
      .readWorkspaceFileRaw(cwd, attachment.path)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [inline, cwd, attachment.path]);

  const download = React.useCallback(() => {
    if (!cwd) return;
    void api
      .downloadWorkspaceFile(cwd, attachment.path)
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = attachment.name;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(href), 4000);
      })
      .catch(() => {
        // The card stays put — a failed download is visible as "nothing happened".
      });
  }, [cwd, attachment.path, attachment.name]);

  if (inline && !failed && cwd) {
    return (
      <figure className="mt-2" data-chat-attachment="image">
        {url ? (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <img
            src={url}
            alt={attachment.name}
            className="max-h-[440px] w-auto max-w-full cursor-zoom-in rounded-lg border border-line bg-white"
            onClick={() => window.open(url, '_blank')}
          />
        ) : (
          <div className="grid h-40 w-72 place-items-center rounded-lg border border-dashed border-line text-xs text-zinc-400">
            Görsel yükleniyor…
          </div>
        )}
        <figcaption className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
          <span className="truncate">{attachment.name}</span>
          <span>·</span>
          <span>{formatBytes(attachment.size)}</span>
          <button
            type="button"
            className="ml-1 inline-flex items-center gap-1 hover:text-zinc-600"
            onClick={download}
          >
            <Download className="h-3 w-3" /> İndir
          </button>
        </figcaption>
      </figure>
    );
  }

  return (
    <div
      className="mt-2 flex max-w-md items-center gap-2 rounded-lg border border-line bg-muted/40 px-3 py-2"
      data-chat-attachment="file"
    >
      <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{attachment.name}</div>
        <div className="text-[11px] text-zinc-400">{formatBytes(attachment.size)}</div>
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-40"
        onClick={download}
        disabled={!cwd}
      >
        <Download className="h-3 w-3" /> İndir
      </button>
    </div>
  );
}
