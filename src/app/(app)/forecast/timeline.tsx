"use client"

import { useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TimelineCategory, TimelineMonth } from "@/lib/forecast"
import { formatDay, formatMonth, formatPence } from "@/lib/format"
import { cn } from "@/lib/utils"

const CATEGORIES: { key: TimelineCategory; label: string }[] = [
  { key: "money_in", label: "Client money" },
  { key: "contractors", label: "Contractors" },
  { key: "set_asides", label: "Set-asides" },
  { key: "directors", label: "Director pay" },
  { key: "running", label: "Running costs" },
  { key: "other", label: "Other" },
]

const SOURCE_LABEL: Record<string, string> = {
  actual: "Xero",
  tracked: "Tracked hours",
  forecast: "Forecast",
  override: "What-if",
  manual: "Entered",
}

/**
 * The timeline by month. Running costs start hidden, since the forecast has one
 * for every day; their effect is always in the balance.
 */
export function Timeline({
  months,
  today,
}: {
  months: TimelineMonth[]
  today: string
}) {
  const [hidden, setHidden] = useState<Set<TimelineCategory>>(
    new Set(["running"])
  )
  const toggle = (key: TimelineCategory) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <legend className="mb-2 text-sm font-medium">Show</legend>
        {CATEGORIES.map((c) => (
          <label
            key={c.key}
            className="flex min-h-8 cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              checked={!hidden.has(c.key)}
              onChange={() => toggle(c.key)}
              className="size-4 accent-violet-500"
            />
            {c.label}
          </label>
        ))}
      </fieldset>

      {months.map((m) => {
        const rows = m.rows.filter((r) => !hidden.has(r.category))
        return (
          <details
            key={m.month}
            open={today.slice(0, 7) === m.month.slice(0, 7)}
            className="rounded-lg border border-border"
          >
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-6 gap-y-1 p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="min-w-24 font-semibold">
                {formatMonth(m.month)}
              </span>
              <span>
                In{" "}
                <span className="tabular-nums">{formatPence(m.totalIn)}</span>
              </span>
              <span>
                Out{" "}
                <span className="tabular-nums">{formatPence(m.totalOut)}</span>
              </span>
              <span>
                Ends{" "}
                <span className="tabular-nums">{formatPence(m.closing)}</span>
              </span>
              <span
                className={cn(
                  "text-muted-foreground",
                  Number(m.lowest) < 0 && "font-medium text-destructive"
                )}
              >
                Lowest{" "}
                <span className="tabular-nums">{formatPence(m.lowest)}</span> on{" "}
                {formatDay(m.lowestOn)}
              </span>
            </summary>
            <div className="border-t border-border px-3 pb-3">
              {rows.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  Nothing to show with these filters.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Basis</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap">
                          {formatDay(r.date)}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {r.label}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {r.actual ? "Happened" : SOURCE_LABEL[r.source]}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.moneyIn && formatPence(r.moneyIn)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.moneyOut && formatPence(r.moneyOut)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            Number(r.balance) < 0 &&
                              "font-medium text-destructive"
                          )}
                        >
                          {formatPence(r.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
