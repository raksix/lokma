import { Card } from "@/components/ui/card"

export function HeroSection({ onOpenTab }: { onOpenTab: (title: string, content: React.ReactNode) => void }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white dark:bg-[#1E1E21] border border-line text-[10.5px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-terracotta" /> Lokma Harness · #482
        </span>
      </div>
      <h1 className="font-serif text-[30px] leading-[1.08] tracking-tight">
        Good afternoon, Aylin.<br />
        <span className="italic font-normal text-zinc-500">What are we building today?</span>
      </h1>
      <p className="mt-2 text-[13px] text-zinc-500">Start with a brief. Lokma will scaffold the plan, run tools, and keep an inspectable trail. Dikey/yatay böl, windowed ile serbest taşı.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-6">
        {[
          { title: "Scaffold a new API", desc: "Fastify + Drizzle + auth" },
          { title: "Review this PR", desc: "Security, types, tests" },
          { title: "Design a landing", desc: "Figma → code" },
        ].map(c => (
          <Card key={c.title} className="p-3 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onOpenTab(c.title, <div className="p-3">{c.title} — new tab in focused pane</div>)}>
            <div className="text-xs font-semibold">{c.title}</div>
            <div className="text-xs text-zinc-500">{c.desc}</div>
          </Card>
        ))}
      </div>
    </>
  )
}
