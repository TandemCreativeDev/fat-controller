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
import { formatDay, formatPence } from "@/lib/format"
import type { TimelineEvent } from "@/lib/forecast"
import { cn } from "@/lib/utils"

/** Every event with its running balance. Daily running costs hide by default. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  const [showDaily, setShowDaily] = useState(false)
  const shown = events.filter(
    (e) => showDaily || e.actual || e.type !== "running_cost"
  )
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showDaily}
          onChange={(e) => setShowDaily(e.target.checked)}
        />
        Show forecast daily running costs (their effect is always in the
        balance)
      </label>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((e, i) => (
            <TableRow
              key={i}
              className={cn(!e.actual && "text-muted-foreground")}
            >
              <TableCell className="whitespace-nowrap">
                {formatDay(e.date)}
              </TableCell>
              <TableCell>{e.label}</TableCell>
              <TableCell className="text-xs">{e.source}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPence(e.amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPence(e.balance)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
