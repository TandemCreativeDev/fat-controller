"use client"

import { Plus } from "lucide-react"
import { useState } from "react"

import { ActionForm } from "@/components/action-form"
import { EditSurface } from "@/components/bottom-sheet"
import { MonthPane, MonthSwipe } from "@/components/month-context"
import { Field, SelectField } from "@/components/form-fields"
import { Dot, SplitBar, SplitLegend } from "@/components/split-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { BillPlan } from "@/lib/forecast"
import type { BillBucket, BillBuckets, BillCard } from "@/lib/forecast-views"
import {
  formatBalance,
  formatDay,
  formatDayName,
  formatDayShort,
  formatMoney,
  formatMonthName,
  formatPence,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  deleteBill,
  markBillPaid,
  planBill,
  saveBill,
  unmatchBill,
} from "./actions"

type Payment = {
  bankTransactionId: string
  personId: string
  date: string
  amount: string
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

function PlanForm({ bill }: { bill: BillPlan }) {
  const key = `${bill.personId}-${bill.issuedOn}`
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3 max-md:flex-col max-md:items-stretch max-md:border-0 max-md:pt-0">
      <ActionForm
        action={planBill}
        submit="Set plan"
        variant="outline"
        className="flex-row flex-wrap items-end max-md:flex-col max-md:items-stretch"
      >
        <BillIdentity bill={bill} />
        <Field
          id={`order-${key}`}
          name="payOrder"
          label="Pay order"
          type="number"
          className="w-20 max-md:w-full"
          defaultValue={bill.payOrder ?? ""}
        />
        <Field
          id={`plan-${key}`}
          name="plannedPayOn"
          label="Planned date"
          type="date"
          className="w-40 max-md:w-full"
          defaultValue={bill.plannedPayOn ?? ""}
        />
      </ActionForm>
      {bill.id && (
        <ActionForm
          action={deleteBill}
          submit="Delete bill"
          variant="ghost"
          className="max-md:order-first"
        >
          <input type="hidden" name="id" value={bill.id} />
        </ActionForm>
      )}
    </div>
  )
}

function PaidForm({ bill, payments }: { bill: BillPlan; payments: Payment[] }) {
  const key = `${bill.personId}-${bill.issuedOn}`
  const mine = payments.filter((p) => p.personId === bill.personId)
  return (
    <div className="border-t border-border pt-3 max-md:border-0 max-md:pt-0">
      <ActionForm
        action={markBillPaid}
        submit="Save as paid"
        variant="outline"
        className="flex-row flex-wrap items-end max-md:flex-col max-md:items-stretch"
      >
        <BillIdentity bill={bill} />
        <Field
          id={`paid-${key}`}
          name="paidOn"
          label="Paid on"
          type="date"
          className="w-40 max-md:w-full"
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
    </div>
  )
}

type OpenEditor = { key: string; mode: "edit" | "paid" } | null

const KIND_LABEL = {
  entered: "Entered",
  calculated: "Calculated",
  forecast: "Forecast",
}

function BillCardView({
  card,
  payments,
  open,
  setOpen,
}: {
  card: BillCard
  payments: Payment[]
  open: OpenEditor
  setOpen: (o: OpenEditor) => void
}) {
  const { bill } = card
  const key = `${bill.personId}-${bill.issuedOn}`
  const mode = open?.key === key ? open.mode : null
  const entered = Boolean(bill.id)
  const toggle = (m: "edit" | "paid") =>
    setOpen(mode === m ? null : { key, mode: m })
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-background/60 p-3 text-sm",
        card.kind === "forecast"
          ? "border-dashed border-primary/60"
          : "border-border",
        card.late && "border-destructive/60 bg-destructive/5"
      )}
    >
      <div className="flex items-center gap-2">
        <Dot colour={card.colour} />
        <p className="min-w-0 flex-1 font-medium">{bill.personName}</p>
        <Badge
          variant="outline"
          className={cn(
            card.kind === "forecast" && "border-dashed border-primary"
          )}
        >
          {KIND_LABEL[card.kind]}
        </Badge>
        <p className="font-medium tabular-nums">{formatMoney(bill.amount)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-foreground text-background tabular-nums">
          {card.payOn ? `Pay ${formatDayName(card.payOn)}` : "Pay later"}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "tabular-nums",
            card.late && "border-destructive text-destructive"
          )}
        >
          Due {formatDayShort(bill.dueOn)}
          {card.late && " · late"}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums">
          issued {formatDayShort(bill.issuedOn)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 max-md:flex-col max-md:items-stretch">
        <p className="text-xs text-muted-foreground">{card.basis}</p>
        <div className="flex gap-1 max-md:[&>*]:flex-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={mode === "edit"}
            onClick={() => toggle("edit")}
          >
            {entered ? "Plan" : "Edit"}
            <span className="sr-only"> {bill.personName}&apos;s bill</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={mode === "paid"}
            onClick={() => toggle("paid")}
          >
            Mark paid
            <span className="sr-only"> {bill.personName}&apos;s bill</span>
          </Button>
        </div>
      </div>
      <EditSurface
        open={mode === "edit"}
        onClose={() => setOpen(null)}
        title={`${bill.personName}'s bill`}
      >
        <PlanForm bill={bill} />
      </EditSurface>
      <EditSurface
        open={mode === "paid"}
        onClose={() => setOpen(null)}
        title={`Mark ${bill.personName}'s bill paid`}
      >
        <PaidForm bill={bill} payments={payments} />
      </EditSurface>
    </li>
  )
}

function Bucket({
  bucket,
  payments,
  open,
  setOpen,
}: {
  bucket: BillBucket
  payments: Payment[]
  open: OpenEditor
  setOpen: (o: OpenEditor) => void
}) {
  const month = formatMonthName(bucket.month)
  return (
    <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3 md:p-4">
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">{month}</h2>
          <p className="text-sm text-muted-foreground">
            {bucket.count} {bucket.count === 1 ? "bill" : "bills"}
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {formatMoney(bucket.total)}
            </p>
            <p className="text-xs text-muted-foreground">
              paid out to contractors
            </p>
          </div>
          <p className="text-xs tabular-nums md:text-right">
            <span className="md:block">
              {formatMoney(bucket.entered)} entered
            </span>
            <span className="md:hidden"> · </span>
            <span className="md:block">
              {formatMoney(bucket.calculated)} calculated
            </span>
            <span className="md:hidden"> · </span>
            <span className="md:block">
              {formatMoney(bucket.forecast)} forecast
            </span>
          </p>
        </div>
        <SplitBar parts={bucket.parts} />
        <SplitLegend parts={bucket.parts} amount={formatMoney} />
        <p
          className={cn(
            "min-h-8 text-xs",
            bucket.danger
              ? "font-medium text-destructive"
              : "text-muted-foreground"
          )}
        >
          {bucket.danger
            ? `Balance goes to ${formatBalance(bucket.danger.balance)} after ${bucket.danger.personName} is paid on ${formatDayName(bucket.danger.date)}`
            : "Covered by the balance on every pay day"}
        </p>
      </header>
      {bucket.cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No more bills to pay in {month}.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bucket.cards.map((c) => (
            <BillCardView
              key={`${c.bill.personId}-${c.bill.issuedOn}`}
              card={c}
              payments={payments}
              open={open}
              setOpen={setOpen}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** The Contractor bills card: one bucket per pay month, then the paid ones. */
export function BillsBuckets({
  buckets,
  payments,
  contractors,
}: {
  buckets: BillBuckets
  payments: Payment[]
  contractors: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState<OpenEditor>(null)
  const [adding, setAdding] = useState(false)
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>Contractor bills</CardTitle>
          <CardDescription>
            Planning or marking a forecast bill paid saves it at its current
            amount.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 max-md:bg-primary! max-md:text-primary-foreground! max-md:shadow-lg md:static"
        >
          <Plus aria-hidden />
          Enter a bill
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 max-md:px-2">
        <EditSurface
          open={adding}
          onClose={() => setAdding(false)}
          title="Enter a bill"
        >
          <div className="rounded-lg border border-border p-3 max-md:border-0 max-md:p-0">
            <p className="mb-3 text-sm text-muted-foreground">
              This replaces the forecast bill for the same person and date.
            </p>
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
          </div>
        </EditSurface>
        <MonthSwipe className="grid gap-4 lg:grid-cols-3">
          {buckets.months.map((b) => (
            <MonthPane key={b.month} month={b.month} className="flex">
              <Bucket
                bucket={b}
                payments={payments}
                open={open}
                setOpen={setOpen}
              />
            </MonthPane>
          ))}
        </MonthSwipe>
        {buckets.later.length > 0 && (
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              To pay after the months shown ({buckets.later.length})
            </summary>
            <ul className="mt-3 grid gap-2 lg:grid-cols-3">
              {buckets.later.map((c) => (
                <BillCardView
                  key={`${c.bill.personId}-${c.bill.issuedOn}`}
                  card={c}
                  payments={payments}
                  open={open}
                  setOpen={setOpen}
                />
              ))}
            </ul>
          </details>
        )}
        <details className="border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Paid bills ({buckets.paid.length})
          </summary>
          <ul className="mt-3 flex flex-wrap gap-2 max-md:flex-col">
            {buckets.paid.map((c) => (
              <li
                key={`${c.bill.personId}-${c.bill.issuedOn}`}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs max-md:grid max-md:grid-cols-[auto_1fr_auto] max-md:text-sm"
              >
                <Dot colour={c.colour} />
                <span>{c.bill.personName}</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(c.bill.paidAmount ?? c.bill.amount)}
                </span>
                <span className="text-muted-foreground tabular-nums max-md:col-span-3 max-md:text-xs">
                  paid {c.payOn && formatDayShort(c.payOn)}
                </span>
                {c.bill.id && (
                  <ActionForm
                    action={unmatchBill}
                    submit="Unmatch"
                    variant="ghost"
                    className="flex-row"
                  >
                    <input type="hidden" name="id" value={c.bill.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  )
}
