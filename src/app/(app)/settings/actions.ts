"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { settingDefinitions } from "@/lib/settings"
import { saveSetting } from "@/lib/settings-store"
import { requireDirector } from "@/lib/session"

export type FormState = { ok: boolean; message: string } | null

const financeForm = z.object({
  ctRatePercent: z.coerce.number().min(0).max(100),
  fyMonth: z.coerce.number().int(),
  fyDay: z.coerce.number().int(),
})

export async function saveFinanceSettings(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const form = financeForm.safeParse(Object.fromEntries(formData))
  if (!form.success)
    return { ok: false, message: "Check the values and try again." }

  const rate = Math.round(form.data.ctRatePercent * 100) / 10_000
  const fy = settingDefinitions.financial_year_start.schema.safeParse({
    month: form.data.fyMonth,
    day: form.data.fyDay,
  })
  if (!fy.success)
    return {
      ok: false,
      message: "That financial year start date doesn't exist.",
    }

  await saveSetting("ct_set_aside_rate", rate, director.id)
  await saveSetting("financial_year_start", fy.data, director.id)
  revalidatePath("/", "layout")
  return { ok: true, message: "Saved." }
}
