import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { SplitBar, SplitLegend } from "@/components/split-bar"
import { StatRow, StatTile } from "@/components/stat-tile"
import { Card, CardContent } from "@/components/ui/card"
import type { CtBand } from "@/lib/corporation-tax"
import { getCorporationTaxPage, type CtYearRow } from "@/lib/ct-store"
import {
  formatDay,
  formatMoney,
  formatMonth,
  formatPence,
  formatPercent,
} from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { cn } from "@/lib/utils"
import { CtPaidBox } from "./ct-paid-box"
import { PaidInvoices } from "./paid-invoices"
import { Working } from "./working"

const BAND: Record<CtBand, string> = {
  none: "No profit, so no CT",
  small: "Small profits rate, 19%",
  marginal: "Between 19% and 25%, with marginal relief",
  main: "Main rate, 25%",
}

const yearLabel = (y: { start: string; end: string }) =>
  `${formatMonth(y.start)} – ${formatMonth(y.end)}`

const sign = (amount: string) => (amount.startsWith("-") ? -1 : 1)
const abs = (amount: string) => amount.replace(/^-/, "")

function Sum({ year }: { year: CtYearRow }) {
  const e = year.estimate
  const rows: [string, string, boolean?][] = [
    ["Sales", year.sales],
    ["People costs", `-${year.peopleCosts}`],
    ["Other costs", `-${year.otherCosts}`],
    ["Equipment (Annual Investment Allowance)", `-${year.equipment}`],
    ["Taxable profit", e.taxableProfit, true],
  ]
  return (
    <dl className="flex flex-col gap-1 font-mono text-xs tabular-nums">
      {rows.map(([label, amount, total]) => (
        <div
          key={label}
          className={cn(
            "flex justify-between gap-4",
            total && "border-t border-border pt-1 font-semibold"
          )}
        >
          <dt className="font-sans text-muted-foreground">{label}</dt>
          <dd>
            {sign(amount) < 0 ? "− " : ""}
            {formatPence(abs(amount))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function YearCard({ year }: { year: CtYearRow }) {
  const e = year.estimate
  const label = yearLabel(year)
  const short = sign(year.short) > 0
  const n = year.paid?.invoices.length ?? 0
  return (
    <section
      className={cn(
        "flex w-full min-w-0 flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3 md:p-4",
        year.ctPaid && "opacity-60"
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">
            Financial year {label}
            {e.inProgress && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                so far
              </span>
            )}
          </h2>
          <CtPaidBox yearStart={year.start} label={label} paid={year.ctPaid} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-xs font-medium tracking-wide uppercase">
            Estimated CT
            <span
              className={cn(
                "block font-mono text-2xl font-semibold tracking-normal normal-case tabular-nums",
                year.ctPaid && "line-through"
              )}
            >
              {formatPence(e.ct)}
            </span>
          </p>
          <p className="text-right text-sm tabular-nums">
            {formatPercent(Number(e.rate))} of taxable profit
            <span className="block text-xs text-muted-foreground">
              {BAND[e.band]}
            </span>
          </p>
        </div>
        {e.inProgress && e.projectedProfit && (
          <p className="text-xs text-muted-foreground tabular-nums">
            The rate is for a full year at this pace: about{" "}
            {formatMoney(e.projectedProfit)} taxable profit.
          </p>
        )}
        <SplitBar parts={year.parts} />
        <SplitLegend parts={year.parts} amount={formatMoney} />
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Sum year={year} />
        <div className="flex flex-col gap-1 text-sm tabular-nums">
          <p className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              Set aside from invoices
            </span>
            {formatPence(year.setAside)}
          </p>
          <p
            className={cn(
              "flex justify-between gap-4 font-semibold",
              short ? "text-destructive" : "text-success"
            )}
          >
            <span>{short ? "Short by" : "Ahead by"}</span>
            {formatPence(abs(year.short))}
          </p>
          {year.paid?.countedFrom && (
            <p className="text-xs text-muted-foreground">
              Invoices counted from {formatDay(year.paid.countedFrom)}.
            </p>
          )}
        </div>
      </div>

      {year.paid && n > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {n} paid {n === 1 ? "invoice" : "invoices"}, with each one&apos;s
            set-aside
          </summary>
          <div className="mt-3">
            <PaidInvoices year={year.paid} />
          </div>
        </details>
      )}
    </section>
  )
}

export default async function CorporationTaxPage() {
  await requireDirector()
  const data = await getCorporationTaxPage()

  const header = (
    <PageHeader
      title="Corporation tax"
      lede="What each financial year owes, estimated from the books, and what's been set aside."
    />
  )

  if (!data)
    return (
      <div className="flex flex-col gap-8">
        {header}
        <Card>
          <CardContent className="text-sm">
            This needs the forecast set up first.{" "}
            <Link href="/forecast" className="underline">
              Go to the forecast
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    )

  const open = data.years.filter((y) => !y.ctPaid)
  const spare = data.reserveSpare
  return (
    <div className="flex flex-col gap-4 md:gap-8">
      {header}
      <StatRow>
        <StatTile
          label="Should be in the tax reserve"
          value={formatPence(data.owed)}
          sub={
            open.length === 0
              ? "Every year's CT is ticked as paid"
              : `Estimated CT for ${open.map(yearLabel).join(" and ")}`
          }
          accent
        />
        {data.taxReserveBalance !== null && (
          <StatTile
            label="Tax reserve now"
            value={formatPence(data.taxReserveBalance)}
            sub="From the last Xero sync"
          />
        )}
        {spare !== null && (
          <StatTile
            label={
              sign(spare) < 0 ? "Reserve is short by" : "Reserve is ahead by"
            }
            value={formatPence(abs(spare))}
            sub={
              sign(spare) < 0
                ? "Move this in to cover the estimate"
                : "More than the estimate needs"
            }
          />
        )}
      </StatRow>
      <p className="text-sm text-muted-foreground">
        Estimated from the books: sales less costs, with equipment deducted in
        full. Corporation Tax is 19% on profit up to £50,000, 25% from £250,000,
        and in between 25% less marginal relief. Your accountant&apos;s figure
        is the final one. Each invoice&apos;s set-aside is{" "}
        {formatPercent(data.setAsideRate)} of its margin, the rate in Settings.
        Tick a year once its CT is paid.
      </p>
      {data.years.map((y) => (
        <YearCard key={y.start} year={y} />
      ))}
      <Working
        years={data.years}
        setAsideRate={data.setAsideRate}
        associatedCompanies={data.associatedCompanies}
      />
    </div>
  )
}
