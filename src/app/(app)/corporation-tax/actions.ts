"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { FormState } from "@/components/action-form"
import { firstError } from "@/lib/form"
import { requireDirector } from "@/lib/session"
import { getSettings, saveSetting } from "@/lib/settings-store"

const ctPaidForm = z.object({
  yearStart: z.iso.date(),
  paid: z.enum(["true", "false"]),
})

/** Tick a financial year's Corporation Tax as paid, or untick it. */
export async function setCtPaid(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const parsed = ctPaidForm.safeParse(Object.fromEntries(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { yearStart, paid } = parsed.data
  const years = new Set((await getSettings()).ct_paid_years)
  if (paid === "true") years.add(yearStart)
  else years.delete(yearStart)
  await saveSetting("ct_paid_years", [...years].sort(), director.id)
  revalidatePath("/corporation-tax")
  return { ok: true, message: "Saved." }
}
