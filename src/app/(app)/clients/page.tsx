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
  getClientTable,
  getInvoicesAsOf,
} from "@/lib/clients-store"
import { formatAsOf, formatGbp, formatMonth, formatPercent } from "@/lib/format"
import { topWithOther } from "@/lib/series"
import { getPeriod } from "@/lib/period-store"
import { requireDirector } from "@/lib/session"
import { PeriodSwitch } from "../period-switch"

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

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  await requireDirector()
  const period = await getPeriod((await searchParams).period)
  const [summary, grid, asOf] = await Promise.all([
    getClientTable(period),
    getClientMonthGrid(period),
    getInvoicesAsOf(),
  ])
  const switcher = <PeriodSwitch period={period} path="/clients" />

  if (summary.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Clients" actions={switcher} />
        <Card>
          <CardHeader>
            <CardTitle>No sales invoices in {period.label}</CardTitle>
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

  const prev = period.previous
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
        actions={switcher}
        note={<>From Xero sales invoices · as of {formatAsOf(asOf)}</>}
      />

      <StatRow>
        <StatTile
          label={`Invoiced · ${period.title}`}
          value={formatGbp(sum((r) => r.invoiced))}
          sub={period.label}
          accent
        />
        {prev ? (
          <StatTile
            label="Invoiced · year before"
            value={formatGbp(sum((r) => r.invoicedPrev))}
            sub={prev.label}
          />
        ) : (
          <StatTile
            label={`Invoices · ${period.title}`}
            value={String(sum((r) => r.invoices))}
            sub={`to ${summary.filter((r) => r.invoices > 0).length} clients`}
          />
        )}
        <StatTile
          label="Outstanding"
          value={formatGbp(sum((r) => r.outstanding))}
          sub={`${summary.filter((r) => r.outstanding > 0).length} clients owe us`}
        />
        <StatTile
          label={`Biggest client · ${period.title}`}
          value={topClient ? formatPercent(topShare) : "–"}
          sub={topClient ? `${topClient.name} share of invoicing` : undefined}
        />
      </StatRow>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Invoiced by client</CardTitle>
            <CardDescription>{period.label}, excluding VAT</CardDescription>
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
            <CardDescription>Invoiced, {period.label}</CardDescription>
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
            {period.label}, by invoice date. Invoiced amounts exclude VAT, net
            of credit notes; Invoices counts invoices only.
            {prev && <> Year before is {prev.label}.</>} Received is the amount
            clients actually paid in the period, by payment date. Outstanding
            and days to pay are as of today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">{period.title}</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Avg invoice</TableHead>
                {prev && (
                  <>
                    <TableHead className="text-right">Year before</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </>
                )}
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
                    {money(c.invoiced)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {c.invoiced ? formatPercent(c.share) : "–"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.invoices || "–"}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.avgInvoice === null ? "–" : money(c.avgInvoice)}
                  </TableCell>
                  {prev && (
                    <>
                      <TableCell className="text-right">
                        {money(c.invoicedPrev)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {c.invoicedPrev ? formatPercent(c.sharePrev) : "–"}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right">
                    {money(c.received)}
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
                  {money(sum((r) => r.invoiced))}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {sum((r) => r.invoices)}
                </TableCell>
                <TableCell />
                {prev && (
                  <>
                    <TableCell className="text-right">
                      {money(sum((r) => r.invoicedPrev))}
                    </TableCell>
                    <TableCell />
                  </>
                )}
                <TableCell className="text-right">
                  {money(sum((r) => r.received))}
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
          <CardDescription>{period.label}, excluding VAT</CardDescription>
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
