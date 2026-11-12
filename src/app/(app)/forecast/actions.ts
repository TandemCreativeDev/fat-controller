"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { FormState } from "@/components/action-form"
import { db } from "@/db"
import {
  bankBalance,
  cashAdjustment,
  contractorBill,
  contractorPaymentExclusion,
  customInvoice,
  forecastOverride,
  holdBack,
  invoiceExpectation,
  person,
  runningCostFixed,
  runningCostOneOff,
} from "@/db/schema"
import { addDays, londonDate } from "@/lib/forecast"
import {
  firstError,
  moneyField,
  optionalDate,
  optionalDays,
  optionalMoney,
  optionalText,
  optionalUuid,
  optionalInt,
} from "@/lib/form"
import { requireDirector } from "@/lib/session"

const refresh = () => revalidatePath("/forecast")
const form = (data: FormData) => Object.fromEntries(data)
const saved: FormState = { ok: true, message: "Saved." }

// ------------------------------------------------------------------ running costs

const oneOffForm = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(500),
  oneOff: z.enum(["true", "false"]),
})

/** Mark running costs as one-offs, or back again. They stay in the bank figures. */
export async function saveRunningCostOneOff(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const parsed = oneOffForm.safeParse({
    sourceIds: data.getAll("sourceId"),
    oneOff: data.get("oneOff"),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { sourceIds, oneOff } = parsed.data
  if (oneOff === "true")
    await db
      .insert(runningCostOneOff)
      .values(
        sourceIds.map((sourceId) => ({ sourceId, createdBy: director.id }))
      )
      .onConflictDoNothing()
  else
    await db
      .delete(runningCostOneOff)
      .where(inArray(runningCostOneOff.sourceId, sourceIds))
  refresh()
  return saved
}

const fixedForm = z.object({
  supplierKey: z.string().min(1),
  amountGbp: optionalMoney.refine((v) => !v || Number(v) >= 0, {
    message: "Enter 0 or more",
  }),
})

/** Set what a supplier costs a month. An empty amount goes back to the average. */
export async function saveRunningCostFixed(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const parsed = fixedForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { supplierKey, amountGbp } = parsed.data
  if (amountGbp === null)
    await db
      .delete(runningCostFixed)
      .where(eq(runningCostFixed.supplierKey, supplierKey))
  else
    await db
      .insert(runningCostFixed)
      .values({ supplierKey, amountGbp, createdBy: director.id })
      .onConflictDoUpdate({
        target: runningCostFixed.supplierKey,
        set: { amountGbp, createdBy: director.id },
      })
  refresh()
  return saved
}

// ------------------------------------------------------------------ overrides

const overrideForm = z
  .object({
    projectId: z.uuid(),
    periodEnd: z.iso.date(),
    days: optionalDays,
    amountGbp: optionalMoney,
    maxDays: optionalDays,
    note: optionalText,
  })
  .refine((o) => o.days === null || o.amountGbp === null, {
    message: "Enter either days or an amount, not both",
  })
  .refine((o) => o.days !== null || o.amountGbp !== null || o.maxDays, {
    message: "Enter days, an amount or a cap",
  })

export async function saveOverride(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const parsed = overrideForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { projectId, periodEnd, days, amountGbp, maxDays, note } = parsed.data
  await db
    .insert(forecastOverride)
    .values({
      projectId,
      periodEnd,
      days,
      amountGbp,
      maxDays,
      note,
      createdBy: director.id,
    })
    .onConflictDoUpdate({
      target: [forecastOverride.projectId, forecastOverride.periodEnd],
      set: { days, amountGbp, maxDays, note, createdBy: director.id },
    })
  refresh()
  return saved
}

export async function clearOverride(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const projectId = z.uuid().parse(data.get("projectId"))
  const periodEnd = z.iso.date().parse(data.get("periodEnd"))
  await db
    .delete(forecastOverride)
    .where(
      and(
        eq(forecastOverride.projectId, projectId),
        eq(forecastOverride.periodEnd, periodEnd)
      )
    )
  refresh()
  return { ok: true, message: "Cleared." }
}

// ------------------------------------------------------------------ expected money in

// The Xero invoice ID, `<project id>|<date>` for a forecast invoice, or
// `custom:<id>` for a one-off.
const invoiceKey = z
  .string()
  .regex(/^(custom:)?[0-9a-f-]{36}(\|\d{4}-\d{2}-\d{2})?$/, "Unknown invoice")

const expectationForm = z.object({
  invoiceKey,
  excluded: z.enum(["true", "false"]),
  expectedOn: optionalDate,
  note: optionalText,
})

/** Saves a what-if on an invoice. Back to the defaults, and there's nothing to keep. */
export async function saveExpectation(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const parsed = expectationForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { invoiceKey: key, expectedOn, note } = parsed.data
  const excluded = parsed.data.excluded === "true"
  if (!excluded && !expectedOn && !note) {
    await db
      .delete(invoiceExpectation)
      .where(eq(invoiceExpectation.invoiceKey, key))
  } else {
    await db
      .insert(invoiceExpectation)
      .values({
        invoiceKey: key,
        excluded,
        expectedOn,
        note,
        createdBy: director.id,
      })
      .onConflictDoUpdate({
        target: invoiceExpectation.invoiceKey,
        set: { excluded, expectedOn, note, createdBy: director.id },
      })
  }
  refresh()
  return saved
}

// ------------------------------------------------------------------ one-off invoices

const customForm = z.object({
  id: optionalUuid,
  label: z.string().trim().min(1, "Say what this invoice is for"),
  amountGbp: moneyField.refine((v) => Number(v) > 0, "Enter an amount above 0"),
  contractorCostGbp: z.preprocess((v) => (v === "" ? "0" : v), moneyField),
  landsOn: z.iso.date("Choose when the money lands"),
  note: optionalText,
})

export async function saveCustomInvoice(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const parsed = customForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { id, ...row } = parsed.data
  if (id)
    await db.update(customInvoice).set(row).where(eq(customInvoice.id, id))
  else await db.insert(customInvoice).values({ ...row, createdBy: director.id })
  refresh()
  return saved
}

export async function deleteCustomInvoice(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const id = z.uuid().parse(data.get("id"))
  await db.transaction(async (tx) => {
    await tx.delete(customInvoice).where(eq(customInvoice.id, id))
    await tx
      .delete(invoiceExpectation)
      .where(eq(invoiceExpectation.invoiceKey, `custom:${id}`))
  })
  refresh()
  return { ok: true, message: "Deleted." }
}

// ------------------------------------------------------------------ bills

const billFields = {
  personId: z.uuid(),
  issuedOn: z.iso.date(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  amountGbp: moneyField,
}

/**
 * The stored bill for a person and bill date. A calculated bill isn't stored yet,
 * so acting on one saves it at its current figures, as if it had been entered.
 */
async function ensureBill(v: {
  personId: string
  issuedOn: string
  periodStart: string
  periodEnd: string
  amountGbp: string
}) {
  const [row] = await db
    .select({ terms: person.billTermsDays })
    .from(person)
    .where(eq(person.id, v.personId))
  if (!row) throw new Error("Unknown person")
  const [bill] = await db
    .insert(contractorBill)
    .values({ ...v, dueOn: addDays(v.issuedOn, row.terms) })
    .onConflictDoUpdate({
      target: [contractorBill.personId, contractorBill.issuedOn],
      set: {
        periodStart: v.periodStart,
        periodEnd: v.periodEnd,
        amountGbp: v.amountGbp,
        dueOn: addDays(v.issuedOn, row.terms),
      },
    })
    .returning({ id: contractorBill.id })
  return bill.id
}

const billForm = z
  .object(billFields)
  .refine((b) => b.periodStart <= b.periodEnd, {
    message: "The period can't end before it starts",
  })

/** Entering a bill replaces the forecast one for the same person and bill date. */
export async function saveBill(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const parsed = billForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  await ensureBill(parsed.data)
  refresh()
  return saved
}

const planForm = z.object({
  ...billFields,
  payOrder: optionalInt,
  plannedPayOn: optionalDate,
})

export async function planBill(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const parsed = planForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { payOrder, plannedPayOn, ...bill } = parsed.data
  const id = await ensureBill(bill)
  await db
    .update(contractorBill)
    .set({ payOrder, plannedPayOn })
    .where(eq(contractorBill.id, id))
  refresh()
  return saved
}

const paidForm = z.object({
  ...billFields,
  paidOn: z.iso.date(),
  paidAmountGbp: optionalMoney,
  bankTransactionId: optionalUuid,
})

export async function markBillPaid(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const parsed = paidForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { paidOn, paidAmountGbp, bankTransactionId, ...bill } = parsed.data
  const id = await ensureBill(bill)
  await db
    .update(contractorBill)
    .set({
      paidOn,
      paidAmountGbp: paidAmountGbp ?? bill.amountGbp,
      paidByBankTransactionId: bankTransactionId,
      paidSource: "manual",
    })
    .where(eq(contractorBill.id, id))
  refresh()
  return saved
}

/** Clear a bill's payment, and stop the next sync linking that payment again. */
export async function unmatchBill(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const id = z.uuid().parse(data.get("id"))
  await db.transaction(async (tx) => {
    const [bill] = await tx
      .select()
      .from(contractorBill)
      .where(eq(contractorBill.id, id))
    if (!bill) return
    if (bill.paidByBankTransactionId)
      await tx
        .insert(contractorPaymentExclusion)
        .values({
          bankTransactionId: bill.paidByBankTransactionId,
          personId: bill.personId,
          createdBy: director.id,
        })
        .onConflictDoNothing()
    await tx
      .update(contractorBill)
      .set({
        paidOn: null,
        paidAmountGbp: null,
        paidByBankTransactionId: null,
        paidSource: null,
      })
      .where(eq(contractorBill.id, id))
  })
  refresh()
  return { ok: true, message: "Unmatched." }
}

/** Remove an entered bill; the forecast one comes back in its place. */
export async function deleteBill(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const id = z.uuid().parse(data.get("id"))
  await db.delete(contractorBill).where(eq(contractorBill.id, id))
  refresh()
  return { ok: true, message: "Deleted." }
}

// ------------------------------------------------------------------ adjustments

const adjustmentForm = z.object({
  id: optionalUuid,
  date: z.iso.date(),
  label: z.string().trim().min(1, "Give the adjustment a label"),
  amountGbp: moneyField,
  note: optionalText,
})

export async function saveAdjustment(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const parsed = adjustmentForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { id, ...row } = parsed.data
  if (id)
    await db.update(cashAdjustment).set(row).where(eq(cashAdjustment.id, id))
  else await db.insert(cashAdjustment).values(row)
  refresh()
  return saved
}

export async function deleteAdjustment(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const id = z.uuid().parse(data.get("id"))
  await db.delete(cashAdjustment).where(eq(cashAdjustment.id, id))
  refresh()
  return { ok: true, message: "Deleted." }
}

// ------------------------------------------------------------------ hold-backs

const holdBackForm = z.object({
  month: z.iso.date(),
  amountGbp: moneyField,
  note: optionalText,
})

export async function saveHoldBack(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const parsed = holdBackForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { month, amountGbp, note } = parsed.data
  await db
    .insert(holdBack)
    .values({ month, amountGbp, note, createdBy: director.id })
    .onConflictDoUpdate({
      target: holdBack.month,
      set: { amountGbp, note, createdBy: director.id },
    })
  refresh()
  return saved
}

export async function clearHoldBack(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const month = z.iso.date().parse(data.get("month"))
  await db.delete(holdBack).where(eq(holdBack.month, month))
  refresh()
  return { ok: true, message: "Back to the suggestion." }
}

// ------------------------------------------------------------------ bank balance

const balanceForm = z.object({
  accountId: z.uuid(),
  closingGbp: moneyField,
})

export async function saveManualBalance(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  await requireDirector()
  const parsed = balanceForm.safeParse(form(data))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { accountId, closingGbp } = parsed.data
  await db
    .insert(bankBalance)
    .values({
      asOf: londonDate(new Date()),
      accountId,
      source: "manual",
      closingGbp,
    })
    .onConflictDoUpdate({
      target: [bankBalance.asOf, bankBalance.accountId, bankBalance.source],
      set: { closingGbp },
    })
  refresh()
  return saved
}

export async function clearManualBalance(): Promise<FormState> {
  await requireDirector()
  await db
    .delete(bankBalance)
    .where(
      and(
        eq(bankBalance.source, "manual"),
        eq(bankBalance.asOf, londonDate(new Date()))
      )
    )
  refresh()
  return { ok: true, message: "Cleared." }
}
