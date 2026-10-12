import Link from "next/link"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatAsOf, formatGbp, formatMonth, formatPercent } from "@/lib/format"
import { getPnlMonthly, getUngroupedPnlAccounts } from "@/lib/pnl-store"
import { requireDirector } from "@/lib/session"
import { cn } from "@/lib/utils"
import { PnlChart } from "./pnl-chart"

const money = (n: number) => (
  <span className={cn("tabular-nums", n < 0 && "text-destructive")}>
    {formatGbp(n)}
  </span>
)

export default async function HomePage() {
  await requireDirector()
  const [months, ungrouped] = await Promise.all([
    getPnlMonthly(),
    getUngroupedPnlAccounts(),
  ])
  const hasData = months.some((m) => m.asOf)
  const asOf = months.reduce<Date | null>(
    (max, m) => (m.asOf && (!max || m.asOf > max) ? m.asOf : max),
    null
  )

  if (!hasData) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-xl font-medium">Monthly P&amp;L</h1>
        <Card>
          <CardHeader>
            <CardTitle>No P&amp;L data yet</CardTitle>
            <CardDescription>
              Run a sync from{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>{" "}
              to pull the monthly Profit and Loss reports from Xero.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const totals = months.slice(0, -1).reduce(
    (t, m) => ({
      sales: t.sales + m.sales,
      peopleCosts: t.peopleCosts + m.peopleCosts,
      otherCosts: t.otherCosts + m.otherCosts,
      profit: t.profit + m.profit,
      ctSetAside: t.ctSetAside + m.ctSetAside,
    }),
    { sales: 0, peopleCosts: 0, otherCosts: 0, profit: 0, ctSetAside: 0 }
  )
  const rows = [...months].reverse()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-heading text-xl font-medium">Monthly P&amp;L</h1>
        <p className="text-sm text-muted-foreground">
          From Xero&apos;s Profit and Loss report · as of {formatAsOf(asOf)}
        </p>
      </div>

      {ungrouped.length > 0 && (
        <Alert>
          <AlertDescription>
            Some P&amp;L accounts aren&apos;t counted in any column:{" "}
            {ungrouped.map((u) => u.account_name).join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sales and people costs</CardTitle>
          <CardDescription>
            Last 12 months and this month to date
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PnlChart
            data={months.map((m) => ({
              label: formatMonth(m.month).replace(" 20", " '"),
              sales: m.sales,
              peopleCosts: m.peopleCosts,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">People costs</TableHead>
                <TableHead className="text-right">Other costs</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">CT set-aside</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m, i) => (
                <TableRow key={m.month}>
                  <TableCell>
                    {formatMonth(m.month)}
                    {i === 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        to date
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{money(m.sales)}</TableCell>
                  <TableCell className="text-right">
                    {money(m.peopleCosts)}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(m.otherCosts)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {money(m.profit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(m.margin)}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(m.ctSetAside)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Last 12 full months</TableCell>
                <TableCell className="text-right">
                  {money(totals.sales)}
                </TableCell>
                <TableCell className="text-right">
                  {money(totals.peopleCosts)}
                </TableCell>
                <TableCell className="text-right">
                  {money(totals.otherCosts)}
                </TableCell>
                <TableCell className="text-right">
                  {money(totals.profit)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(
                    totals.sales ? totals.profit / totals.sales : null
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {money(totals.ctSetAside)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
