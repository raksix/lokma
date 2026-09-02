export function StickyBar() {
  return (
    <div id="single-sticky" className="hidden sticky top-0 z-10 -mx-1 mb-3 px-2 py-1.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line shadow-sm items-center gap-2 cursor-pointer hover:border-terracotta/30" onClick={() => document.getElementById("single-msg-aylin")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
      <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-5 h-5 rounded-full object-cover border border-line" />
      <span className="text-xs font-medium truncate">Aylin — “Let's refactor the auth…”</span>
      <span className="ml-auto text-[11px] text-terracotta">↥ git</span>
    </div>
  )
}

export function DotNav({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="sticky top-1/2 self-start -translate-y-1/2 flex flex-col items-center gap-2 py-2 px-1 rounded-full bg-white dark:bg-[#1E1E21] border border-line shadow-sm h-fit">
      <button onClick={() => document.getElementById("single-msg-aylin")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="w-2 h-2 rounded-full bg-terracotta hover:scale-[1.4] transition shadow" title="Aylin — 14:31" />
      <button onClick={() => document.getElementById("single-msg-lokma")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600 hover:bg-terracotta transition" title="Lokma — 14:31" />
      <span className="w-px h-4 bg-line my-1" />
      <button onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} className="w-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-400" title="Başa git" />
    </div>
  )
}
