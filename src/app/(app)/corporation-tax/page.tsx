import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { SplitBar, SplitLegend } from "@/components/split-bar"
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
import { Compare } from "./compare"
import { CtPaidBox } from "./ct-paid-box"
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

function YearCard({ year, rate }: { year: CtYearRow; rate: string }) {
  const e = year.estimate
  const label = yearLabel(year)
  const short = sign(year.short) > 0
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
            <span>
              <Link
                href="/set-asides"
                className="text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
              >
                The {rate} rule
              </Link>
              <span className="block text-xs text-muted-foreground">
                {rate} × (invoice before VAT − contractor cost), for each paid
                invoice
              </span>
            </span>
            {formatPence(year.setAside)}
          </p>
          <p
            className={cn(
              "flex justify-between gap-4 font-semibold",
              short ? "text-destructive" : "text-success"
            )}
          >
            <span>
              {short ? "Estimate is higher by" : "Estimate is lower by"}
            </span>
            {formatPence(abs(year.short))}
          </p>
          {year.paid?.countedFrom && (
            <p className="text-xs text-muted-foreground">
              Invoices counted from {formatDay(year.paid.countedFrom)}.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default async function CorporationTaxPage() {
  await requireDirector()
  const data = await getCorporationTaxPage()

  const header = (
    <PageHeader
      title="Corporation tax"
      lede="What each financial year owes, estimated from the books."
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

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      {header}
      <Compare compare={data.compare} />
      <p className="text-sm text-muted-foreground">
        Estimated from the books: sales less costs, with equipment deducted in
        full. Corporation Tax is 19% on profit up to £50,000, 25% from £250,000,
        and in between 25% less marginal relief. Your accountant&apos;s figure
        is the final one. Each year compares the estimate with the{" "}
        <Link href="/set-asides" className="underline underline-offset-4">
          {formatPercent(data.setAsideRate)} rule
        </Link>{" "}
        ({formatPercent(data.setAsideRate)} of each paid invoice&apos;s amount
        before VAT less contractor cost), which is worked out, not what&apos;s
        actually been moved. Tick a year once its CT is paid.
      </p>
      {data.years.map((y) => (
        <YearCard
          key={y.start}
          year={y}
          rate={formatPercent(data.setAsideRate)}
        />
      ))}
      <Working
        years={data.years}
        setAsideRate={data.setAsideRate}
        associatedCompanies={data.associatedCompanies}
      />
    </div>
  )
}
