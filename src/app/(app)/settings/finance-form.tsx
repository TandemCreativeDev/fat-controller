"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Settings } from "@/lib/settings"
import { saveFinanceSettings } from "./actions"

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export function FinanceForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveFinanceSettings, null)

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          Financial year starts
        </legend>
        <div className="flex gap-2">
          <Input
            aria-label="Day"
            name="fyDay"
            type="number"
            min={1}
            max={31}
            defaultValue={settings.financial_year_start.day}
            className="w-20"
            required
          />
          <select
            aria-label="Month"
            name="fyMonth"
            defaultValue={settings.financial_year_start.month}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state && (
          <p
            role="status"
            className={
              state.ok
                ? "text-sm text-muted-foreground"
                : "text-sm text-destructive"
            }
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  )
}
