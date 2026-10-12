import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** One headline figure: eyebrow label, big value, optional sub-line. */
export function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  accent?: boolean
}) {
  return (
    <Card size="sm" className="px-5 py-4">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          "font-heading text-2xl font-semibold tracking-[-0.03em] tabular-nums",
          accent && "text-gradient-accent"
        )}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Card>
  )
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>
}
