import type { ReserveCompare } from "@/lib/ct-store"
import { CATEGORY_COLOUR, NEUTRAL_COLOUR } from "@/lib/forecast-colours"
import { formatPence } from "@/lib/format"
import { cn } from "@/lib/utils"

const COLOUR = {
  estimate: CATEGORY_COLOUR.set_asides,
  reserve: CATEGORY_COLOUR.money_in,
  rule: NEUTRAL_COLOUR,
}

const abs = (amount: string) => amount.replace(/^-/, "")
const negative = (amount: string) => amount.startsWith("-")

/** One sentence per pair, so the gap reads the right way round. */
function gapText(key: string, amount: string, rule: string) {
  const by = formatPence(abs(amount))
  const less = negative(amount)
  if (amount === "0.00") return null
  if (key === "estimate-reserve")
    return less
      ? `The reserve holds ${by} more than the estimate`
      : `The reserve is ${by} short of the estimate`
  if (key === "estimate-rule")
    return less
      ? `${rule} sets aside ${by} more than the estimate`
      : `${rule} sets aside ${by} less than the estimate`
  return less
    ? `The reserve holds ${by} less than ${rule} says`
    : `The reserve holds ${by} more than ${rule} says`
}

/** The estimate, the reserve and the rule on one scale, with each gap spelled out. */
export function Compare({ compare }: { compare: ReserveCompare }) {
  const rule = compare.bars.find((b) => b.key === "rule")?.label ?? "The rule"
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3 md:p-4">
      <h2 className="font-heading text-base font-semibold">
        How the three compare
      </h2>
      <ul className="flex flex-col gap-3">
        {compare.bars.map((b) => (
          <li
            key={b.key}
            className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3"
          >
            <span className="text-sm">{b.label}</span>
            <span aria-hidden className="h-2 rounded-[2px] bg-muted">
              <span
                className="block h-full min-w-1 rounded-[2px]"
                style={{ width: `${b.percent}%`, background: COLOUR[b.key] }}
              />
            </span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">
              {formatPence(b.amount)}
            </span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
        {compare.gaps.map((g) => {
          const text = gapText(g.key, g.amount, rule)
          return (
            <li
              key={g.key}
              className={cn(
                "tabular-nums",
                g.key === "estimate-reserve" &&
                  !negative(g.amount) &&
                  "font-semibold text-destructive"
              )}
            >
              {text ?? `${g.label}: no difference`}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        For the years not ticked as paid. The reserve balance is from the last
        Xero sync.
      </p>
    </section>
  )
}
