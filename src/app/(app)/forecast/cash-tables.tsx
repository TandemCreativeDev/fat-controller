"use client"

import { Fragment, useState } from "react"

import { ActionForm } from "@/components/action-form"
import { Field, SelectField } from "@/components/form-fields"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BillPlan, MonthBreakdown } from "@/lib/forecast"
import {
  formatDay,
  formatDayShort,
  formatMonth,
  formatPence,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  clearHoldBack,
  deleteAdjustment,
  deleteBill,
  markBillPaid,
  planBill,
  saveAdjustment,
  saveHoldBack,
  unmatchBill,
} from "./actions"

/** Opens one editor at a time; the first cell's button makes that keyboard-friendly. */
function useOneOpen() {
  const [open, setOpen] = useState<string | null>(null)
  return {
    isOpen: (key: string) => open === key,
    toggle: (key: string) => setOpen(open === key ? null : key),
  }
}

function RowButton({
  open,
  onClick,
  children,
}: {
  open: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className="text-left hover:underline"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ bills

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

function BillEditor({
  bill,
  payments,
}: {
  bill: BillPlan
  payments: Payment[]
}) {
  const key = `${bill.personId}-${bill.issuedOn}`
  if (bill.status !== "unpaid")
    return bill.id ? (
      <ActionForm
        action={unmatchBill}
        submit="Unmatch payment"
        variant="outline"
      >
        <input type="hidden" name="id" value={bill.id} />
      </ActionForm>
    ) : null
  const mine = payments.filter((p) => p.personId === bill.personId)
  return (
    <div className="flex flex-wrap items-end gap-6 py-2">
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
  )
}

export function BillsTable({
  bills,
  payments,
}: {
  bills: BillPlan[]
  payments: Payment[]
}) {
  const { isOpen, toggle } = useOneOpen()
  if (bills.length === 0)
    return <p className="text-sm text-muted-foreground">No bills yet.</p>
  const unpaid = bills.filter((b) => b.status === "unpaid")
  const paid = bills.filter((b) => b.status !== "unpaid")
  const groups: [string, BillPlan[]][] = [
    ["To pay", unpaid],
    ["Paid", paid],
  ]
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Person</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Work period</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Pay date</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map(([title, list]) =>
          list.length === 0 ? null : (
            <Fragment key={title}>
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="pt-5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
                >
                  {title}
                </TableCell>
              </TableRow>
              {list.map((b) => {
                const key = `${b.personId}-${b.issuedOn}`
                return (
                  <Fragment key={key}>
                    <TableRow
                      onClick={() => toggle(key)}
                      className={cn(
                        "cursor-pointer",
                        isOpen(key) && "bg-muted/50"
                      )}
                    >
                      <TableCell>
                        <RowButton
                          open={isOpen(key)}
                          onClick={() => toggle(key)}
                        >
                          {b.personName}
                        </RowButton>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDayShort(b.issuedOn)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDayShort(b.periodStart)} –{" "}
                        {formatDayShort(b.periodEnd)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatPence(b.amount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDayShort(b.dueOn)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {b.paidOn
                          ? `Paid ${formatDayShort(b.paidOn)}`
                          : b.expectedPayOn
                            ? `Expected ${formatDayShort(b.expectedPayOn)}`
                            : "–"}
                      </TableCell>
                      <TableCell>
                        {b.status === "unpaid"
                          ? b.id
                            ? "entered"
                            : "forecast"
                          : b.status}
                      </TableCell>
                    </TableRow>
                    {isOpen(key) && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7}>
                          <BillEditor bill={b} payments={payments} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </Fragment>
          )
        )}
      </TableBody>
    </Table>
  )
}

// ------------------------------------------------------------------ hold-backs

export function HoldBacksTable({ months }: { months: MonthBreakdown[] }) {
  const { isOpen, toggle } = useOneOpen()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Suggested</TableHead>
          <TableHead className="text-right">Held back</TableHead>
          <TableHead>Set by</TableHead>
          <TableHead>Protects</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {months.map((m) => (
          <Fragment key={m.month}>
            <TableRow
              onClick={() => toggle(m.month)}
              className={cn("cursor-pointer", isOpen(m.month) && "bg-muted/50")}
            >
              <TableCell>
                <RowButton
                  open={isOpen(m.month)}
                  onClick={() => toggle(m.month)}
                >
                  {formatMonth(m.month)}
                </RowButton>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPence(m.suggestedHoldBack)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatPence(m.holdBack)}
              </TableCell>
              <TableCell>
                {m.holdBackSource === "director"
                  ? "A director"
                  : m.holdBackSource === "suggested"
                    ? "Suggestion"
                    : "–"}
              </TableCell>
              <TableCell>
                {m.holdBackReason
                  ? `${m.holdBackReason.personName}'s bill, due ${formatDayShort(m.holdBackReason.dueOn)}`
                  : "–"}
              </TableCell>
            </TableRow>
            {isOpen(m.month) && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5}>
                  <div className="flex flex-wrap items-end gap-3 py-2">
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
                        label="Hold back (£); 0 for none"
                        inputMode="decimal"
                        className="w-48"
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
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}

// ------------------------------------------------------------------ adjustments

type Adjustment = {
  id: string
  date: string
  label: string
  amountGbp: string
  note: string | null
}

function AdjustmentFields({ row }: { row?: Adjustment }) {
  const id = row?.id ?? "new"
  return (
    <>
      {row && <input type="hidden" name="id" value={row.id} />}
      <Field
        id={`adjustment-date-${id}`}
        name="date"
        label="Date"
        type="date"
        className="w-40"
        defaultValue={row?.date}
        required
      />
      <Field
        id={`adjustment-label-${id}`}
        name="label"
        label="Label"
        className="w-48"
        defaultValue={row?.label}
        required
      />
      <Field
        id={`adjustment-amount-${id}`}
        name="amountGbp"
        label="Amount (£), negative for money out"
        inputMode="decimal"
        className="w-56"
        defaultValue={row?.amountGbp}
        required
      />
      <Field
        id={`adjustment-note-${id}`}
        name="note"
        label="Note"
        className="w-48"
        defaultValue={row?.note ?? ""}
      />
    </>
  )
}

export function AdjustmentsTable({ rows }: { rows: Adjustment[] }) {
  const { isOpen, toggle } = useOneOpen()
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <Fragment key={a.id}>
                <TableRow
                  onClick={() => toggle(a.id)}
                  className={cn(
                    "cursor-pointer",
                    isOpen(a.id) && "bg-muted/50"
                  )}
                >
                  <TableCell className="whitespace-nowrap">
                    <RowButton open={isOpen(a.id)} onClick={() => toggle(a.id)}>
                      {formatDay(a.date)}
                    </RowButton>
                  </TableCell>
                  <TableCell>{a.label}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPence(a.amountGbp)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.note}
                  </TableCell>
                </TableRow>
                {isOpen(a.id) && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4}>
                      <div className="flex flex-wrap items-end gap-3 py-2">
                        <ActionForm
                          action={saveAdjustment}
                          submit="Save"
                          variant="outline"
                          className="flex-row flex-wrap items-end"
                        >
                          <AdjustmentFields row={a} />
                        </ActionForm>
                        <ActionForm
                          action={deleteAdjustment}
                          submit="Delete"
                          variant="ghost"
                        >
                          <input type="hidden" name="id" value={a.id} />
                        </ActionForm>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Add an adjustment
        </summary>
        <ActionForm
          action={saveAdjustment}
          submit="Add adjustment"
          resetOnSuccess
          className="mt-3 flex-row flex-wrap items-end"
        >
          <AdjustmentFields />
        </ActionForm>
      </details>
    </div>
  )
}
