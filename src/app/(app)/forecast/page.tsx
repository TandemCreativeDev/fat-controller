import Link from "next/link"

import { ActionForm } from "@/components/action-form"
import { BalanceLine, MonthlyBars } from "@/components/charts"
import { Field, SelectField } from "@/components/form-fields"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  breakdownText,
  forecastCharts,
  type BillPlan,
  type BuiltInvoice,
  type MonthBreakdown,
} from "@/lib/forecast"
import { getForecastPage, type ForecastPageData } from "@/lib/forecast-store"
import {
  formatDay,
  formatDayShort,
  formatMonth,
  formatPence,
} from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { cn } from "@/lib/utils"
import {
  clearHoldBack,
  clearManualBalance,
  clearOverride,
  deleteAdjustment,
  deleteBill,
  markBillPaid,
  planBill,
  saveAdjustment,
  saveBill,
  saveHoldBack,
  saveManualBalance,
  saveOverride,
  unmatchBill,
} from "./actions"
import { CopyButton } from "./copy-button"
import { Timeline } from "./timeline"

const isZero = (amount: string) => Number(amount) === 0

function Tabs({ tab }: { tab: string }) {
  const items = [
    { key: "overview", label: "Forecast", href: "/forecast" },
    { key: "money", label: "Money in and out", href: "/forecast?tab=money" },
  ]
  return (
    <nav
      aria-label="Forecast sections"
      className="flex gap-1 rounded-xl bg-black/30 p-1 text-xs ring-1 ring-violet-500/60"
    >
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={tab === t.key ? "page" : undefined}
          className={cn(
            "rounded-lg px-2.5 py-1 font-medium text-muted-foreground hover:text-foreground",
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
      <AlertTitle>
        {warnings.length} {warnings.length === 1 ? "thing" : "things"} to check
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
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

function Breakdown({ months }: { months: MonthBreakdown[] }) {
  const rows: [string, (m: MonthBreakdown) => string, boolean?][] = [
    ["Opening balance", (m) => m.opening, true],
    ["Invoices landing", (m) => m.invoicesLanding],
    ["Money back from tax reserve", (m) => m.backstopIn],
    ["Other money in", (m) => m.otherIn],
    ["Contractor bills", (m) => m.contractorBills],
    ["Set-asides", (m) => m.setAsides],
    ["VAT payments", (m) => m.vatPayments],
    ["Other transfers out", (m) => m.otherTransfersOut],
    ["Running costs", (m) => m.runningCosts],
    ["Adjustments", (m) => m.adjustments],
    ["Director salary and payouts", (m) => m.directorPay],
    ["Closing balance", (m) => m.closing, true],
    ["VAT owed", (m) => m.vatOwed],
    ["Hold-back", (m) => m.holdBack],
    ["Take-home per director", (m) => m.takeHomePerDirector, true],
  ]
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          {months.map((m) => (
            <TableHead key={m.month} className="text-right">
              {formatMonth(m.month)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([label, get, strong]) => (
          <TableRow key={label} className={cn(strong && "font-medium")}>
            <TableCell>{label}</TableCell>
            {months.map((m) => (
              <TableCell key={m.month} className="text-right tabular-nums">
                {formatPence(get(m))}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function UpcomingInvoices({ invoices }: { invoices: BuiltInvoice[] }) {
  return (
    <div className="flex flex-col gap-4">
      {invoices.map((inv) => (
        <div
          key={inv.key}
          className="flex flex-col gap-3 border-b border-border/60 pb-4 last:border-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">
              {inv.projectName ?? "No project"} · {formatDay(inv.invoiceDate)}
              {inv.invoiceNumber && ` · ${inv.invoiceNumber}`}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {inv.status}
                {inv.hasOverride && ", override"}
              </span>
            </span>
            <span className="font-medium tabular-nums">
              {formatPence(inv.amount)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDay(inv.periodStart)} to {formatDay(inv.periodEnd)}:{" "}
            {Number(inv.trackedDays).toFixed(2)} days tracked,{" "}
            {Number(inv.forecastDays).toFixed(2)} forecast. Contractor cost{" "}
            {formatPence(inv.contractorCost)}, set-aside{" "}
            {formatPence(inv.setAside)}.
          </p>
          {inv.status !== "raised" && inv.projectId && (
            <div className="flex flex-wrap items-end gap-3">
              <ActionForm
                action={saveOverride}
                submit="Override"
                variant="outline"
                className="flex-row flex-wrap items-end"
              >
                <input type="hidden" name="projectId" value={inv.projectId} />
                <input type="hidden" name="periodEnd" value={inv.invoiceDate} />
                <Field
                  id={`days-${inv.key}`}
                  name="days"
                  label="Days"
                  inputMode="decimal"
                  className="w-24"
                  defaultValue={inv.overrideDays ?? ""}
                />
                <Field
                  id={`amount-${inv.key}`}
                  name="amountGbp"
                  label="or amount (£)"
                  inputMode="decimal"
                  className="w-28"
                  defaultValue={inv.overrideAmount ?? ""}
                />
                <Field
                  id={`note-${inv.key}`}
                  name="note"
                  label="Note"
                  className="w-48"
                  defaultValue={inv.overrideNote ?? ""}
                />
              </ActionForm>
              {inv.hasOverride && (
                <ActionForm
                  action={clearOverride}
                  submit="Clear"
                  variant="ghost"
                >
                  <input type="hidden" name="projectId" value={inv.projectId} />
                  <input
                    type="hidden"
                    name="periodEnd"
                    value={inv.invoiceDate}
                  />
                </ActionForm>
              )}
            </div>
          )}
        </div>
      ))}
      {invoices.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No invoices in this window. Add a client project in Settings.
        </p>
      )}
    </div>
  )
}

function Accuracy({ rows }: { rows: ForecastPageData["accuracy"] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to compare yet. Each daily sync records the forecast, so this
        fills in as invoices are raised.
      </p>
    )
  const cell = (v: string | null) => (v === null ? "–" : formatPence(v))
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Actual</TableHead>
          <TableHead className="text-right">14 days before</TableHead>
          <TableHead className="text-right">Difference</TableHead>
          <TableHead className="text-right">7 days before</TableHead>
          <TableHead className="text-right">Difference</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.invoiceId}>
            <TableCell>{r.invoiceNumber}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDay(r.invoiceDate)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPence(r.actual)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(r.forecast14)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(r.difference14)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(r.forecast7)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(r.difference7)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function BillIdentity({ bill }: { bill: BillPlan }) {
  return (
    <>
      <input type="hidden" name="personId" value={bill.personId} />
      <input type="hidden" name="issuedOn" value={bill.issuedOn} />
      <input type="hidden" name="periodStart" value={bill.periodStart} />
      <input type="hidden" name="periodEnd" value={bill.periodEnd} />
      <input type="hidden" name="amountGbp" value={bill.amount} />
    </>
  )
}

function BillRow({
  bill,
  payments,
}: {
  bill: BillPlan
  payments: ForecastPageData["unlinkedPayments"]
}) {
  const key = `${bill.personId}-${bill.issuedOn}`
  const mine = payments.filter((p) => p.personId === bill.personId)
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-4 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {bill.personName} · issued {formatDay(bill.issuedOn)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {bill.status}, {bill.id ? "entered" : "forecast"}
          </span>
        </span>
        <span className="font-medium tabular-nums">
          {formatPence(bill.amount)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatDay(bill.periodStart)} to {formatDay(bill.periodEnd)}. Due{" "}
        {formatDay(bill.dueOn)}.
        {bill.expectedPayOn &&
          ` Expected to be paid ${formatDay(bill.expectedPayOn)}.`}
        {bill.paidOn &&
          ` Paid ${formatDay(bill.paidOn)}${bill.paidAmount ? `, ${formatPence(bill.paidAmount)}` : ""}.`}
      </p>
      {bill.status === "unpaid" ? (
        <div className="flex flex-wrap items-end gap-6">
          <ActionForm
            action={planBill}
            submit="Set plan"
            variant="outline"
            className="flex-row flex-wrap items-end"
          >
            <BillIdentity bill={bill} />
            <Field
              id={`order-${key}`}
              name="payOrder"
              label="Pay order"
              type="number"
              className="w-20"
              defaultValue={bill.payOrder ?? ""}
            />
            <Field
              id={`plan-${key}`}
              name="plannedPayOn"
              label="Planned date"
              type="date"
              className="w-40"
              defaultValue={bill.plannedPayOn ?? ""}
            />
          </ActionForm>
          <ActionForm
            action={markBillPaid}
            submit="Mark paid"
            variant="outline"
            className="flex-row flex-wrap items-end"
          >
            <BillIdentity bill={bill} />
            <Field
              id={`paid-${key}`}
              name="paidOn"
              label="Paid on"
              type="date"
              className="w-40"
              required
            />
            <SelectField
              id={`tx-${key}`}
              name="bankTransactionId"
              label="Bank payment"
              options={[
                { value: "", label: "None" },
                ...mine.map((p) => ({
                  value: p.bankTransactionId,
                  label: `${formatDay(p.date)}, ${formatPence(p.amount)}`,
                })),
              ]}
            />
          </ActionForm>
          {bill.id && (
            <ActionForm action={deleteBill} submit="Delete" variant="ghost">
              <input type="hidden" name="id" value={bill.id} />
            </ActionForm>
          )}
        </div>
      ) : (
        bill.id && (
          <ActionForm action={unmatchBill} submit="Unmatch" variant="outline">
            <input type="hidden" name="id" value={bill.id} />
          </ActionForm>
        )
      )}
    </div>
  )
}

function MoneyTab({ data }: { data: ForecastPageData }) {
  const { result } = data
  const bills = result && !result.blocked ? result.bills : []
  const months = result && !result.blocked ? result.months : []
  const contractors = data.people.filter((p) => p.kind === "contractor")
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Bank balance</CardTitle>
          <CardDescription>
            Enter today&apos;s real balance if Xero is behind.
            {data.xeroClosing !== null &&
              ` Xero says ${formatPence(data.xeroClosing)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {data.operatingAccountId ? (
            <>
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
              {data.manualBalance !== null && (
                <ActionForm
                  action={clearManualBalance}
                  submit="Clear"
                  variant="ghost"
                />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tag an operating account first.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contractor bills</CardTitle>
          <CardDescription>
            Entering a bill replaces the forecast one for the same person and
            bill date. Setting a plan or marking a forecast bill paid saves it
            at its current amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {contractors.length > 0 && (
            <ActionForm action={saveBill} submit="Enter bill" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-5">
                <SelectField
                  name="personId"
                  label="Person"
                  options={contractors.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
                <Field name="issuedOn" label="Issued on" type="date" required />
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
          )}
          <div className="flex flex-col gap-4">
            {bills.map((b) => (
              <BillRow
                key={`${b.personId}-${b.issuedOn}`}
                bill={b}
                payments={data.unlinkedPayments}
              />
            ))}
            {bills.length === 0 && (
              <p className="text-sm text-muted-foreground">No bills yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjustments</CardTitle>
          <CardDescription>
            One-off items outside the contractor model. Use a negative amount
            for money out. Adjustments never change set-asides.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.adjustments.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-end gap-3 border-b border-border/60 pb-4"
            >
              <ActionForm
                action={saveAdjustment}
                submit="Save"
                variant="outline"
                className="flex-row flex-wrap items-end"
              >
                <input type="hidden" name="id" value={a.id} />
                <Field
                  id={`date-${a.id}`}
                  name="date"
                  label="Date"
                  type="date"
                  className="w-40"
                  defaultValue={a.date}
                />
                <Field
                  id={`label-${a.id}`}
                  name="label"
                  label="Label"
                  className="w-48"
                  defaultValue={a.label}
                />
                <Field
                  id={`amount-${a.id}`}
                  name="amountGbp"
                  label="Amount (£)"
                  inputMode="decimal"
                  className="w-28"
                  defaultValue={a.amountGbp}
                />
                <Field
                  id={`adjustment-note-${a.id}`}
                  name="note"
                  label="Note"
                  className="w-48"
                  defaultValue={a.note ?? ""}
                />
              </ActionForm>
              <ActionForm
                action={deleteAdjustment}
                submit="Delete"
                variant="ghost"
              >
                <input type="hidden" name="id" value={a.id} />
              </ActionForm>
            </div>
          ))}
          <ActionForm
            action={saveAdjustment}
            submit="Add adjustment"
            resetOnSuccess
            className="flex-row flex-wrap items-end"
          >
            <Field
              id="new-adjustment-date"
              name="date"
              label="Date"
              type="date"
              className="w-40"
              required
            />
            <Field
              id="new-adjustment-label"
              name="label"
              label="Label"
              className="w-48"
              required
            />
            <Field
              id="new-adjustment-amount"
              name="amountGbp"
              label="Amount (£)"
              inputMode="decimal"
              className="w-28"
              required
            />
            <Field
              id="new-adjustment-note"
              name="note"
              label="Note"
              className="w-48"
            />
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hold-backs</CardTitle>
          <CardDescription>
            Each month&apos;s suggestion keeps back enough to pay next
            month&apos;s contractor bills by their due dates. Enter 0 to hold
            nothing back.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {months.map((m) => (
            <div key={m.month} className="flex flex-wrap items-end gap-3">
              <ActionForm
                action={saveHoldBack}
                submit="Set"
                variant="outline"
                className="flex-row flex-wrap items-end"
              >
                <input type="hidden" name="month" value={m.month} />
                <Field
                  id={`hold-${m.month}`}
                  name="amountGbp"
                  label={`${formatMonth(m.month)}: suggested ${formatPence(m.suggestedHoldBack)}`}
                  inputMode="decimal"
                  className="w-64"
                  defaultValue={
                    m.holdBackSource === "director" ? m.holdBack : ""
                  }
                  required
                />
                <Field
                  id={`hold-note-${m.month}`}
                  name="note"
                  label="Note"
                  className="w-48"
                />
              </ActionForm>
              {m.holdBackSource === "director" && (
                <ActionForm
                  action={clearHoldBack}
                  submit="Use the suggestion"
                  variant="ghost"
                >
                  <input type="hidden" name="month" value={m.month} />
                </ActionForm>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireDirector()
  const tab = (await searchParams).tab === "money" ? "money" : "overview"
  const data = await getForecastPage()
  const { result, setup } = data

  const header = (
    <PageHeader
      title="Forecast"
      lede="Take-home per director, from Solidtime hours and Xero's bank data."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {result && !result.blocked && (
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

  if (!result) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <Setup setup={setup} />
      </div>
    )
  }

  const charts = forecastCharts(result)
  const windowStart = result.months[0]?.month ?? result.today
  const windowEnd = result.timeline.at(-1)?.date ?? result.today
  // The engine looks one month further for hold-backs; that month isn't shown.
  const upcoming = result.invoices.filter(
    (i) =>
      i.linked && i.invoiceDate >= windowStart && i.invoiceDate <= windowEnd
  )

  return (
    <div className="flex flex-col gap-8">
      {header}
      <Warnings warnings={data.warnings} />
      {tab === "money" ? (
        <MoneyTab data={data} />
      ) : (
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
                End-of-day balance: solid up to today, dashed for the forecast.
                It should fall to about the buffer at each month-end payout;
                below zero means a shortfall.
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
                  Client payments and invoices expected to land each month
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
                  {formatPence(result.runningCostAverage)} a month, the average
                  of the last three complete months.
                </CardDescription>
              </div>
              <CopyButton text={breakdownText(result.months)} />
            </CardHeader>
            <CardContent>
              <Breakdown months={result.months} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Upcoming invoices</CardTitle>
              <CardDescription>
                Try a &quot;what if&quot;: an override changes the invoice and
                its contractor cost, and the forecast updates straight away. An
                override of 0 means no work.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UpcomingInvoices invoices={upcoming} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                {formatDay(windowStart)} to {formatDay(windowEnd)}. Events that
                have happened are shown brighter than forecast ones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline events={result.timeline} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Accuracy</CardTitle>
              <CardDescription>
                Each raised invoice against what was forecast 14 and 7 days
                before its date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accuracy rows={data.accuracy} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
