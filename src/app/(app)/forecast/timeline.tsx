"use client"

import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { useState } from "react"

import {
  MonthPane,
  MonthSwipe,
  MonthSwitcher,
} from "@/components/month-context"
import { Dot } from "@/components/split-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { TimelineCategory } from "@/lib/forecast"
import { CATEGORY_COLOUR } from "@/lib/forecast-colours"
import type {
  TimelineChip,
  TimelineMonthView,
  TimelineView,
} from "@/lib/forecast-views"
import {
  formatBalance,
  formatDayName,
  formatMoney,
  formatMonth,
  formatPence,
} from "@/lib/format"
import { cn } from "@/lib/utils"

const CATEGORIES: { key: TimelineCategory; label: string }[] = [
  { key: "money_in", label: "Client money" },
  { key: "contractors", label: "Contractors" },
  { key: "set_asides", label: "Set-asides" },
  { key: "directors", label: "Director pay" },
  { key: "running", label: "Running costs" },
  { key: "other", label: "Other" },
]

function Chip({ chip, hidden }: { chip: TimelineChip; hidden: boolean }) {
  const Icon = chip.direction === "in" ? ArrowDownLeft : ArrowUpRight
  const list = chip.events
    .map((e) => `${e.label}: ${formatBalance(e.amount)}`)
    .join("\n")
  return (
    // Hidden chips keep their space, so filtering never moves a row.
    <span
      title={list}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs",
        chip.predicted ? "border-dashed border-primary/60" : "border-border",
        hidden && "invisible"
      )}
    >
      <Dot colour={chip.colour} />
      <span className="min-w-0">{chip.label}</span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 font-medium tabular-nums",
          chip.direction === "in" && "text-success"
        )}
      >
        <Icon aria-hidden className="size-3" />
        <span className="sr-only">
          {chip.direction === "in" ? "money in" : "money out"}{" "}
        </span>
        {formatMoney(chip.amount)}
      </span>
      {chip.events.length > 1 && <span className="sr-only">: {list}</span>}
    </span>
  )
}

function MonthBadges({ m }: { m: TimelineMonthView }) {
  const low = Number(m.lowest) < 0
  return (
    <>
      <Badge className="bg-success/15 text-foreground tabular-nums">
        In {formatMoney(m.totalIn)}
      </Badge>
      <Badge variant="secondary" className="tabular-nums">
        Out {formatMoney(m.totalOut)}
      </Badge>
      <Badge variant="outline" className="tabular-nums">
        Ends {formatBalance(m.closing)}
      </Badge>
      <Badge
        variant={low ? "default" : "outline"}
        className={cn(
          "h-auto whitespace-normal tabular-nums",
          low && "bg-destructive/20 text-foreground"
        )}
      >
        Lowest {formatBalance(m.lowest)} · {formatDayName(m.lowestOn)}
      </Badge>
    </>
  )
}

function BalanceBar({
  day,
  zeroAt,
  className,
}: {
  day: TimelineMonthView["days"][number]
  zeroAt: number
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn("relative h-2 rounded-[2px] bg-muted", className)}
    >
      <div
        className={cn(
          "absolute inset-y-0 rounded-[2px]",
          day.bar.negative ? "bg-destructive" : "bg-chart-1"
        )}
        style={{ left: `${day.bar.left}%`, width: `${day.bar.width}%` }}
      />
      <div
        className="absolute -inset-y-0.5 w-px bg-foreground/60"
        style={{ left: `${zeroAt}%` }}
      />
    </div>
  )
}

/** A day on mobile: a merged chip opens its events underneath, since touch has no tooltips. */
function MobileDay({
  day,
  zeroAt,
  hidden,
}: {
  day: TimelineMonthView["days"][number]
  zeroAt: number
  hidden: Set<TimelineCategory>
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const allHidden = day.chips.every((c) => hidden.has(c.category))
  const opened = day.chips.find(
    (c) => c.key === openKey && !hidden.has(c.category)
  )
  return (
    <li className="flex flex-col gap-2 border-b border-border/60 px-3 py-3 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="tabular-nums">
          {formatDayName(day.date)}
        </Badge>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            day.bar.negative && "font-medium text-destructive"
          )}
        >
          {formatBalance(day.balance)}
        </span>
      </div>
      <BalanceBar day={day} zeroAt={zeroAt} className="w-full" />
      <div className="relative flex min-h-6 min-w-0 flex-wrap gap-1.5">
        {day.chips.map((c) =>
          c.events.length > 1 && !hidden.has(c.category) ? (
            <button
              key={c.key}
              type="button"
              aria-expanded={openKey === c.key}
              onClick={() => setOpenKey(openKey === c.key ? null : c.key)}
              className="flex min-h-11 max-w-full items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Chip chip={c} hidden={false} />
            </button>
          ) : (
            <Chip key={c.key} chip={c} hidden={hidden.has(c.category)} />
          )
        )}
        {allHidden && (
          <span className="absolute inset-y-0 left-0 flex items-center text-xs text-muted-foreground">
            Hidden events only
          </span>
        )}
      </div>
      {opened && (
        <ul className="flex flex-col gap-1 rounded-md bg-muted/60 p-2 text-xs">
          {opened.events.map((e, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">{e.label}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {formatPence(e.amount.replace("-", ""))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Every cash event by day. Filters only hide chips: the balance still counts them. */
export function Timeline({
  view,
  today,
}: {
  view: TimelineView
  today: string
}) {
  const [hidden, setHidden] = useState<Set<TimelineCategory>>(new Set())
  const toggle = (key: TimelineCategory) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Show event types"
        data-no-swipe
        className="flex gap-2 max-md:overflow-x-auto max-md:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] max-md:pr-6 md:flex-wrap"
      >
        {CATEGORIES.map((c) => {
          const on = !hidden.has(c.key)
          return (
            <Button
              key={c.key}
              type="button"
              size="sm"
              variant={on ? "secondary" : "outline"}
              aria-pressed={on}
              onClick={() => toggle(c.key)}
              className={cn(!on && "text-muted-foreground line-through")}
            >
              <Dot colour={CATEGORY_COLOUR[c.key]} />
              {c.label}
            </Button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground md:hidden">
        Hidden types still count towards the balance.
      </p>
      <MonthSwitcher />

      <MonthSwipe className="md:hidden">
        {view.months.map((m) => (
          <MonthPane key={m.month} month={m.month}>
            <section className="rounded-lg border border-border bg-muted/40">
              <h2 className="px-3 pt-3 text-sm font-semibold">
                {formatMonth(m.month)}
              </h2>
              <div className="grid grid-cols-2 gap-2 p-3">
                <MonthBadges m={m} />
              </div>
              <ol className="flex flex-col border-t border-border">
                {m.days.map((d) => (
                  <MobileDay
                    key={d.date}
                    day={d}
                    zeroAt={view.zeroAt}
                    hidden={hidden}
                  />
                ))}
                {m.days.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">
                    No cash events this month.
                  </li>
                )}
              </ol>
            </section>
          </MonthPane>
        ))}
      </MonthSwipe>

      {view.months.map((m) => {
        return (
          <details
            key={m.month}
            open={today.slice(0, 7) === m.month.slice(0, 7)}
            className="rounded-lg border border-border bg-muted/40 max-md:hidden"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="mr-2 font-semibold">{formatMonth(m.month)}</span>
              <MonthBadges m={m} />
            </summary>
            <ol className="flex flex-col border-t border-border">
              {m.days.map((d) => {
                const allHidden = d.chips.every((c) => hidden.has(c.category))
                return (
                  <li
                    key={d.date}
                    className="grid items-center gap-x-4 gap-y-2 border-b border-border/60 px-3 py-2 last:border-0 md:grid-cols-[6.5rem_1fr_16rem]"
                  >
                    <Badge variant="outline" className="tabular-nums">
                      {formatDayName(d.date)}
                    </Badge>
                    <div className="relative flex min-w-0 flex-wrap gap-1.5">
                      {d.chips.map((c) => (
                        <Chip
                          key={c.key}
                          chip={c}
                          hidden={hidden.has(c.category)}
                        />
                      ))}
                      {allHidden && (
                        <span className="absolute inset-y-0 left-0 flex items-center text-xs text-muted-foreground">
                          Hidden events only
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          d.bar.negative && "font-medium text-destructive"
                        )}
                      >
                        {formatBalance(d.balance)}
                      </span>
                      <BalanceBar
                        day={d}
                        zeroAt={view.zeroAt}
                        className="w-[140px] shrink-0"
                      />
                    </div>
                  </li>
                )
              })}
              {m.days.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">
                  No cash events this month.
                </li>
              )}
            </ol>
          </details>
        )
      })}
    </div>
  )
}
