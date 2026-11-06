import "server-only"

import { eq, and, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  bankBalance,
  bankHoliday,
  contractorBill,
  contractorPaymentExclusion,
  forecastSnapshot,
  syncRun,
  xeroReportSnapshot,
} from "@/db/schema"
import {
  contractorPayments,
  londonDate,
  matchContractorPayments,
  monthStart,
  openBills,
  runForecast,
  snapshotRows,
} from "@/lib/forecast"
import { loadForecastInput } from "@/lib/forecast-store"
import { getSettings } from "@/lib/settings-store"
import { solidtimeConfigured, syncSolidtime } from "@/lib/solidtime/sync"
import { xeroGet } from "@/lib/xero/client"
import { parseBankSummary } from "@/lib/xero/records"
import type { StepResult } from "@/lib/xero/sync"

type Trigger = "cron" | "manual"

/** Run one step, recording it in sync_run like any Xero resource. */
async function step(
  trigger: Trigger,
  resource: string,
  soft: boolean,
  work: (onCall: () => void) => Promise<number>
): Promise<StepResult> {
  const [run] = await db
    .insert(syncRun)
    .values({ trigger, resource })
    .returning({ id: syncRun.id })
  let calls = 0
  let rows = 0
  let error: string | undefined
  try {
    rows = await work(() => calls++)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  await db
    .update(syncRun)
    .set({
      finishedAt: new Date(),
      rowsChanged: rows,
      apiCalls: calls,
      error: error ?? null,
    })
    .where(eq(syncRun.id, run.id))
  return { resource, rows, calls, complete: !error, error, soft }
}

/** Each bank account's opening balance on the 1st, and its closing balance today. */
async function syncBankSummary(onCall: () => void): Promise<number> {
  const today = londonDate(new Date())
  const fromDate = monthStart(today)
  const body = await xeroGet(
    "Reports/BankSummary",
    { params: { fromDate, toDate: today } },
    onCall
  )
  const rows = parseBankSummary(body)
  await db.transaction(async (tx) => {
    await tx.insert(xeroReportSnapshot).values({
      report: "BankSummary",
      periodStart: fromDate,
      periodEnd: today,
      params: { fromDate, toDate: today },
      raw: body ?? {},
    })
    for (const r of rows)
      await tx
        .insert(bankBalance)
        .values({
          asOf: today,
          accountId: r.accountId,
          source: "xero",
          periodStart: fromDate,
          openingGbp: r.opening,
          closingGbp: r.closing,
        })
        .onConflictDoUpdate({
          target: [bankBalance.asOf, bankBalance.accountId, bankBalance.source],
          set: {
            periodStart: fromDate,
            openingGbp: r.opening,
            closingGbp: r.closing,
          },
        })
  })
  return rows.length
}

const holidaySchema = z.object({
  "england-and-wales": z.object({
    events: z.array(z.object({ date: z.string(), title: z.string() })),
  }),
})

async function syncBankHolidays(onCall: () => void): Promise<number> {
  onCall()
  const res = await fetch("https://www.gov.uk/bank-holidays.json", {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`gov.uk bank holidays failed: ${res.status}`)
  const { "england-and-wales": region } = holidaySchema.parse(await res.json())
  if (region.events.length === 0) return 0
  await db
    .insert(bankHoliday)
    .values(region.events)
    .onConflictDoUpdate({
      target: bankHoliday.date,
      set: { title: sql.raw(`excluded."title"`) },
    })
  return region.events.length
}

/** Link contractor payments to bills. Closing a calculated bill saves it. */
export async function applyContractorMatching(): Promise<number> {
  const settings = await getSettings()
  const today = londonDate(new Date())
  const input = await loadForecastInput(settings, today)
  if (!input) return 0
  const blocked = runForecast(input).blocked
  if (blocked) return 0

  const exclusions = await db
    .select({ id: contractorPaymentExclusion.bankTransactionId })
    .from(contractorPaymentExclusion)
  const { closures } = matchContractorPayments({
    payments: contractorPayments(input.cash).filter(
      (p) => p.date >= input.settings.startDate
    ),
    openBills: openBills(input),
    linkedTransactionIds: new Set(
      input.bills
        .map((b) => b.paidByBankTransactionId)
        .filter((id): id is string => Boolean(id))
    ),
    excludedTransactionIds: new Set(exclusions.map((e) => e.id)),
  })

  for (const { bill, payment, paidSource } of closures) {
    const paid = {
      paidOn: payment.date,
      paidAmountGbp: payment.amount,
      paidByBankTransactionId: payment.bankTransactionId,
      paidSource,
    }
    if (bill.id) {
      await db
        .update(contractorBill)
        .set(paid)
        .where(eq(contractorBill.id, bill.id))
    } else {
      await db
        .insert(contractorBill)
        .values({
          personId: bill.personId,
          issuedOn: bill.issuedOn,
          periodStart: bill.periodStart,
          periodEnd: bill.periodEnd,
          amountGbp: bill.amount,
          dueOn: bill.dueOn,
          ...paid,
        })
        .onConflictDoNothing()
    }
  }
  return closures.length
}

/** Record today's forecast invoice amounts, for the Accuracy section. */
async function writeForecastSnapshot(): Promise<number> {
  const settings = await getSettings()
  const today = londonDate(new Date())
  const input = await loadForecastInput(settings, today)
  if (!input) return 0
  const result = runForecast(input)
  if (result.blocked) return 0
  const rows = snapshotRows(result.invoices, today)
  if (rows.length === 0) return 0
  await db
    .delete(forecastSnapshot)
    .where(and(eq(forecastSnapshot.snapshotDate, today)))
  await db.insert(forecastSnapshot).values(rows)
  return rows.length
}

/**
 * The forecast's part of a sync. Solidtime runs even if Xero failed, since one
 * doesn't depend on the other; the steps that join them need Xero up to date.
 */
export async function runForecastSteps(
  trigger: Trigger,
  { xeroUpToDate }: { xeroUpToDate: boolean }
): Promise<StepResult[]> {
  const steps: StepResult[] = []
  if (xeroUpToDate)
    steps.push(await step(trigger, "bank_summary", false, syncBankSummary))
  if (solidtimeConfigured())
    steps.push(
      await step(trigger, "solidtime", false, async (onCall) => {
        const { rows, calls } = await syncSolidtime()
        for (let i = 0; i < calls; i++) onCall()
        return rows
      })
    )
  // Holidays change rarely and the last copy stays good, so a failure isn't one for the run.
  steps.push(await step(trigger, "bank_holidays", true, syncBankHolidays))
  if (xeroUpToDate) {
    steps.push(
      await step(trigger, "contractor_matching", false, () =>
        applyContractorMatching()
      )
    )
    steps.push(
      await step(trigger, "forecast_snapshot", false, () =>
        writeForecastSnapshot()
      )
    )
  }
  return steps
}
