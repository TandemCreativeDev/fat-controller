import Link from "next/link"

import { MonthlyBars, ShareDonut } from "@/components/charts"
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
import {
  getClientMonthGrid,
  getClientSummary,
  getInvoicesAsOf,
} from "@/lib/clients-store"
import { formatAsOf, formatGbp, formatMonth, formatPercent } from "@/lib/format"
import { topWithOther } from "@/lib/series"
import { requireDirector } from "@/lib/session"

const xeroContactUrl = (id: string) => `https://go.xero.com/Contacts/View/${id}`

const money = (n: number) => (
  <span className="tabular-nums">{n === 0 ? "–" : formatGbp(n)}</span>
)

const fyLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

export default async function ClientsPage() {
  await requireDirector()
  const [summary, grid, asOf] = await Promise.all([
    getClientSummary(),
    getClientMonthGrid(),
    getInvoicesAsOf(),
  ])

  if (summary.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Clients" />
        <Card>
          <CardHeader>
            <CardTitle>No sales invoices yet</CardTitle>
            <CardDescription>
              Run a sync from{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>{" "}
              to pull invoices from Xero.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const fyStart = summary[0].fyStart
  const sum = (f: (r: (typeof summary)[number]) => number) =>
    summary.reduce((t, r) => t + f(r), 0)
  const monthTotals = grid.months.map((m) =>
    grid.clients.reduce((t, c) => t + (c.byMonth[m] ?? 0), 0)
  )

  const ranked = grid.clients.map((c) => ({
    ...c,
    key: c.contactId,
    label: c.name,
  }))
  const { kept, other } = topWithOther(ranked, 5)
  const chartSeries = [
    ...kept.map((c) => ({ key: c.key, label: c.label })),
    ...(other.length
      ? [{ key: "other", label: `Other (${other.length})` }]
      : []),
  ]
  const gridTotal = ranked.reduce((t, c) => t + c.total, 0)
  const topClient = [...ranked].sort((a, b) => b.total - a.total)[0]
  const topShare = topClient && gridTotal ? topClient.total / gridTotal : null

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Clients"
        lede="Who we invoice, how much, and how fast they pay."
        note={<>From Xero sales invoices · as of {formatAsOf(asOf)}</>}
      />

      <StatRow>
        <StatTile
          label="Invoiced · this FY"
          value={formatGbp(sum((r) => r.invoicedFy))}
          sub={`since ${fyLabel(fyStart)}`}
          accent
        />
        <StatTile
          label="Invoiced · last FY"
          value={formatGbp(sum((r) => r.invoicedPrevFy))}
        />
        <StatTile
          label="Outstanding"
          value={formatGbp(sum((r) => r.outstanding))}
          sub={`${summary.filter((r) => r.outstanding > 0).length} clients owe us`}
        />
        <StatTile
          label="Biggest client · 12 months"
          value={topClient ? formatPercent(topShare) : "–"}
          sub={topClient ? `${topClient.name} share of invoicing` : undefined}
        />
      </StatRow>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Invoiced by client</CardTitle>
            <CardDescription>
              Last 12 months and this month to date, excluding VAT
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars
              stacked
              series={chartSeries}
              data={grid.months.map((m) => ({
                label: formatMonth(m).replace(" 20", " '"),
                ...Object.fromEntries(
                  chartSeries.map((s) => [
                    s.key,
                    s.key === "other"
                      ? other.reduce((t, c) => t + (c.byMonth[m] ?? 0), 0)
                      : (grid.clients.find((c) => c.contactId === s.key)
                          ?.byMonth[m] ?? 0),
                  ])
                ),
              }))}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Share of revenue</CardTitle>
            <CardDescription>
              Invoiced over the last 12 months and this month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ShareDonut
              centerLabel="invoiced"
              slices={chartSeries.map((s) => ({
                key: s.key,
                label: s.label,
                value:
                  s.key === "other"
                    ? other.reduce((t, c) => t + c.total, 0)
                    : (grid.clients.find((c) => c.contactId === s.key)?.total ??
                      0),
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By client</CardTitle>
          <CardDescription>
            Invoiced amounts exclude VAT, net of credit notes. This financial
            year started {fyLabel(fyStart)}; Invoices and Avg invoice cover this
            year only. Received is the amount clients actually paid this
            financial year, by payment date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">This FY</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Avg invoice</TableHead>
                <TableHead className="text-right">Last FY</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Avg days to pay</TableHead>
                <TableHead className="text-right">Last invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((c) => (
                <TableRow key={c.contactId ?? c.name}>
                  <TableCell>
                    {c.contactId ? (
                      <a
                        href={xeroContactUrl(c.contactId)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {c.name}
                      </a>
                    ) : (
                      c.name
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(c.invoicedFy)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {c.invoicedFy ? formatPercent(c.shareFy) : "–"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.invoicesFy || "–"}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.avgInvoiceFy === null ? "–" : money(c.avgInvoiceFy)}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(c.invoicedPrevFy)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {c.invoicedPrevFy ? formatPercent(c.sharePrevFy) : "–"}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(c.paidFy)}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(c.outstanding)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.avgDaysToPay === null ? "–" : c.avgDaysToPay.toFixed(0)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {c.lastInvoiceDate ? fyLabel(c.lastInvoiceDate) : "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  {money(sum((r) => r.invoicedFy))}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {sum((r) => r.invoicesFy)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right">
                  {money(sum((r) => r.invoicedPrevFy))}
                </TableCell>
                <TableCell />
                <TableCell className="text-right">
                  {money(sum((r) => r.paidFy))}
                </TableCell>
                <TableCell className="text-right">
                  {money(sum((r) => r.outstanding))}
                </TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoiced by month</CardTitle>
          <CardDescription>
            Last 12 months and this month to date, excluding VAT
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                {grid.months.map((m) => (
                  <TableHead key={m} className="text-right">
                    {formatMonth(m).replace(" 20", " '")}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grid.clients.map((c) => (
                <TableRow key={c.contactId}>
                  <TableCell className="whitespace-nowrap">{c.name}</TableCell>
                  {grid.months.map((m) => (
                    <TableCell key={m} className="text-right">
                      {money(c.byMonth[m] ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium">
                    {money(c.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                {monthTotals.map((t, i) => (
                  <TableCell key={grid.months[i]} className="text-right">
                    {money(t)}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {money(monthTotals.reduce((a, b) => a + b, 0))}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
