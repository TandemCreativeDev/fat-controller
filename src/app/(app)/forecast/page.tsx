import Link from "next/link"

import { ActionForm } from "@/components/action-form"
import { BalanceLine, MonthlyBars } from "@/components/charts"
import {
  MonthPane,
  MonthProvider,
  MonthSwipe,
  MonthSwitcher,
} from "@/components/month-context"
import { SectionTabs } from "@/components/section-tabs"
import { Field } from "@/components/form-fields"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { accuracySummary, breakdownText, forecastCharts } from "@/lib/forecast"
import { payoutBuckets } from "@/lib/forecast-buckets"
import {
  billBuckets,
  inOutMonths,
  overviewBuckets,
  timelineView,
} from "@/lib/forecast-views"
import { getForecastPage, type ForecastPageData } from "@/lib/forecast-store"
import {
  formatDay,
  formatDayShort,
  formatMoney,
  formatPence,
  formatPercent,
} from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { clearManualBalance, saveManualBalance } from "./actions"
import { BillsBuckets } from "./bills-buckets"
import { AdjustmentsTable, HoldBacksTable } from "./cash-tables"
import { InOutMonthCard, OverviewBucketCard } from "./overview-buckets"
import { CopyButton } from "./copy-button"
import { MoneyInBuckets } from "./money-in-buckets"
import { RunningCosts } from "./running-costs"
import { Timeline } from "./timeline"

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "in-out", label: "In and out" },
  { key: "money-in", label: "Money in" },
  { key: "bills", label: "Bills and cash" },
  { key: "running-costs", label: "Running costs" },
  { key: "timeline", label: "Timeline" },
  { key: "accuracy", label: "Accuracy" },
] as const
type TabKey = (typeof TABS)[number]["key"]

function Tabs({ tab }: { tab: TabKey }) {
  return (
    <SectionTabs
      label="Forecast sections"
      active={tab}
      tabs={TABS.map((t) => ({
        key: t.key,
        label: t.label,
        href: t.key === "overview" ? "/forecast" : `/forecast?tab=${t.key}`,
      }))}
    />
  )
}

function Setup({ setup }: { setup: ForecastPageData["setup"] }) {
  const steps = [
    {
      done: setup.solidtimeConfigured,
      text: "Set the three SOLIDTIME_ environment variables, then run a sync.",
      href: "/settings",
    },
    {
      done: setup.operatingAccountSet,
      text: "Tag your bank accounts as operating or tax reserve.",
      href: "/settings/accounts",
    },
    {
      done: setup.startDateSet,
      text: "Set the forecast start date.",
      href: "/settings/rules",
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setting up the forecast</CardTitle>
        <CardDescription>
          Then add your projects and people, and run a sync.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {steps.map((s) => (
            <li key={s.text}>
              {s.done ? "Done: " : "To do: "}
              <Link href={s.href} className="underline">
                {s.text}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function Warnings({ warnings }: { warnings: ForecastPageData["warnings"] }) {
  if (warnings.length === 0) return null
  const serious = warnings.some(
    (w) => w.kind === "reconciliation" || w.kind === "breakdown"
  )
  return (
    <Alert variant={serious ? "destructive" : "default"}>
      <AlertDescription>
        <details open={serious}>
          <summary className="cursor-pointer font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {warnings.length} {warnings.length === 1 ? "thing" : "things"} to
            check
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      </AlertDescription>
    </Alert>
  )
}

function BalanceCard({
  result,
  className,
}: {
  result: Ready["result"]
  className?: string
}) {
  const charts = forecastCharts(result)
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Cash in the main account</CardTitle>
        <CardDescription>
          End-of-day balance: solid up to today, dashed for the forecast. It
          should fall to about the buffer at each month-end payout; below zero
          means a shortfall.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BalanceLine
          today={charts.today}
          className="max-md:h-45"
          data={charts.balance.map((d) => ({
            ...d,
            label: formatDayShort(d.date),
          }))}
        />
      </CardContent>
    </Card>
  )
}

function OverviewTab({ data }: { data: Ready }) {
  const { result } = data
  return (
    <>
      <BalanceCard result={result} className="max-md:order-last" />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle>Take-home by month</CardTitle>
          </div>
          <CopyButton text={breakdownText(result.months)} />
        </CardHeader>
        <CardContent className="max-md:px-2">
          <MonthSwipe className="grid items-start gap-4 lg:grid-cols-3">
            {overviewBuckets(result, formatMoney).map((b) => (
              <MonthPane key={b.month} month={b.month}>
                <OverviewBucketCard bucket={b} />
              </MonthPane>
            ))}
          </MonthSwipe>
        </CardContent>
      </Card>
    </>
  )
}

function InOutTab({ data }: { data: Ready }) {
  const rows = inOutMonths(data.result, formatMoney)
  const shown = new Set(data.result.months.map((m) => m.month))
  const earlier = rows.filter((m) => !shown.has(m.month))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Money in and out, before dividends</CardTitle>
        <CardDescription>
          Bank movements for past months, forecast for later ones. Leaves out
          dividends and the month-end payout.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 max-md:px-2">
        <MonthSwipe className="grid items-start gap-4 lg:grid-cols-3">
          {rows.map((m) =>
            shown.has(m.month) ? (
              <MonthPane key={m.month} month={m.month}>
                <InOutMonthCard month={m} />
              </MonthPane>
            ) : (
              <div key={m.month} className="min-w-0 max-md:hidden">
                <InOutMonthCard month={m} />
              </div>
            )
          )}
        </MonthSwipe>
        {earlier.length > 0 && (
          <details className="border-t border-border md:hidden">
            <summary className="cursor-pointer text-sm font-medium">
              Earlier months ({earlier.length})
            </summary>
            <div className="flex flex-col gap-4 pt-2">
              {earlier.map((m) => (
                <InOutMonthCard key={m.month} month={m} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function MoneyInTab({ data }: { data: Ready }) {
  const { months, later } = payoutBuckets(data.result, formatMoney)
  return <MoneyInBuckets months={months} later={later} />
}

function BillsTab({ data }: { data: Ready }) {
  const { result } = data
  const contractors = data.people.filter((p) => p.kind === "contractor")
  return (
    <>
      <BillsBuckets
        buckets={billBuckets(result)}
        payments={data.unlinkedPayments}
        contractors={contractors}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hold-backs</CardTitle>
            <CardDescription>
              Kept from a payout so next month&apos;s bills can be paid on time.
              Click a month to change it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HoldBacksTable months={result.months} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bank balance</CardTitle>
            <CardDescription>
              {data.xeroClosing !== null
                ? `Xero says ${formatPence(data.xeroClosing)}. `
                : ""}
              Enter today&apos;s real balance if Xero is behind.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            {data.operatingAccountId && (
              <ActionForm
                action={saveManualBalance}
                submit="Save balance"
                variant="outline"
                className="flex-row flex-wrap items-end"
              >
                <input
                  type="hidden"
                  name="accountId"
                  value={data.operatingAccountId}
                />
                <Field
                  name="closingGbp"
                  label="Balance today (£)"
                  inputMode="decimal"
                  className="w-40"
                  defaultValue={data.manualBalance ?? ""}
                  required
                />
              </ActionForm>
            )}
            {data.manualBalance !== null && (
              <ActionForm
                action={clearManualBalance}
                submit="Clear"
                variant="ghost"
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Adjustments</CardTitle>
          <CardDescription>
            One-off items outside the contractor model. They never change
            set-asides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdjustmentsTable rows={data.adjustments} />
        </CardContent>
      </Card>
    </>
  )
}

function TimelineTab({ data }: { data: Ready }) {
  const { result } = data
  return (
    <>
      <BalanceCard result={result} />
      <Card>
        <CardHeader>
          <CardTitle>Every cash event</CardTitle>
          <CardDescription>
            <span className="max-md:hidden">Hover</span>
            <span className="md:hidden">Tap</span> a chip to see the events
            inside it. Hidden events still count towards the balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline view={timelineView(result)} today={result.today} />
        </CardContent>
      </Card>
    </>
  )
}

function AccuracyTab({ data }: { data: Ready }) {
  const summary = accuracySummary(data.accuracy)
  if (summary.compared === 0)
    return (
      <Card>
        <CardHeader>
          <CardTitle>No comparisons yet</CardTitle>
          <CardDescription>
            Each daily sync records the forecast. An invoice shows here once one
            was recorded at least 7 days before its date, so this starts to fill
            in about a week after the first sync, as invoices are raised.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  const recent = summary.rows.slice(0, 12).reverse()
  const money = (v: string | null) => (v === null ? "None" : formatPence(v))
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Average miss, 7 days before"
          value={formatPercent(summary.averageMiss7)}
          sub={
            summary.lean7 === "over"
              ? "Tends to forecast too high"
              : summary.lean7 === "under"
                ? "Tends to forecast too low"
                : "No lean either way"
          }
          accent
        />
        <StatTile
          label="Average miss, 14 days before"
          value={formatPercent(summary.averageMiss14)}
        />
        <StatTile label="Invoices compared" value={String(summary.compared)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Forecast against actual</CardTitle>
          <CardDescription>The latest invoices, oldest first</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            series={[
              { key: "actual", label: "Actual" },
              { key: "f7", label: "7 days before" },
              { key: "f14", label: "14 days before" },
            ]}
            data={recent.map((r) => ({
              label: r.invoiceNumber ?? formatDayShort(r.invoiceDate),
              actual: Number(r.actual),
              f7: Number(r.forecast7 ?? 0),
              f14: Number(r.forecast14 ?? 0),
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>By invoice</CardTitle>
          <CardDescription>
            A positive difference means the invoice came in above the forecast.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">7 days before</TableHead>
                <TableHead className="text-right">Difference</TableHead>
                <TableHead className="text-right">14 days before</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.rows.map((r) => (
                <TableRow key={r.invoiceId}>
                  <TableCell>{r.invoiceNumber}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDay(r.invoiceDate)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPence(r.actual)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.forecast7)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.difference7)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.forecast14)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.difference14)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

type Ready = ForecastPageData & {
  result: Extract<NonNullable<ForecastPageData["result"]>, { blocked: false }>
}

const isReady = (d: ForecastPageData): d is Ready =>
  d.result !== null && !d.result.blocked

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>
}) {
  await requireDirector()
  const { tab: requested, month } = await searchParams
  const tab: TabKey =
    requested === "money"
      ? "bills"
      : (TABS.find((t) => t.key === requested)?.key ?? "overview")
  const data = await getForecastPage()
  const { result, setup } = data

  const header = (
    <PageHeader
      title="Forecast"
      lede="Take-home per director, from Solidtime hours and Xero's bank data."
      actions={
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3 md:w-auto">
          {isReady(data) && (
            <a
              href="/api/export/forecast-pack"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Export Markdown
            </a>
          )}
          <div className="w-full min-w-0 md:w-auto">
            <Tabs tab={tab} />
          </div>
        </div>
      }
    />
  )

  if (result?.blocked) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>The forecast can&apos;t run yet</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {result.missingDefaultRate.map((name) => (
              <Link key={name} href="/settings/people" className="underline">
                Set a default pay rate for {name}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isReady(data)) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <Setup setup={setup} />
      </div>
    )
  }

  return (
    <MonthProvider
      months={data.result.months.map((m) => m.month)}
      initial={month}
    >
      <div className="flex flex-col gap-4 md:gap-8">
        {header}
        <Warnings warnings={data.warnings} />
        {(tab === "overview" ||
          tab === "in-out" ||
          tab === "money-in" ||
          tab === "bills") && <MonthSwitcher />}
        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "in-out" && <InOutTab data={data} />}
        {tab === "money-in" && <MoneyInTab data={data} />}
        {tab === "bills" && <BillsTab data={data} />}
        {tab === "running-costs" && (
          <RunningCosts tally={data.result.runningCosts} />
        )}
        {tab === "timeline" && <TimelineTab data={data} />}
        {tab === "accuracy" && <AccuracyTab data={data} />}
      </div>
    </MonthProvider>
  )
}
