import * as React from "react"
import { UserMessage } from "./UserMessage"
import { LokmaMessage } from "./LokmaMessage"
import { StickyBar, DotNav } from "./ChatNav"

export function SingleChatView({
  scrollRef,
  aylinText,
  draft,
  editing,
  onDraftChange,
  onCancel,
  onSave,
  onEdit,
  onRewind,
  onCopy,
  onOpenTab,
  onFork,
  CodePane,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  aylinText: string
  draft: string
  editing: boolean
  onDraftChange: (v: string) => void
  onCancel: () => void
  onSave: () => void
  onEdit: () => void
  onRewind: () => void
  onCopy: () => void
  onOpenTab: (title: string, content: React.ReactNode) => void
  onFork: (title: string) => void
  CodePane: React.ReactNode
}) {
  return (
    <div className="relative flex gap-3">
      <div className="flex-1 space-y-5 pr-2">
        <StickyBar />
        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-line" />
          <span className="text-[11px] tracking-widest uppercase text-zinc-400 bg-muted px-2 py-0.5 rounded-full border border-line">Today · 14:31</span>
          <div className="h-px flex-1 bg-line" />
        </div>
        <UserMessage text={aylinText} draft={draft} editing={editing} onDraftChange={onDraftChange} onCancel={onCancel} onSave={onSave} onEdit={onEdit} onRewind={onRewind} onCopy={onCopy} />
        <LokmaMessage onOpenTab={onOpenTab} onFork={onFork} CodePane={CodePane} />
      </div>
      <DotNav scrollRef={scrollRef} />
    </div>
  )
}
