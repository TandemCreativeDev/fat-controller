"use client"

import { Dialog } from "@base-ui/react/dialog"
import { Pencil, X } from "lucide-react"
import { useState } from "react"

import { ActionForm } from "@/components/action-form"
import { Field } from "@/components/form-fields"
import { Button } from "@/components/ui/button"
import { formatMoney, formatMonthName } from "@/lib/format"
import { clearHoldBack, saveHoldBack } from "./actions"

/** "Held for next month": click to choose the amount instead of the suggestion. */
export function HoldBackDialog({
  month,
  amount,
  suggested,
  chosen,
  reason,
}: {
  month: string
  amount: string
  suggested: string
  chosen: boolean
  reason: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="flex w-full items-baseline justify-between gap-3 rounded-md text-left text-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span className="text-muted-foreground">
          Held for next month{" "}
          <span className="text-xs">
            ({chosen ? "your amount" : "suggested"})
          </span>
          <Pencil aria-hidden className="ml-1 inline size-3" />
        </span>
        <span className="font-mono tabular-nums">{formatMoney(amount)}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-background p-5 outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-heading text-base font-semibold">
              Hold back in {formatMonthName(month)}
            </Dialog.Title>
            <Dialog.Close
              render={
                <Button variant="ghost" size="icon" aria-label="Close">
                  <X aria-hidden />
                </Button>
              }
            />
          </div>
          <Dialog.Description className="text-sm text-muted-foreground">
            Kept in the account at take-home so next month&apos;s bills can be
            paid. It comes out of this month&apos;s take-home, on top of the
            buffer. Suggested: {formatMoney(suggested)}.{reason && ` ${reason}`}
          </Dialog.Description>
          <ActionForm
            action={saveHoldBack}
            submit="Save"
            className="flex-row flex-wrap items-end"
          >
            <input type="hidden" name="month" value={month} />
            <Field
              id={`hold-back-${month}`}
              name="amountGbp"
              label="Hold back (£)"
              inputMode="decimal"
              className="w-40"
              defaultValue={amount}
              required
            />
          </ActionForm>
          {chosen && (
            <ActionForm
              action={clearHoldBack}
              submit="Use the suggestion"
              variant="ghost"
            >
              <input type="hidden" name="month" value={month} />
            </ActionForm>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
