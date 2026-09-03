import { Card } from '@/components/ui/card';
import { STARTER_PROMPTS, timeGreeting } from './composer-utils';

/**
 * HeroSection — empty-state hero ported from the concept `HeroSection.tsx`.
 * Same look (cream/terracotta tokens, serif headline, 3 starter cards);
 * different wiring: every card calls `onStart(prompt)`, which creates a
 * REAL harness session (`POST /api/sessions`) with the prompt prefilled —
 * never a fake `onOpenTab` mock tab. The greeting is time-based on purpose:
 * the concept hardcodes a persona name ("Aylin") we must not invent.
 */
export function HeroSection({ onStart }: { onStart: (prompt: string) => void }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-1 text-[10.5px] font-medium dark:bg-[#1E1E21]">
          <span className="h-1.5 w-1.5 rounded-full bg-terracotta" /> Lokma Harness
        </span>
      </div>
      <h1 className="font-serif text-[30px] leading-[1.08] tracking-tight">
        {timeGreeting()}.<br />
        <span className="font-normal text-zinc-500 italic">What are we building today?</span>
      </h1>
      <p className="mt-2 text-[13px] text-zinc-500">
        Start with a brief. Each card below creates a real session backed by the harness server.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {STARTER_PROMPTS.map((c) => (
          <Card
            key={c.title}
            className="cursor-pointer p-3 transition-shadow hover:shadow-md"
            onClick={() => onStart(c.prompt)}
          >
            <div className="text-xs font-semibold">{c.title}</div>
            <div className="text-xs text-zinc-500">{c.desc}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
