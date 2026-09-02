import { Button } from "@/components/ui/button"

export function UserMessage({
  text,
  draft,
  editing,
  onDraftChange,
  onCancel,
  onSave,
  onEdit,
  onRewind,
  onCopy,
}: {
  text: string
  draft: string
  editing: boolean
  onDraftChange: (v: string) => void
  onCancel: () => void
  onSave: () => void
  onEdit: () => void
  onRewind: () => void
  onCopy: () => void
}) {
  return (
    <div id="single-msg-aylin" className="flex gap-3 group scroll-mt-16">
      <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-8 h-8 rounded-full object-cover border border-line shrink-0 mt-0.5 shadow-sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">Aylin</span>
          <span className="text-[11px] text-zinc-400">14:31</span>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-400">
            <span className="w-1 h-1 rounded-full bg-emerald-500" /> you
          </span>
        </div>
        {editing ? (
          <div className="mt-1.5 rounded-2xl bg-white dark:bg-[#1E1E21] border border-terracotta/30 shadow-sm p-2">
            <textarea value={draft} onChange={e => onDraftChange(e.target.value)} rows={3} className="w-full rounded-md border border-line bg-white dark:bg-[#0F0F11] p-2 text-[13px] focus:outline-none focus:border-terracotta/30" />
            <div className="mt-2 flex gap-1.5 justify-end">
              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="sm" className="h-6 text-[11px]" onClick={onSave}>
                Save & rewind
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-1.5 rounded-2xl rounded-tl-sm bg-white dark:bg-[#1E1E21] border border-line shadow-sm p-3.5 group-hover:border-line-strong group-hover:shadow-md transition">
              <div className="text-[13.5px] leading-[1.6]">{text}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded-full bg-[#FDF0E6] border border-[#F2D5C2] text-terracotta text-[11px]">auth.ts</span>
                <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[11px]">+18 lines</span>
              </div>
            </div>
            <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 transition flex-wrap">
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={onEdit}>
                ✎ Edit
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={onRewind}>
                ↩ Rewind
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={onCopy}>
                Copy
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
