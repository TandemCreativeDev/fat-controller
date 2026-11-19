"use client"

import { startTransition, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { setCtPaid } from "./actions"

/** Ticks a financial year's Corporation Tax as paid. */
export function CtPaidBox({
  yearStart,
  label,
  paid,
}: {
  yearStart: string
  label: string
  paid: boolean
}) {
  const [pending, setPending] = useState(false)
  const id = `ct-paid-${yearStart}`
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <Checkbox
        id={id}
        aria-label={`Corporation Tax paid for ${label}`}
        checked={paid}
        disabled={pending}
        onCheckedChange={(checked) => {
          const data = new FormData()
          data.set("yearStart", yearStart)
          data.set("paid", checked ? "true" : "false")
          setPending(true)
          startTransition(async () => {
            await setCtPaid(null, data)
            setPending(false)
          })
        }}
      />
      CT paid
    </label>
  )
}
