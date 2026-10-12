import Link from "next/link"

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
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-xl font-medium">Clients</h1>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-heading text-xl font-medium">Clients</h1>
        <p className="text-sm text-muted-foreground">
          From Xero sales invoices · as of {formatAsOf(asOf)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By client</CardTitle>
          <CardDescription>
            Invoiced amounts exclude VAT, net of credit notes. This financial
            year started {fyLabel(fyStart)}. Received is cash in (including VAT)
            this financial year.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">This FY</TableHead>
                <TableHead className="text-right">Share</TableHead>
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
