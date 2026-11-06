"use client"

import { Plus } from "lucide-react"
import { startTransition, useState } from "react"

import { ActionForm } from "@/components/action-form"
import { Field } from "@/components/form-fields"
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
import { Checkbox } from "@/components/ui/checkbox"
import type { MoneyInRow } from "@/lib/forecast"
import type {
  BucketInvoice,
  ClientGroup,
  PayoutBucket,
} from "@/lib/forecast-buckets"
import {
  formatDayName,
  formatDayShort,
  formatMoney,
  formatMonthName,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  clearOverride,
  deleteCustomInvoice,
  saveCustomInvoice,
  saveExpectation,
  saveOverride,
} from "./actions"

/** The fields of a one-off invoice, shared by adding and editing one. */
export function CustomInvoiceFields({
  row,
}: {
  row?: NonNullable<MoneyInRow["custom"]> & {
    label: string
    note: string | null
  }
}) {
  const id = row?.id ?? "new"
  return (
    <>
      {row && <input type="hidden" name="id" value={row.id} />}
      <Field
        id={`custom-label-${id}`}
        name="label"
        label="What it's for"
        className="w-56"
        defaultValue={row?.label}
        required
      />
      <Field
        id={`custom-amount-${id}`}
        name="amountGbp"
        label="Amount before VAT (£)"
        inputMode="decimal"
        className="w-36"
        defaultValue={row?.amount}
        required
      />
      <Field
        id={`custom-cost-${id}`}
        name="contractorCostGbp"
        label="Contractor cost (£)"
        inputMode="decimal"
        className="w-32"
        defaultValue={row?.cost}
      />
      <Field
        id={`custom-lands-${id}`}
        name="landsOn"
        label="Due"
        type="date"
        className="w-40"
        defaultValue={row?.landsOn}
        required
      />
      <Field
        id={`custom-note-${id}`}
        name="note"
        label="Note"
        className="w-48"
        defaultValue={row?.note ?? ""}
      />
    </>
  )
}

function Editor({ row }: { row: MoneyInRow }) {
  if (row.custom)
    return (
      <div className="flex flex-wrap items-end gap-3 py-2">
        <ActionForm
          action={saveCustomInvoice}
          submit="Save"
          variant="outline"
          className="flex-row flex-wrap items-end"
        >
          <CustomInvoiceFields
            row={{
              ...row.custom,
              label: row.projectName ?? "",
              note: row.customNote,
            }}
          />
        </ActionForm>
        <ActionForm
          action={deleteCustomInvoice}
          submit="Delete"
          variant="ghost"
        >
          <input type="hidden" name="id" value={row.custom.id} />
        </ActionForm>
      </div>
    )
  return (
    <div className="flex flex-wrap items-end gap-6 py-2">
      {row.canOverride && row.projectId && (
        <div className="flex items-end gap-2">
          <ActionForm
            action={saveOverride}
            submit="Set days or amount"
            variant="outline"
            className="flex-row flex-wrap items-end"
          >
            <input type="hidden" name="projectId" value={row.projectId} />
            <input type="hidden" name="periodEnd" value={row.invoiceDate} />
            <Field
              id={`days-${row.key}`}
              name="days"
              label="Days"
              inputMode="decimal"
              className="w-20"
              defaultValue={row.overrideDays ?? ""}
            />
            <Field
              id={`amount-${row.key}`}
              name="amountGbp"
              label="or amount (£)"
              inputMode="decimal"
              className="w-28"
              defaultValue={row.overrideAmount ?? ""}
            />
            <Field
              id={`override-note-${row.key}`}
              name="note"
              label="Note"
              className="w-40"
              defaultValue={row.overrideNote ?? ""}
            />
          </ActionForm>
          {row.hasOverride && (
            <ActionForm action={clearOverride} submit="Clear" variant="ghost">
              <input type="hidden" name="projectId" value={row.projectId} />
              <input type="hidden" name="periodEnd" value={row.invoiceDate} />
            </ActionForm>
          )}
        </div>
      )}
      {row.amount !== "0.00" && (
        <ActionForm
          action={saveExpectation}
          submit="Set due date"
          variant="outline"
          className="flex-row flex-wrap items-end"
        >
          <input type="hidden" name="invoiceKey" value={row.key} />
          <input
            type="hidden"
            name="excluded"
            value={row.included ? "false" : "true"}
          />
          <Field
            id={`lands-${row.key}`}
            name="expectedOn"
            label={`Expected (due ${formatDayName(row.dueDate)})`}
            type="date"
            className="w-40"
            defaultValue={row.expectedOn ?? ""}
          />
          <Field
            id={`landing-note-${row.key}`}
            name="note"
            label="Note"
            className="w-40"
            defaultValue={row.note ?? ""}
          />
        </ActionForm>
      )}
    </div>
  )
}

function IncludeBox({ row, month }: { row: MoneyInRow; month: string }) {
  const [pending, setPending] = useState(false)
  const name = row.projectName ?? row.invoiceNumber ?? "this invoice"
  return (
    <Checkbox
      aria-label={`Include ${name} in ${month} payout`}
      checked={row.included}
      disabled={pending || row.amount === "0.00"}
      className="mt-0.5"
      onCheckedChange={(checked) => {
        const data = new FormData()
        data.set("invoiceKey", row.key)
        data.set("excluded", checked ? "false" : "true")
        data.set("expectedOn", row.expectedOn ?? "")
        data.set("note", row.note ?? "")
        setPending(true)
        startTransition(async () => {
          await saveExpectation(null, data)
          setPending(false)
        })
      }}
    />
  )
}

function StatusPill({ invoice }: { invoice: BucketInvoice }) {
  const { kind, row } = invoice
  const number = row.invoiceNumber ? ` · ${row.invoiceNumber}` : ""
  if (kind === "raised")
    return (
      <Badge variant="outline" className="border-success text-success">
        Raised{number}
      </Badge>
    )
  if (kind === "overdue")
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        Overdue{number}
      </Badge>
    )
  return (
    <Badge
      variant="outline"
      className="border-dashed border-primary text-foreground"
    >
      {row.custom ? "One-off" : row.status === "late" ? "Late" : "Predicted"}
    </Badge>
  )
}

function InvoiceCard({
  invoice,
  month,
  open,
  onToggle,
}: {
  invoice: BucketInvoice
  month: string
  open: boolean
  onToggle: () => void
}) {
  const { row, kind } = invoice
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-background/60 p-3 text-sm",
        kind === "predicted" && "border-dashed border-primary/60",
        kind === "raised" && "border-solid border-border",
        kind === "overdue" &&
          "border-solid border-destructive/60 bg-destructive/5",
        !row.included && "opacity-50"
      )}
    >
      <div className="flex items-start gap-2">
        <IncludeBox row={row} month={month} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{invoice.title}</p>
          <div className="mt-1">
            <StatusPill invoice={invoice} />
          </div>
        </div>
        <p
          className={cn(
            "font-medium tabular-nums",
            !row.included && "line-through"
          )}
        >
          {formatMoney(row.amount)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={cn(
            "bg-foreground text-background tabular-nums",
            kind === "overdue" && "bg-destructive text-background"
          )}
        >
          Due {formatDayName(invoice.dueOn)}
        </Badge>
        {!row.custom && (
          <>
            <Badge variant="outline" className="tabular-nums">
              {kind === "predicted" ? "Raise" : "Raised"}{" "}
              {formatDayShort(row.invoiceDate)}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              from {formatDayShort(row.periodStart)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{invoice.detail}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={onToggle}
        >
          Edit<span className="sr-only"> {invoice.title}</span>
        </Button>
      </div>
      {open && <Editor row={row} />}
    </li>
  )
}

function ClientBlock({
  group,
  month,
  openKey,
  setOpenKey,
}: {
  group: ClientGroup
  month: string
  openKey: string | null
  setOpenKey: (key: string | null) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start gap-2 text-sm">
        <Dot colour={group.colour} className="mt-1.5" />
        <h4 className="min-w-0 flex-1 font-semibold">{group.client}</h4>
        <p className="w-20 shrink-0 text-right tabular-nums">
          {formatMoney(group.total)}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {group.invoices.map((i) => (
          <InvoiceCard
            key={i.row.key}
            invoice={i}
            month={month}
            open={openKey === i.row.key}
            onToggle={() =>
              setOpenKey(openKey === i.row.key ? null : i.row.key)
            }
          />
        ))}
      </ul>
    </section>
  )
}

function Bucket({
  bucket,
  openKey,
  setOpenKey,
}: {
  bucket: PayoutBucket
  openKey: string | null
  setOpenKey: (key: string | null) => void
}) {
  const monthName = bucket.month ? formatMonthName(bucket.month) : "Later"
  const empty = bucket.clients.length === 0
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4">
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-heading text-base font-semibold">
            {monthName}
            {bucket.payoutDate && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                paid {formatDayName(bucket.payoutDate)}
              </span>
            )}
          </h3>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          {bucket.takeHome && (
            <p className="text-xs font-medium tracking-wide text-success uppercase">
              Take-home each
              <span className="block font-mono text-2xl font-semibold tracking-normal normal-case tabular-nums">
                {formatMoney(bucket.takeHome)}
              </span>
            </p>
          )}
          <p className="text-sm tabular-nums">
            {formatMoney(bucket.totalIn)} invoiced in
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Invoices after tax set-aside: {formatMoney(bucket.each)} each
        </p>
        <SplitBar parts={bucket.segments} />
        <SplitLegend parts={bucket.segments} amount={formatMoney} />
        <p className="min-h-8 text-xs text-muted-foreground tabular-nums">
          {bucket.leftOut
            ? `${bucket.leftOut.count} left out, worth ${formatMoney(bucket.leftOut.worth)} (${formatMoney(bucket.leftOut.each)} each)`
            : "Nothing left out"}
        </p>
      </header>
      {empty ? (
        <p className="text-sm text-muted-foreground">
          No invoices forecast for {monthName} yet. They&apos;ll appear once
          time is tracked for that period.
        </p>
      ) : (
        bucket.clients.map((g) => (
          <ClientBlock
            key={g.client}
            group={g}
            month={monthName}
            openKey={openKey}
            setOpenKey={setOpenKey}
          />
        ))
      )}
    </section>
  )
}

/** The Money in card: one bucket per payout month, with one editor open at a time. */
export function MoneyInBuckets({
  months,
  later,
}: {
  months: PayoutBucket[]
  later: PayoutBucket | null
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>Every invoice still to land</CardTitle>
          <CardDescription>Untick an invoice to leave it out.</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <Plus aria-hidden />
          One-off invoice
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {adding && (
          <div className="rounded-lg border border-border p-3">
            <p className="mb-3 text-sm text-muted-foreground">
              For work only you know about yet. It counts like any invoice, with
              a set-aside. Delete it when the real invoice is in Xero, or
              it&apos;ll be counted twice.
            </p>
            <ActionForm
              action={saveCustomInvoice}
              submit="Add to forecast"
              resetOnSuccess
              className="flex-row flex-wrap items-end"
            >
              <CustomInvoiceFields />
            </ActionForm>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          {months.map((b) => (
            <Bucket
              key={b.month}
              bucket={b}
              openKey={openKey}
              setOpenKey={setOpenKey}
            />
          ))}
        </div>
        {later && (
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              Due after the months shown: {formatMoney(later.totalIn)}
            </summary>
            <div className="mt-4 grid gap-6 lg:grid-cols-3">
              {later.clients.map((g) => (
                <ClientBlock
                  key={g.client}
                  group={g}
                  month="a later"
                  openKey={openKey}
                  setOpenKey={setOpenKey}
                />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
