import Link from "next/link"

import { PERIODS, type Period } from "@/lib/period"
import { cn } from "@/lib/utils"

/** This FY | Last FY | Lifetime, as links that keep the current page. */
export function PeriodSwitch({
  period,
  path,
}: {
  period: Period
  path: string
}) {
  return (
    <nav
      aria-label="Period"
      className="flex gap-1 rounded-xl bg-black/30 p-1 text-xs shadow-[0_0_24px_-8px_rgb(139_92_246/0.6)] ring-1 ring-violet-500/60"
    >
      {PERIODS.map((p) => {
        const active = p.key === period.key
        return (
          <Link
            key={p.key}
            href={p.key === "lifetime" ? path : `${path}?period=${p.key}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground",
              active &&
                "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/50"
            )}
          >
            {p.label}
          </Link>
        )
      })}
    </nav>
  )
}
