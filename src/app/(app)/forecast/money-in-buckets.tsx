"use client"

import { Plus } from "lucide-react"
import { startTransition, useEffect, useRef, useState } from "react"

import { ActionForm } from "@/components/action-form"
import { EditSurface } from "@/components/bottom-sheet"
import { MonthPane, MonthSwipe, useMonth } from "@/components/month-context"
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
import { useIsMobile } from "@/hooks/use-is-mobile"
import type { MoneyInRow } from "@/lib/forecast"
import { clientAnchor } from "@/lib/forecast-buckets"
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
  formatMonthShort,
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
        className="w-56 max-md:w-full"
        defaultValue={row?.label}
        required
      />
      <Field
        id={`custom-amount-${id}`}
        name="amountGbp"
        label="Amount before VAT (£)"
        inputMode="decimal"
        className="w-36 max-md:w-full"
        defaultValue={row?.amount}
        required
      />
      <Field
        id={`custom-cost-${id}`}
        name="contractorCostGbp"
        label="Contractor cost (£)"
        inputMode="decimal"
        className="w-32 max-md:w-full"
        defaultValue={row?.cost}
      />
      <Field
        id={`custom-lands-${id}`}
        name="landsOn"
        label="Due"
        type="date"
        className="w-40 max-md:w-full"
        defaultValue={row?.landsOn}
        required
      />
      <Field
        id={`custom-note-${id}`}
        name="note"
        label="Note"
        className="w-48 max-md:w-full"
        defaultValue={row?.note ?? ""}
      />
    </>
  )
}

function Editor({ row }: { row: MoneyInRow }) {
  if (row.custom)
    return (
      <div className="flex flex-wrap items-end gap-3 py-2 max-md:flex-col max-md:items-stretch">
        <ActionForm
          action={saveCustomInvoice}
          submit="Save"
          variant="outline"
          className="flex-row flex-wrap items-end max-md:flex-col max-md:items-stretch"
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
          className="max-md:order-first"
        >
          <input type="hidden" name="id" value={row.custom.id} />
        </ActionForm>
      </div>
    )
  return (
    <div className="flex flex-wrap items-end gap-6 py-2 max-md:flex-col max-md:items-stretch">
      {row.canOverride && row.projectId && (
        <div className="flex items-end gap-2 max-md:flex-col max-md:items-stretch">
          <ActionForm
            action={saveOverride}
            submit="Set days, amount or cap"
            variant="outline"
            className="flex-row flex-wrap items-end max-md:flex-col max-md:items-stretch"
          >
            <input type="hidden" name="projectId" value={row.projectId} />
            <input type="hidden" name="periodEnd" value={row.invoiceDate} />
            <Field
              id={`days-${row.key}`}
              name="days"
              label="Days"
              inputMode="decimal"
              className="w-20 max-md:w-full"
              defaultValue={row.overrideDays ?? ""}
            />
            <Field
              id={`amount-${row.key}`}
              name="amountGbp"
              label="or amount (£)"
              inputMode="decimal"
              className="w-28 max-md:w-full"
              defaultValue={row.overrideAmount ?? ""}
            />
            <Field
              id={`cap-${row.key}`}
              name="maxDays"
              label={
                row.capDays && row.overrideMaxDays === null
                  ? `Cap (project: ${Number(row.capDays)} days)`
                  : "Cap (days)"
              }
              inputMode="decimal"
              className="w-36 max-md:w-full"
              defaultValue={row.overrideMaxDays ?? ""}
            />
            <Field
              id={`override-note-${row.key}`}
              name="note"
              label="Note"
              className="w-40 max-md:w-full"
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
          className="flex-row flex-wrap items-end max-md:flex-col max-md:items-stretch"
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
            className="w-40 max-md:w-full"
            defaultValue={row.expectedOn ?? ""}
          />
          <Field
            id={`landing-note-${row.key}`}
            name="note"
            label="Note"
            className="w-40 max-md:w-full"
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
      aria-label={`Include ${name} in ${month} take-home`}
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
    return <Badge className="bg-success text-background">Raised{number}</Badge>
  if (kind === "overdue")
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        Overdue{number}
      </Badge>
    )
  return (
    <Badge variant="outline" className="border-primary text-foreground">
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
  const mobile = useIsMobile()
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-background p-3 text-sm",
        kind === "predicted" && "border-primary/60",
        kind === "raised" && "border-solid border-border",
        kind === "overdue" && "border-solid border-destructive/60",
        !row.included && "opacity-50"
      )}
      // On mobile, the whole card opens the editor. Its controls keep their own job.
      onClick={(e) => {
        const target = e.target as Element
        if (
          mobile &&
          !open &&
          e.currentTarget.contains(target) &&
          !target.closest("button, a, input, label, [role=checkbox]")
        )
          onToggle()
      }}
    >
      <div className="flex items-start gap-2">
        <IncludeBox row={row} month={month} />
        <div className="min-w-0 flex-1">
          <p className="font-medium max-md:line-clamp-2">{invoice.title}</p>
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
      <div>
        <StatusPill invoice={invoice} />
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
      <EditSurface open={open} onClose={onToggle} title={invoice.title}>
        <Editor row={row} />
      </EditSurface>
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
  month: { name: string; iso: string | null }
  openKey: string | null
  setOpenKey: (key: string | null) => void
}) {
  return (
    <section
      id={month.iso ? clientAnchor(group.client, month.iso) : undefined}
      className="flex scroll-mt-28 flex-col gap-2"
    >
      <div className="flex items-start gap-2 text-sm">
        <Dot colour={group.colour} className="mt-1.5" />
        <h3 className="min-w-0 flex-1 font-semibold">{group.client}</h3>
        <p className="w-20 shrink-0 text-right tabular-nums">
          {formatMoney(group.total)}
        </p>
      </div>
      <div className="flex flex-col gap-3.5">
        {group.runs.map((run) => (
          <div
            key={`${run.dueDate}|${run.raiseDate}`}
            role="group"
            aria-label={`Invoices due ${formatDayName(run.dueDate)}, ${run.invoices.length} ${run.invoices.length === 1 ? "invoice" : "invoices"}, ${formatMoney(run.total)}`}
            className="run-tray flex flex-col rounded-[13px] border border-white/6 bg-white/[0.035] p-1.5"
          >
            <ul className="flex flex-col gap-1.5">
              {run.invoices.map((i) => (
                <InvoiceCard
                  key={i.row.key}
                  invoice={i}
                  month={month.name}
                  open={openKey === i.row.key}
                  onToggle={() =>
                    setOpenKey(openKey === i.row.key ? null : i.row.key)
                  }
                />
              ))}
            </ul>
            <p className="px-2 pt-1 pb-0.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
              {formatMoney(run.total)}
            </p>
          </div>
        ))}
      </div>
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
  const header = useRef<HTMLElement>(null)
  const [scrolledPast, setScrolledPast] = useState(false)
  const inView = useMonth()?.selected === bucket.month
  useEffect(() => {
    if (!header.current || !inView) return
    const watcher = new IntersectionObserver(
      ([entry]) =>
        setScrolledPast(
          !entry.isIntersecting && entry.boundingClientRect.top < 0
        ),
      { rootMargin: "-100px 0px 0px 0px" }
    )
    watcher.observe(header.current)
    return () => watcher.disconnect()
  }, [inView])
  return (
    <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3 md:p-4">
      {inView && scrolledPast && bucket.month && (
        // Fixed, so appearing never moves anything on the page.
        <p className="fixed inset-x-0 top-[6.5rem] z-10 border-b border-border bg-background/95 px-4 py-2 text-sm font-medium tabular-nums backdrop-blur-md md:hidden">
          {formatMonthShort(bucket.month)}
          {bucket.takeHome && ` · ${formatMoney(bucket.takeHome)} each`} ·{" "}
          {formatMoney(bucket.totalIn)} in
        </p>
      )}
      <header
        ref={header}
        className="flex flex-col gap-2 border-b border-border pb-3"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">
            {monthName}
            {bucket.payoutDate && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                paid {formatDayName(bucket.payoutDate)}
              </span>
            )}
          </h2>
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
        {bucket.takeHomeNote && (
          <p className="text-xs tabular-nums">{bucket.takeHomeNote}</p>
        )}
        <p className="text-xs text-muted-foreground tabular-nums">
          Invoices after tax set-aside: {formatMoney(bucket.each)} each
        </p>
        <SplitBar parts={bucket.segments} />
        <SplitLegend parts={bucket.segments} amount={formatMoney} />
        <p className="min-h-8 text-xs text-muted-foreground tabular-nums">
          Total days worked: {bucket.days}
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
            month={{ name: monthName, iso: bucket.month }}
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
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 max-md:bg-primary! max-md:text-primary-foreground! max-md:shadow-lg md:static"
        >
          <Plus aria-hidden />
          One-off invoice
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 max-md:px-2">
        <EditSurface
          open={adding}
          onClose={() => setAdding(false)}
          title="One-off invoice"
        >
          <div className="rounded-lg border border-border p-3 max-md:border-0 max-md:p-0">
            <p className="mb-3 text-sm text-muted-foreground">
              For work only you know about yet. It counts like any invoice, with
              a set-aside. Delete it when the real invoice is in Xero, or
              it&apos;ll be counted twice.
            </p>
            <ActionForm
              action={saveCustomInvoice}
              submit="Add to forecast"
              resetOnSuccess
              className="flex-row flex-wrap items-end max-md:flex-col max-md:items-stretch"
            >
              <CustomInvoiceFields />
            </ActionForm>
          </div>
        </EditSurface>
        <MonthSwipe className="grid gap-4 lg:grid-cols-3">
          {months.map((b) => (
            <MonthPane key={b.month} month={b.month!} className="flex">
              <Bucket bucket={b} openKey={openKey} setOpenKey={setOpenKey} />
            </MonthPane>
          ))}
        </MonthSwipe>
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
                  month={{ name: "a later", iso: null }}
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
