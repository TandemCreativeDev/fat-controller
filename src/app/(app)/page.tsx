import Link from "next/link"

import { MonthlyBars, ShareDonut, TrendLine } from "@/components/charts"
import { PageHeader } from "@/components/page-header"
import { StatRow, StatTile } from "@/components/stat-tile"
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
import {
  getCostsByAccount,
  getPnlMonthly,
  getUngroupedPnlAccounts,
} from "@/lib/pnl-store"
import { topWithOther } from "@/lib/series"
import { requireDirector } from "@/lib/session"
import { cn } from "@/lib/utils"

const short = (m: string) => formatMonth(m).replace(" 20", " '")
const money = (n: number) => (
  <span className={cn("tabular-nums", n < 0 && "text-destructive")}>
    {formatGbp(n)}
  </span>
)

export default async function HomePage() {
  await requireDirector()
  const [months, ungrouped, costs] = await Promise.all([
    getPnlMonthly(),
    getUngroupedPnlAccounts(),
    getCostsByAccount(),
  ])
  const asOf = months[0]?.asOf ?? null

  if (!asOf) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Monthly P&L" />
        <Card>
          <CardHeader>
            <CardTitle>No data yet</CardTitle>
            <CardDescription>
              Run a sync from{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>{" "}
              to pull invoices, bank transactions and journals from Xero.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const full = months.slice(0, -1)
  const current = months[months.length - 1]
  const totals = full.reduce(
    (t, m) => ({
      sales: t.sales + m.sales,
      peopleCosts: t.peopleCosts + m.peopleCosts,
      otherCosts: t.otherCosts + m.otherCosts,
      profit: t.profit + m.profit,
      ctSetAside: t.ctSetAside + m.ctSetAside,
    }),
    { sales: 0, peopleCosts: 0, otherCosts: 0, profit: 0, ctSetAside: 0 }
  )
  const { kept, other } = topWithOther(costs, 5)
  const costSlices = [
    ...kept.map((c) => ({ key: c.key, label: c.label, value: c.total })),
    ...(other.length
      ? [
          {
            key: "other",
            label: `Other (${other.length} accounts)`,
            value: other.reduce((t, c) => t + c.total, 0),
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Monthly P&L"
        lede="What came in, what went out on people, and what's left."
        note={
          <>
            Built from synced Xero invoices, bills, bank transactions and
            journals · as of {formatAsOf(asOf)}
          </>
        }
      />

      {ungrouped.length > 0 && (
        <Alert>
          <AlertDescription>
            Some P&amp;L accounts aren&apos;t counted in any column:{" "}
            {ungrouped.map((u) => u.account_name).join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      <StatRow>
        <StatTile
          label="Sales · last 12 months"
          value={formatGbp(totals.sales)}
          sub="excluding VAT"
        />
        <StatTile
          label="Profit · last 12 months"
          value={formatGbp(totals.profit)}
          sub={`${formatPercent(totals.sales ? totals.profit / totals.sales : null)} margin`}
          accent
        />
        <StatTile
          label="CT set-aside · last 12 months"
          value={formatGbp(totals.ctSetAside)}
        />
        <StatTile
          label={`${short(current.month)} to date`}
          value={formatGbp(current.sales)}
          sub={`sales · profit ${formatGbp(current.profit)}`}
        />
      </StatRow>

      <Card>
        <CardHeader>
          <CardTitle>Sales and costs</CardTitle>
          <CardDescription>
            Last 12 months and this month to date
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            className="h-72"
            series={[
              { key: "sales", label: "Sales" },
              { key: "peopleCosts", label: "People costs" },
              { key: "otherCosts", label: "Other costs" },
            ]}
            data={months.map((m) => ({
              label: short(m.month),
              sales: m.sales,
              peopleCosts: m.peopleCosts,
              otherCosts: m.otherCosts,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Profit by month</CardTitle>
            <CardDescription>Sales minus all costs</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendLine
              area
              format="gbp"
              className="h-56"
              series={[{ key: "profit", label: "Profit" }]}
              data={months.map((m) => ({
                label: short(m.month),
                profit: m.profit,
              }))}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Where the money goes</CardTitle>
            <CardDescription>
              Costs by account, last 12 full months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ShareDonut centerLabel="costs" slices={costSlices} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By month</CardTitle>
        </CardHeader>
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
              {[...months].reverse().map((m, i) => (
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
