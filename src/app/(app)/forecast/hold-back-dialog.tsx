"use client"

import { Dialog } from "@base-ui/react/dialog"
import { Pencil, X } from "lucide-react"
import { useState } from "react"

import { ActionForm } from "@/components/action-form"
import { Field } from "@/components/form-fields"
import { Button } from "@/components/ui/button"
import { formatBalance, formatMoney, formatMonthName } from "@/lib/format"
import { clearHoldBack, saveHoldBack } from "./actions"

/**
 * The month's hold-back, in the "left in the bank" breakdown: click to set what
 * stays in the account at take-home. A set amount replaces the buffer.
 */
export function HoldBackDialog({
  month,
  amount,
  chosen,
  buffer,
}: {
  month: string
  amount: string
  chosen: boolean
  buffer: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="inline-flex items-center gap-1 rounded-sm text-left underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        {chosen
          ? `Held for next month ${formatBalance(amount)}, instead of the buffer`
          : "Hold back more for next month"}
        <Pencil aria-hidden className="size-3" />
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
            How much to leave in the account at take-home, so next month&apos;s
            bills can be paid. It replaces the {formatMoney(buffer)} buffer for
            this month, and comes out of this month&apos;s take-home.
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
              label="Leave in the account (£)"
              inputMode="decimal"
              className="w-40"
              defaultValue={chosen ? amount : buffer}
              required
            />
          </ActionForm>
          {chosen && (
            <ActionForm
              action={clearHoldBack}
              submit={`Use the ${formatMoney(buffer)} buffer`}
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
