"use server"

import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { FormState } from "@/components/action-form"
import { db } from "@/db"
import {
  accountGroup,
  payRate,
  person,
  project,
  projectSolidtime,
  solidtimeMember,
  xeroAccount,
} from "@/db/schema"
import {
  dateList,
  firstError,
  moneyField,
  optionalDate,
  optionalMoney,
  optionalText,
  optionalUuid,
} from "@/lib/form"
import { applyContractorMatching } from "@/lib/forecast-sync"
import { saveSetting } from "@/lib/settings-store"
import { requireDirector } from "@/lib/session"

const refresh = () => revalidatePath("/", "layout")
const form = (data: FormData) => Object.fromEntries(data)

// ------------------------------------------------------------------ settings

const forecastSettings = z.object({
  forecastStartDate: optionalDate,
  buffer: z.coerce.number().min(0),
  directorSalary: z.coerce.number().min(0),
  rate: z.coerce.number().min(0).max(100),
  hoursPerDay: z.coerce.number().positive().max(24),
  rounding: z.coerce.number().positive().max(1),
  lookback: z.coerce.number().int().min(1).max(365),
  months: z.coerce.number().int().min(1).max(12),
  vatRegisteredFrom: optionalDate,
  vatRate: z.coerce.number().min(0).max(100),
  vatAccount: optionalUuid,
})

export async function saveForecastSettings(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const parsed = forecastSettings.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const v = parsed.data
  await saveSetting("forecast_start_date", v.forecastStartDate, director.id)
  await saveSetting("operating_buffer_gbp", v.buffer, director.id)
  await saveSetting(
    "director_monthly_salary_gbp",
    v.directorSalary,
    director.id
  )
  await saveSetting("ct_set_aside_rate", v.rate / 100, director.id)
  await saveSetting("hours_per_day", v.hoursPerDay, director.id)
  await saveSetting("invoice_day_rounding", v.rounding, director.id)
  await saveSetting("forecast_lookback_days", v.lookback, director.id)
  await saveSetting("forecast_months", v.months, director.id)
  await saveSetting("vat_registered_from", v.vatRegisteredFrom, director.id)
  await saveSetting("vat_rate", v.vatRate / 100, director.id)
  await saveSetting("vat_liability_account_id", v.vatAccount, director.id)
  // A new start date brings older bills into view. Link their payments now, or
  // they'd all look unpaid and due today until the next sync.
  await applyContractorMatching()
  refresh()
  return { ok: true, message: "Saved." }
}

// ------------------------------------------------------------------ bank accounts and groups

export async function saveBankRoles(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const roles: Record<string, "operating" | "tax_reserve"> = {}
  for (const [key, value] of data.entries()) {
    if (!key.startsWith("role:")) continue
    if (value === "operating" || value === "tax_reserve")
      roles[z.uuid().parse(key.slice(5))] = value
  }
  await saveSetting("bank_account_roles", roles, director.id)
  refresh()
  return { ok: true, message: "Saved." }
}

const GROUPS = ["sales", "people", "other", "exclude"] as const

/** A director's choice is stored as `manual`, which a sync never overwrites. */
export async function saveAccountGroups(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const known = new Set(
    (await db.select({ id: xeroAccount.accountId }).from(xeroAccount)).map(
      (a) => a.id
    )
  )
  const current = new Map(
    (await db.select().from(accountGroup)).map((g) => [g.accountId, g.group])
  )
  let changed = 0
  for (const [key, value] of data.entries()) {
    if (!key.startsWith("group:")) continue
    const accountId = key.slice(6)
    const group = GROUPS.find((g) => g === value)
    if (!group || !known.has(accountId) || current.get(accountId) === group)
      continue
    await db
      .insert(accountGroup)
      .values({ accountId, group, source: "manual", updatedBy: director.id })
      .onConflictDoUpdate({
        target: accountGroup.accountId,
        set: { group, source: "manual", updatedBy: director.id },
      })
    changed++
  }
  refresh()
  return { ok: true, message: `${changed} accounts changed.` }
}

// ------------------------------------------------------------------ projects

const projectForm = z
  .object({
    id: optionalUuid,
    kind: z.enum(["client", "internal"]),
    name: z.string().trim().min(1, "Give the project a name"),
    code: optionalText,
    xeroContactId: optionalUuid,
    solidtimeProjectIds: z.array(z.uuid()),
    chargeRateGbp: optionalMoney,
    invoiceAnchorDate: optionalDate,
    invoiceIntervalDays: z.coerce.number().int().min(1).default(14),
    endDate: optionalDate,
    extraInvoiceDates: dateList,
    skippedInvoiceDates: dateList,
    paymentTermsDays: z.coerce.number().int().min(0).default(30),
    active: z.preprocess((v) => v === "on", z.boolean()),
  })
  .refine((p) => p.kind === "internal" || p.code, {
    message: "A client project needs a code",
  })
  .refine(
    (p) =>
      p.kind === "internal" ||
      !p.active ||
      (p.chargeRateGbp && p.invoiceAnchorDate),
    { message: "An active client project needs a charge rate and anchor date" }
  )

export async function saveProject(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const parsed = projectForm.safeParse({
    ...form(data),
    solidtimeProjectIds: data.getAll("solidtimeProjectIds"),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { id, solidtimeProjectIds, ...v } = parsed.data
  const row = {
    ...v,
    code: v.kind === "internal" ? null : v.code,
    chargeRateGbp: v.kind === "internal" ? null : v.chargeRateGbp,
  }
  try {
    await db.transaction(async (tx) => {
      const projectId = id
        ? (await tx.update(project).set(row).where(eq(project.id, id)), id)
        : (
            await tx.insert(project).values(row).returning({ id: project.id })
          )[0].id
      await tx
        .delete(projectSolidtime)
        .where(eq(projectSolidtime.projectId, projectId))
      if (solidtimeProjectIds.length)
        await tx.insert(projectSolidtime).values(
          solidtimeProjectIds.map((solidtimeProjectId) => ({
            projectId,
            solidtimeProjectId,
          }))
        )
    })
  } catch {
    return {
      ok: false,
      message: "That code or a Solidtime project is already used by a project.",
    }
  }
  refresh()
  return { ok: true, message: "Saved." }
}

export async function deleteProject(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const id = z.uuid().parse(data.get("id"))
  await db.delete(project).where(eq(project.id, id))
  refresh()
  return { ok: true, message: "Deleted." }
}

// ------------------------------------------------------------------ people

const personForm = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(1, "Give the person a name"),
    kind: z.enum(["director", "contractor"]),
    solidtimeMemberId: optionalUuid,
    xeroContactId: optionalUuid,
    billTermsDays: z.coerce.number().int().min(0).default(30),
    billCutoffDays: z.coerce.number().int().min(0).default(7),
    defaultRate: optionalMoney,
  })
  .refine((p) => p.kind === "director" || p.defaultRate, {
    message: "A contractor can't be saved without a default pay rate",
  })

export async function savePerson(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const parsed = personForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { id, defaultRate, ...v } = parsed.data

  let solidtimeUserId: string | null = null
  if (v.solidtimeMemberId) {
    const [member] = await db
      .select({ userId: solidtimeMember.userId })
      .from(solidtimeMember)
      .where(eq(solidtimeMember.id, v.solidtimeMemberId))
    solidtimeUserId = member?.userId ?? null
  }
  const row = { ...v, solidtimeUserId }

  try {
    await db.transaction(async (tx) => {
      const personId = id
        ? (await tx.update(person).set(row).where(eq(person.id, id)), id)
        : (await tx.insert(person).values(row).returning({ id: person.id }))[0]
            .id
      const isDefault = and(
        eq(payRate.personId, personId),
        isNull(payRate.projectId)
      )
      await tx.delete(payRate).where(isDefault)
      if (v.kind === "contractor" && defaultRate)
        await tx
          .insert(payRate)
          .values({ personId, projectId: null, dayRateGbp: defaultRate })
      if (v.kind === "director")
        await tx.delete(payRate).where(eq(payRate.personId, personId))
    })
  } catch {
    return {
      ok: false,
      message: "That Solidtime member is already mapped to someone else.",
    }
  }
  refresh()
  return { ok: true, message: "Saved." }
}

export async function deletePerson(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const id = z.uuid().parse(data.get("id"))
  await db.delete(person).where(eq(person.id, id))
  refresh()
  return { ok: true, message: "Deleted." }
}

const projectRateForm = z.object({
  personId: z.uuid(),
  projectId: z.uuid(),
  dayRateGbp: moneyField,
})

export async function saveProjectRate(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const parsed = projectRateForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const v = parsed.data
  await db
    .insert(payRate)
    .values(v)
    .onConflictDoUpdate({
      target: [payRate.personId, payRate.projectId],
      set: { dayRateGbp: v.dayRateGbp },
    })
  refresh()
  return { ok: true, message: "Saved." }
}

export async function deleteProjectRate(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const id = z.uuid().parse(data.get("id"))
  await db.delete(payRate).where(eq(payRate.id, id))
  refresh()
  return { ok: true, message: "Removed." }
}
