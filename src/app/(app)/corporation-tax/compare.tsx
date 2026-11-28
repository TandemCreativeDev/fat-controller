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

/** The estimate, the reserve and the rule on one scale, with each gap spelled out. */
export function Compare({ compare }: { compare: ReserveCompare }) {
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
              {formatPence(b.amount)}{" "}
              {/* Matches the under/over word below, so the figures line up. */}
              <span aria-hidden className="inline-block w-10" />
            </span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        {compare.gaps.map((g) => {
          const under = negative(g.amount)
          const alarm = g.key === "reserve-estimate" && under
          return (
            <div
              key={g.key}
              className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-baseline gap-3"
            >
              <dt className="text-muted-foreground">{g.label}</dt>
              <span />
              <dd
                className={cn(
                  "text-right tabular-nums",
                  alarm && "font-semibold text-destructive"
                )}
              >
                <span className="font-mono">{formatPence(abs(g.amount))}</span>{" "}
                <span className="inline-block w-10 text-left text-xs">
                  {g.amount === "0.00" ? "level" : under ? "under" : "over"}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
      {compare.reserveOwed !== "0.00" && (
        <p className="text-sm">
          {formatPence(compare.reserveOwed)} of the reserve is borrowed and not
          paid back yet.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        For the years not ticked as paid. The reserve balance is from the last
        Xero sync.
      </p>
    </section>
  )
}
