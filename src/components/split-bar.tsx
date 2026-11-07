import { cn } from "@/lib/utils"

export type SplitPart = {
  key: string
  label: string
  amount: string
  percent: number
  percentLabel: number
  colour: string
  /** Days behind this part, where that means something. */
  days?: string
}

/** A thin bar split into parts. The track stays when every part is 0, so nothing moves. */
export function SplitBar({ parts }: { parts: SplitPart[] }) {
  return (
    <div aria-hidden className="flex h-2 gap-0.5 rounded-[2px] bg-muted">
      {parts
        .filter((p) => p.percent > 0)
        .map((p) => (
          <div
            key={p.key}
            className="min-w-1 rounded-[2px]"
            style={{ width: `${p.percent}%`, background: p.colour }}
          />
        ))}
    </div>
  )
}

export function Dot({
  colour,
  className,
}: {
  colour: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-[2px]", className)}
      style={{ background: colour }}
    />
  )
}

/** The bar's text equivalent. Figures have a fixed width, so labels never rewrap. */
export function SplitLegend({
  parts,
  amount,
  percent = true,
}: {
  parts: SplitPart[]
  amount: (value: string) => string
  percent?: boolean
}) {
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {parts.map((p) => (
        <li key={p.key} className="flex items-baseline gap-2">
          <Dot colour={p.colour} className="self-center" />
          <span className="min-w-0 flex-1 truncate" title={p.label}>
            {p.label}
          </span>
          {parts.some((x) => x.days !== undefined) && (
            <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">
              {p.days !== undefined && `${p.days}d`}
            </span>
          )}
          <span className="w-20 shrink-0 text-right font-medium tabular-nums">
            {amount(p.amount)}
          </span>
          {percent && (
            <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums">
              {p.percentLabel}%
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
