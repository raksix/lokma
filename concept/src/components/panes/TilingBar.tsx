import { Button } from "@/components/ui/button"

export function TilingBar({
  windowed,
  onToggleWindowed,
  onAddPane,
  onOpenTerminal,
  onOpenAgents,
  onOpenGit,
  onOpenVault,
  onOpenArchify,
  onOpenDesign,
  onSave,
  onReset,
  onSingle,
}: {
  windowed: boolean
  onToggleWindowed: () => void
  onAddPane: () => void
  onOpenTerminal: () => void
  onOpenAgents: () => void
  onOpenGit: () => void
  onOpenVault: () => void
  onOpenArchify: () => void
  onOpenDesign: () => void
  onSave: () => void
  onReset: () => void
  onSingle: () => void
}) {
  return (
    <div className="h-8 flex items-center gap-1.5 px-3 border-b border-line bg-white dark:bg-[#161618] shrink-0 overflow-x-auto">
      <span className="px-2 py-1 rounded-md bg-[#262624] text-white text-xs hidden sm:inline">Tiling</span>
      <span className="text-xs text-zinc-500 hidden sm:inline whitespace-nowrap">3 pane · file drop · sola böl · windowed serbest</span>
      <span className="ml-auto flex gap-1 shrink-0">
        <Button variant={windowed ? "ink" : "outline"} size="sm" className="h-6 text-xs gap-1" onClick={onToggleWindowed}>Windowed</Button>
        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={onAddPane}>+ Pane</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs hidden lg:inline-flex" onClick={onOpenTerminal}>+ Terminal</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs hidden lg:inline-flex" onClick={onOpenAgents}>+ Agents</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs hidden lg:inline-flex" onClick={onOpenGit}>+ Git</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs hidden xl:inline-flex" onClick={onOpenVault}>+ Vault</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs hidden xl:inline-flex" onClick={onOpenArchify}>+ Archify</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs hidden xl:inline-flex" onClick={onOpenDesign}>+ Design</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs hidden sm:inline-flex" onClick={onSave}>Save</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs hidden sm:inline-flex" onClick={onReset}>Reset</Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onSingle}>Tekil</Button>
      </span>
    </div>
  )
}
