"use client"

import { Fragment, useState } from "react"

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
import { formatDay, formatPence } from "@/lib/format"
import { cn } from "@/lib/utils"
import { deleteAdjustment, saveAdjustment } from "./actions"

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
