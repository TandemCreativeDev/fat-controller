import Link from "next/link"

import { ActionForm } from "@/components/action-form"
import { BalanceLine, MonthlyBars } from "@/components/charts"
import { Field, SelectField } from "@/components/form-fields"
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
import {
  accuracySummary,
  billsChart,
  breakdownText,
  forecastCharts,
  moneyInTable,
  timelineMonths,
  type MonthBreakdown,
} from "@/lib/forecast"
import { getForecastPage, type ForecastPageData } from "@/lib/forecast-store"
import {
  formatDay,
  formatDayShort,
  formatMonth,
  formatPence,
  formatPercent,
} from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { cn } from "@/lib/utils"
import {
  clearManualBalance,
  saveBill,
  saveCustomInvoice,
  saveManualBalance,
} from "./actions"
import { AdjustmentsTable, BillsTable, HoldBacksTable } from "./cash-tables"
import { CopyButton } from "./copy-button"
import { CustomInvoiceFields, MoneyInTable } from "./money-in-table"
import { Timeline } from "./timeline"

const isZero = (amount: string) => Number(amount) === 0

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "money-in", label: "Money in" },
  { key: "bills", label: "Bills and cash" },
  { key: "timeline", label: "Timeline" },
  { key: "accuracy", label: "Accuracy" },
] as const
type TabKey = (typeof TABS)[number]["key"]

function Tabs({ tab }: { tab: TabKey }) {
  return (
    <nav
      aria-label="Forecast sections"
      className="flex flex-wrap gap-1 rounded-xl bg-black/30 p-1 text-sm ring-1 ring-violet-500/60"
    >
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === "overview" ? "/forecast" : `/forecast?tab=${t.key}`}
          aria-current={tab === t.key ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground",
            tab === t.key &&
              "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/50"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
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
      href: "/settings",
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

function MonthTile({
  month,
  reserve,
}: {
  month: MonthBreakdown
  reserve: string | null
}) {
  return (
    <StatTile
      label={formatMonth(month.month)}
      value={formatPence(month.takeHomePerDirector)}
      accent
      sub={
        <span className="flex flex-col gap-1">
          <span>take-home per director</span>
          {!isZero(month.holdBack) && (
            <span>
              Holding back {formatPence(month.holdBack)}
              {month.holdBackReason &&
                ` for ${month.holdBackReason.personName}'s bill due ${formatDay(month.holdBackReason.dueOn)}`}
            </span>
          )}
          {!isZero(month.shortfall) && (
            <span className="text-destructive">
              {formatPence(month.shortfall)} short next month
              {reserve !== null &&
                `, with ${formatPence(reserve)} in the tax reserve as a backstop`}
            </span>
          )}
        </span>
      }
    />
  )
}

type BreakdownRow = [string, (m: MonthBreakdown) => string, boolean?]

const BREAKDOWN: { title: string; rows: BreakdownRow[] }[] = [
  { title: "", rows: [["Opening balance", (m) => m.opening, true]] },
  {
    title: "Money in",
    rows: [
      ["Invoices landing", (m) => m.invoicesLanding],
      ["Back from tax reserve", (m) => m.backstopIn],
      ["Other money in", (m) => m.otherIn],
    ],
  },
  {
    title: "Money out",
    rows: [
      ["Contractor bills", (m) => m.contractorBills],
      ["Set-asides", (m) => m.setAsides],
      ["Running costs", (m) => m.runningCosts],
      ["VAT payments", (m) => m.vatPayments],
      ["Other transfers out", (m) => m.otherTransfersOut],
      ["Adjustments", (m) => m.adjustments],
      ["Director salary and payouts", (m) => m.directorPay],
    ],
  },
  {
    title: "Result",
    rows: [
      ["Closing balance", (m) => m.closing, true],
      ["VAT owed", (m) => m.vatOwed],
      ["Hold-back", (m) => m.holdBack],
      ["Take-home per director", (m) => m.takeHomePerDirector, true],
    ],
  },
]

function Breakdown({ months }: { months: MonthBreakdown[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <span className="sr-only">Line</span>
          </TableHead>
          {months.map((m) => (
            <TableHead key={m.month} className="text-right">
              {formatMonth(m.month)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {BREAKDOWN.flatMap((section) => [
          ...(section.title
            ? [
                <TableRow key={section.title} className="hover:bg-transparent">
                  <TableCell
                    colSpan={months.length + 1}
                    className="pt-4 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
                  >
                    {section.title}
                  </TableCell>
                </TableRow>,
              ]
            : []),
          ...section.rows.map(([label, get, strong]) => (
            <TableRow key={label} className={cn(strong && "font-semibold")}>
              <TableCell>{label}</TableCell>
              {months.map((m) => (
                <TableCell
                  key={m.month}
                  className={cn(
                    "text-right tabular-nums",
                    isZero(get(m)) && "text-muted-foreground"
                  )}
                >
                  {formatPence(get(m))}
                </TableCell>
              ))}
            </TableRow>
          )),
        ])}
      </TableBody>
    </Table>
  )
}

function OverviewTab({ data }: { data: Ready }) {
  const { result } = data
  const charts = forecastCharts(result)
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {result.months.map((m) => (
          <MonthTile
            key={m.month}
            month={m}
            reserve={result.taxReserveBalance}
          />
        ))}
      </div>
      <Card>
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
            data={charts.balance.map((d) => ({
              ...d,
              label: formatDayShort(d.date),
            }))}
          />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Money in, by project</CardTitle>
            <CardDescription>
              Details are in the{" "}
              <Link href="/forecast?tab=money-in" className="underline">
                Money in
              </Link>{" "}
              tab
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars
              stacked
              series={charts.moneyIn.series}
              data={charts.moneyIn.months.map((m) => ({
                ...m,
                label: formatMonth(m.month),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where the money goes</CardTitle>
            <CardDescription>
              Everything leaving the main account each month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars
              stacked
              series={charts.moneyOut.series}
              data={charts.moneyOut.months.map((m) => ({
                ...m,
                label: formatMonth(m.month),
              }))}
            />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Breakdown by month</CardTitle>
            <CardDescription>
              Running costs are forecast at{" "}
              {formatPence(result.runningCostAverage)} a month, the average of
              the last three complete months.
            </CardDescription>
          </div>
          <CopyButton text={breakdownText(result.months)} />
        </CardHeader>
        <CardContent>
          <Breakdown months={result.months} />
        </CardContent>
      </Card>
    </>
  )
}

function MoneyInTab({ data }: { data: Ready }) {
  const charts = forecastCharts(data.result)
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Money in, by project</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            stacked
            series={charts.moneyIn.series}
            data={charts.moneyIn.months.map((m) => ({
              ...m,
              label: formatMonth(m.month),
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Every invoice still to land</CardTitle>
          <CardDescription>
            Each month&apos;s total matches the breakdown. Use the eye to leave
            an invoice out and see take-home change; its contractor cost stays,
            because the work is still done. Click a line to change its days,
            amount or landing date. 0 days means no work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <details>
              <summary className="cursor-pointer text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                Add a one-off invoice
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                For work only you know about yet. It counts like any invoice,
                with a set-aside. Delete it when the real invoice is in Xero, or
                it&apos;ll be counted twice.
              </p>
              <ActionForm
                action={saveCustomInvoice}
                submit="Add to forecast"
                resetOnSuccess
                className="mt-3 flex-row flex-wrap items-end"
              >
                <CustomInvoiceFields />
              </ActionForm>
            </details>
            <MoneyInTable groups={moneyInTable(data.result)} />
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function BillsTab({ data }: { data: Ready }) {
  const { result } = data
  const chart = billsChart(result)
  const contractors = data.people.filter((p) => p.kind === "contractor")
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Contractor money by month</CardTitle>
          <CardDescription>
            Bills paid, or expected to be paid, in each month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            stacked
            series={chart.series}
            data={chart.months.map((m) => ({
              ...m,
              label: formatMonth(m.month),
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Contractor bills</CardTitle>
          <CardDescription>
            Click a line to plan or mark it paid. Doing that to a forecast bill
            saves it at its current amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <BillsTable bills={result.bills} payments={data.unlinkedPayments} />
          {contractors.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                Enter a bill
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                This replaces the forecast bill for the same person and date.
              </p>
              <ActionForm
                action={saveBill}
                submit="Enter bill"
                resetOnSuccess
                className="mt-3"
              >
                <div className="grid gap-3 sm:grid-cols-5">
                  <SelectField
                    name="personId"
                    label="Person"
                    options={contractors.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                  />
                  <Field
                    name="issuedOn"
                    label="Issued on"
                    type="date"
                    required
                  />
                  <Field
                    name="periodStart"
                    label="Period start"
                    type="date"
                    required
                  />
                  <Field
                    name="periodEnd"
                    label="Period end"
                    type="date"
                    required
                  />
                  <Field
                    name="amountGbp"
                    label="Amount (£)"
                    inputMode="decimal"
                    required
                  />
                </div>
              </ActionForm>
            </details>
          )}
        </CardContent>
      </Card>
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
  const charts = forecastCharts(result)
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Cash in the main account</CardTitle>
        </CardHeader>
        <CardContent>
          <BalanceLine
            today={charts.today}
            data={charts.balance.map((d) => ({
              ...d,
              label: formatDayShort(d.date),
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Every cash event</CardTitle>
          <CardDescription>
            This month is open. Open another to see its events; the line shows
            its totals and lowest balance. Hidden events still count in the
            balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline months={timelineMonths(result)} today={result.today} />
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
  searchParams: Promise<{ tab?: string }>
}) {
  await requireDirector()
  const requested = (await searchParams).tab
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
        <div className="flex flex-wrap items-center gap-3">
          {isReady(data) && (
            <a
              href="/api/export/forecast-pack"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Export Markdown
            </a>
          )}
          <Tabs tab={tab} />
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
    <div className="flex flex-col gap-8">
      {header}
      <Warnings warnings={data.warnings} />
      {tab === "overview" && <OverviewTab data={data} />}
      {tab === "money-in" && <MoneyInTab data={data} />}
      {tab === "bills" && <BillsTab data={data} />}
      {tab === "timeline" && <TimelineTab data={data} />}
      {tab === "accuracy" && <AccuracyTab data={data} />}
    </div>
  )
}
