import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Sidebar — left/right panels (static Phase 0, flexlayout-react in Phase 1).
 * One component with variant prop — DRY over two files.
 */

export function Sidebar({ side, title, children }: { side: 'left' | 'right'; title: string; children: React.ReactNode }) {
  return (
    <aside className={`flex w-[280px] shrink-0 flex-col border-${side === 'left' ? 'r' : 'l'} bg-card`}>
      <div className="flex h-10 items-center border-b px-3">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="outline" className="ml-auto text-[10px]">{side}</Badge>
      </div>
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </aside>
  );
}

export function InfoPanel() {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Stack A</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground leading-relaxed">
          Next 15 + Tailwind v4 + shadcn/ui + Fastify 5 + flexlayout-react + WS/SSE. Two surfaces share the same <code className="rounded bg-muted px-1">lokma-shared</code> and <code className="rounded bg-muted px-1">SessionStore JSONL</code>.
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Themes</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {['claude', 'omp', 'midnight', 'paper'].map((t) => (
            <Badge key={t} variant={t === 'omp' ? 'default' : 'outline'}>{t}</Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
