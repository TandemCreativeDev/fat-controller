import Link from "next/link"

import { MonthlyBars, ShareDonut, TrendLine } from "@/components/charts"
import { PageHeader } from "@/components/page-header"
import { StatRow, StatTile } from "@/components/stat-tile"
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
import { formatGbp, formatMonth, formatPercent } from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { getStaffPay } from "@/lib/staff-store"

const short = (m: string) => formatMonth(m).replace(" 20", " '")
const money = (n: number) => (
  <span className="tabular-nums">{n === 0 ? "–" : formatGbp(n)}</span>
)

export default async function StaffPage() {
  await requireDirector()
  const { months, current, staff, monthly } = await getStaffPay()

  if (staff.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Staff" />
        <Card>
          <CardHeader>
            <CardTitle>No staff payments yet</CardTitle>
            <CardDescription>
              Staff pay comes from People-cost accounts other than directors
              (e.g. Salaries). Run a sync from{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const full = monthly.slice(0, -1)
  const since = formatMonth(months[0])
  const totalAll = monthly.reduce((t, m) => t + m.total, 0)
  const salesAll = monthly.reduce((t, m) => t + m.sales, 0)
  const lastMonth = full[full.length - 1] ?? monthly[0]
  const thisMonth = monthly[monthly.length - 1]
  const paidMonths = full.filter((m) => m.total > 0)
  const avgMonthly = paidMonths.length
    ? paidMonths.reduce((t, m) => t + m.total, 0) / paidMonths.length
    : 0
  const series = staff.map((p) => ({ key: p.key, label: p.name }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Staff"
        lede="What we pay staff each month, excluding directors."
        note="From People-cost lines (e.g. Salaries) in synced Xero transactions"
      />

      <StatRow>
        <StatTile
          label={`Since ${since}`}
          value={formatGbp(totalAll)}
          sub={`${formatPercent(salesAll ? totalAll / salesAll : null)} of sales`}
          accent
        />
        <StatTile
          label={`Last month · ${short(lastMonth.month)}`}
          value={formatGbp(lastMonth.total)}
          sub={`${lastMonth.headcount} paid`}
        />
        <StatTile
          label="This month to date"
          value={formatGbp(thisMonth.total)}
          sub={`${thisMonth.headcount} paid so far`}
        />
        <StatTile
          label="Average month"
          value={formatGbp(avgMonthly)}
          sub={`over ${paidMonths.length} full months with pay`}
        />
      </StatRow>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Monthly pay by person</CardTitle>
            <CardDescription>
              Since {since}, including this month to date
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars
              stacked
              series={series}
              data={months.map((m) => ({
                label: short(m),
                ...Object.fromEntries(
                  staff.map((p) => [p.key, p.byMonth[m] ?? 0])
                ),
              }))}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Share of staff cost</CardTitle>
            <CardDescription>Since {since}</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareDonut
              centerLabel="lifetime"
              slices={staff.map((p) => ({
                key: p.key,
                label: p.name,
                value: p.total,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff cost as a share of sales</CardTitle>
          <CardDescription>
            Each month&apos;s staff pay divided by that month&apos;s sales
            (months without sales are skipped)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrendLine
            area
            series={[{ key: "ratio", label: "Staff cost / sales" }]}
            data={monthly.map((m) => ({
              label: short(m.month),
              ratio: m.sales > 0 ? m.total / m.sales : null,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By month</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                {months.map((m) => (
                  <TableHead key={m} className="text-right">
                    {short(m)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((p) => (
                <TableRow key={p.key}>
                  <TableCell className="whitespace-nowrap">{p.name}</TableCell>
                  {months.map((m) => (
                    <TableCell
                      key={m}
                      className={
                        m === current
                          ? "text-right text-muted-foreground"
                          : "text-right"
                      }
                    >
                      {money(p.byMonth[m] ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium">
                    {money(p.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                {monthly.map((m) => (
                  <TableCell key={m.month} className="text-right">
                    {money(m.total)}
                  </TableCell>
                ))}
                <TableCell className="text-right">{money(totalAll)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
