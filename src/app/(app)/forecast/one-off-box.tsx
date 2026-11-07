"use client"

import { startTransition, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { saveRunningCostOneOff } from "./actions"

/** Tick to leave a running cost, or a whole group of them, out of the average. */
export function OneOffBox({
  sourceIds,
  checked,
  indeterminate = false,
  name,
  label,
}: {
  sourceIds: string[]
  checked: boolean
  indeterminate?: boolean
  /** What this ticks, for a screen reader. */
  name: string
  label: string
}) {
  const [pending, setPending] = useState(false)
  return (
    <label className="flex items-center gap-2 text-xs whitespace-nowrap">
      <Checkbox
        aria-label={`Mark ${name} as a one-off`}
        checked={checked}
        indeterminate={indeterminate}
        disabled={pending}
        onCheckedChange={(next) => {
          const data = new FormData()
          for (const id of sourceIds) data.append("sourceId", id)
          data.set("oneOff", next ? "true" : "false")
          setPending(true)
          startTransition(async () => {
            await saveRunningCostOneOff(null, data)
            setPending(false)
          })
        }}
      />
      {label}
    </label>
  )
}
