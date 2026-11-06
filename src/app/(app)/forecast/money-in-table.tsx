"use client"

import { Eye, EyeOff } from "lucide-react"
import { Fragment, startTransition, useState } from "react"

import { ActionForm } from "@/components/action-form"
import { Field } from "@/components/form-fields"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MoneyInGroup, MoneyInRow } from "@/lib/forecast"
import {
  formatDayShort,
  formatMonth,
  formatPence,
  formatDays,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  clearOverride,
  deleteCustomInvoice,
  saveCustomInvoice,
  saveExpectation,
  saveOverride,
} from "./actions"

const COLUMNS = 8

const groupTitle = (g: MoneyInGroup) =>
  g.kind === "month" ? formatMonth(g.month!) : "After the months shown"

/** One click to take an invoice out of the forecast, or put it back. */
function EyeToggle({ row }: { row: MoneyInRow }) {
  const [pending, setPending] = useState(false)
  const name = row.invoiceNumber ?? row.projectName ?? "this invoice"
  const label = row.included
    ? `Leave ${name} out of the forecast`
    : `Put ${name} back in the forecast`
  const Icon = row.included ? Eye : EyeOff
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={!row.included}
      title={label}
      disabled={pending || row.amount === "0.00"}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-30",
        !row.included && "text-destructive"
      )}
      onClick={(e) => {
        e.stopPropagation()
        const data = new FormData()
        data.set("invoiceKey", row.key)
        data.set("excluded", row.included ? "true" : "false")
        data.set("expectedOn", row.expectedOn ?? "")
        data.set("note", row.note ?? "")
        setPending(true)
        startTransition(async () => {
          await saveExpectation(null, data)
          setPending(false)
        })
      }}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

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
        label="Money lands"
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
          submit="Set landing date"
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
            label={`Lands (due ${formatDayShort(row.dueDate)})`}
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

function Row({
  row,
  open,
  onToggle,
}: {
  row: MoneyInRow
  open: boolean
  onToggle: () => void
}) {
  const overdue = row.status === "overdue"
  const changed = row.hasOverride || row.expectedOn !== null || !row.included
  return (
    <Fragment>
      <TableRow
        onClick={onToggle}
        className={cn("cursor-pointer", open && "bg-muted/50")}
      >
        <TableCell className="w-10 px-1 text-center">
          <EyeToggle row={row} />
        </TableCell>
        <TableCell className="whitespace-normal">
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="text-left hover:underline"
          >
            {row.projectName ?? "No project"}
            {row.invoiceNumber && (
              <span className="block text-xs text-muted-foreground">
                {row.invoiceNumber}
              </span>
            )}
          </button>
        </TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">
          {row.custom
            ? "One-off"
            : `${formatDayShort(row.periodStart)} – ${formatDayShort(row.periodEnd)}`}
        </TableCell>
        <TableCell
          className={cn(
            "whitespace-nowrap",
            !row.included && "text-muted-foreground line-through"
          )}
        >
          {formatDayShort(row.landsOn)}
        </TableCell>
        <TableCell className="text-right whitespace-nowrap tabular-nums">
          {row.custom
            ? "–"
            : `${formatDays(row.trackedDays)} + ${formatDays(row.forecastDays)}`}
          {row.hasOverride && (
            <span className="block text-xs text-muted-foreground">
              set to {formatDays(row.totalDays)}
            </span>
          )}
        </TableCell>
        <TableCell
          className={cn(
            "text-right font-medium tabular-nums",
            !row.included && "text-muted-foreground line-through"
          )}
        >
          {formatPence(row.amount)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatPence(row.contractorCost)}
        </TableCell>
        <TableCell className={cn(overdue && "font-medium text-destructive")}>
          {row.included ? row.status : `left out (${row.status})`}
          {changed && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              · what-if
            </span>
          )}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUMNS}>
            <Editor row={row} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
}

/** One line per invoice; clicking a line opens its one editor. */
export function MoneyInTable({ groups }: { groups: MoneyInGroup[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 px-1 text-center">
            <span className="sr-only">Counted in the forecast</span>
          </TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Period, to invoice date</TableHead>
          <TableHead>Lands</TableHead>
          <TableHead className="text-right">
            Days
            <span className="block text-xs font-normal text-muted-foreground">
              tracked + forecast
            </span>
          </TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Contractor cost</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => (
          <Fragment key={g.kind + (g.month ?? "")}>
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={COLUMNS}
                className="pt-5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
              >
                {groupTitle(g)}
              </TableCell>
            </TableRow>
            {g.received !== null && g.received !== "0.00" && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="text-muted-foreground">
                  Already received this month
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPence(g.received)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            )}
            {g.rows.map((row) => (
              <Row
                key={row.key}
                row={row}
                open={openKey === row.key}
                onToggle={() =>
                  setOpenKey(openKey === row.key ? null : row.key)
                }
              />
            ))}
            <TableRow className="font-medium hover:bg-transparent">
              <TableCell colSpan={5}>
                {g.kind === "month"
                  ? "Invoices landing"
                  : "Total, not in the months above"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPence(g.totalAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPence(g.totalCost)}
              </TableCell>
              <TableCell />
            </TableRow>
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
