import "server-only"

import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm"

import { db } from "@/db"
import {
  accountGroup,
  bankBalance,
  bankHoliday,
  cashAdjustment,
  contractorBill,
  customInvoice,
  forecastOverride,
  forecastSnapshot,
  holdBack,
  invoiceExpectation,
  payRate,
  person,
  project,
  projectSolidtime,
  runningCostOneOff,
  solidtimeMember,
  solidtimeProject,
  solidtimeTimeEntry,
  syncCursor,
  vForecastSalesInvoice,
  xeroAccount,
  xeroBankTransaction,
  xeroBankTransfer,
  xeroContact,
  xeroInvoice,
  xeroInvoiceLine,
  xeroOrganisation,
  xeroPayment,
} from "@/db/schema"
import {
  accuracyRows,
  addDays,
  addMonths,
  bankTransactionCashLines,
  classifyCashLine,
  londonDate,
  monthStart,
  paymentCashLine,
  runningCostsToCheck,
  runForecast,
  type AccuracyRow,
  type CashLine,
  type ForecastInput,
  type ForecastResult,
  type ForecastSettings,
  type StoredBill,
} from "@/lib/forecast"
import type { ForecastPackInput } from "@/lib/forecast-pack"
import { getSettings } from "@/lib/settings-store"
import type { Settings } from "@/lib/settings"
import { solidtimeConfigured } from "@/lib/solidtime/sync"

type Role = "operating" | "tax_reserve"

const rolesOf = (settings: Settings) =>
  settings.bank_account_roles as Record<string, Role>

const accountsWith = (settings: Settings, role: Role) =>
  Object.entries(rolesOf(settings))
    .filter(([, r]) => r === role)
    .map(([id]) => id)

// ------------------------------------------------------------------ bank lines

type RawLineItem = {
  AccountID?: string
  AccountCode?: string
  LineAmount?: number
  TaxAmount?: number
  Description?: string
}

/**
 * Every bank line on the operating account(s) since `since`, classified. Payments
 * and bank transactions together are the whole account; a batch's payments are
 * read one by one, so its total can't be counted as well.
 */
export async function loadCashLines(
  settings: Settings,
  since: string
): Promise<CashLine[]> {
  const operating = accountsWith(settings, "operating")
  if (operating.length === 0) return []
  const roles = rolesOf(settings)

  const [accounts, groups, people, payments, transactions, transfers] =
    await Promise.all([
      db
        .select({
          id: xeroAccount.accountId,
          code: xeroAccount.code,
          cls: xeroAccount.class,
        })
        .from(xeroAccount),
      db
        .select({ id: accountGroup.accountId, group: accountGroup.group })
        .from(accountGroup),
      db
        .select({
          id: person.id,
          kind: person.kind,
          contact: person.xeroContactId,
        })
        .from(person),
      db
        .select({
          id: xeroPayment.paymentId,
          type: xeroPayment.paymentType,
          date: xeroPayment.date,
          amount: xeroPayment.amount,
          invoiceId: xeroPayment.invoiceId,
          raw: xeroPayment.raw,
        })
        .from(xeroPayment)
        .where(
          and(
            inArray(xeroPayment.bankAccountId, operating),
            eq(xeroPayment.status, "AUTHORISED"),
            gte(xeroPayment.date, since)
          )
        ),
      db
        .select()
        .from(xeroBankTransaction)
        .where(
          and(
            inArray(xeroBankTransaction.bankAccountId, operating),
            eq(xeroBankTransaction.status, "AUTHORISED"),
            gte(xeroBankTransaction.date, since)
          )
        ),
      db.select().from(xeroBankTransfer),
    ])

  const groupOf = new Map(groups.map((g) => [g.id, g.group as string]))
  const classOf = new Map(accounts.map((a) => [a.id, a.cls]))
  const idByCode = new Map(
    accounts.filter((a) => a.code).map((a) => [a.code!, a.id])
  )
  const ctx = {
    people: people.map((p) => ({ id: p.id, kind: p.kind })),
    contactToPerson: new Map(
      people.filter((p) => p.contact).map((p) => [p.contact!, p.id])
    ),
    vatLiabilityAccountId: settings.vat_liability_account_id,
  }
  const accountInfo = (id: string | null) => ({
    accountId: id,
    accountGroup: id ? (groupOf.get(id) ?? null) : null,
    accountClass: id ? (classOf.get(id) ?? null) : null,
  })

  // -------- the invoice behind each payment
  const invoiceIds = [
    ...new Set(payments.map((p) => p.invoiceId).filter(Boolean)),
  ] as string[]
  const invoices = invoiceIds.length
    ? await db
        .select({
          id: xeroInvoice.invoiceId,
          type: xeroInvoice.type,
          contact: xeroInvoice.contactId,
          number: xeroInvoice.invoiceNumber,
        })
        .from(xeroInvoice)
        .where(inArray(xeroInvoice.invoiceId, invoiceIds))
    : []
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const lines = invoiceIds.length
    ? await db
        .select({
          invoice: xeroInvoiceLine.invoiceId,
          code: xeroInvoiceLine.accountCode,
        })
        .from(xeroInvoiceLine)
        .where(inArray(xeroInvoiceLine.invoiceId, invoiceIds))
    : []
  const firstLineAccount = new Map<string, string>()
  for (const l of lines)
    if (l.code && idByCode.has(l.code) && !firstLineAccount.has(l.invoice))
      firstLineAccount.set(l.invoice, idByCode.get(l.code)!)

  const out: CashLine[] = []
  for (const p of payments) {
    if (!p.date || p.amount === null) continue
    const inv = p.invoiceId ? invoiceById.get(p.invoiceId) : undefined
    const raw = p.raw as { BankAmount?: number }
    out.push(
      classifyCashLine(
        paymentCashLine({
          paymentId: p.id,
          paymentType: p.type,
          date: p.date,
          amount: String(raw.BankAmount ?? p.amount),
          contactId: inv?.contact ?? null,
          salesInvoiceId: inv?.type === "ACCREC" ? inv.id : null,
          ...accountInfo(
            p.invoiceId ? (firstLineAccount.get(p.invoiceId) ?? null) : null
          ),
          description: inv?.number ?? null,
        }),
        ctx
      )
    )
  }

  // -------- bank transactions, with the other side of any transfer
  const deletedTransactions = new Set<string>()
  const otherAccount = new Map<string, string | null>()
  for (const t of transfers) {
    if (t.status === "DELETED") {
      if (t.fromBankTransactionId)
        deletedTransactions.add(t.fromBankTransactionId)
      if (t.toBankTransactionId) deletedTransactions.add(t.toBankTransactionId)
      continue
    }
    if (t.fromBankTransactionId)
      otherAccount.set(t.fromBankTransactionId, t.toAccountId)
    if (t.toBankTransactionId)
      otherAccount.set(t.toBankTransactionId, t.fromAccountId)
  }
  for (const tx of transactions) {
    if (!tx.date || tx.total === null) continue
    if (deletedTransactions.has(tx.bankTransactionId)) continue
    const raw = tx.raw as {
      LineItems?: RawLineItem[]
      LineAmountTypes?: string
    }
    const isTransfer = tx.type.endsWith("-TRANSFER")
    const other = otherAccount.get(tx.bankTransactionId) ?? null
    for (const line of bankTransactionCashLines({
      bankTransactionId: tx.bankTransactionId,
      type: tx.type,
      date: tx.date,
      total: tx.total,
      contactId: tx.contactId,
      reference: tx.reference,
      transferOtherRole: isTransfer && other ? (roles[other] ?? null) : null,
      lineAmountTypes: raw.LineAmountTypes ?? null,
      lines: isTransfer
        ? []
        : (raw.LineItems ?? []).map((l) => ({
            ...accountInfo(
              l.AccountID ??
                (l.AccountCode ? (idByCode.get(l.AccountCode) ?? null) : null)
            ),
            lineAmount: String(l.LineAmount ?? 0),
            taxAmount: String(l.TaxAmount ?? 0),
            description: l.Description ?? null,
          })),
    }))
      out.push(classifyCashLine(line, ctx))
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ------------------------------------------------------------------ the input

export type ForecastSetup = {
  startDateSet: boolean
  operatingAccountSet: boolean
  solidtimeConfigured: boolean
}

export async function loadForecastInput(
  settings: Settings,
  today: string
): Promise<ForecastInput | null> {
  const startDate = settings.forecast_start_date
  if (!startDate || accountsWith(settings, "operating").length === 0)
    return null

  const threeMonthsBack = addMonths(monthStart(today), -3)
  const since = startDate < threeMonthsBack ? startDate : threeMonthsBack

  const [
    projects,
    projectMaps,
    people,
    payRates,
    entries,
    invoices,
    overrides,
    cash,
    bills,
    adjustments,
    holdBacks,
    expectations,
    customInvoices,
    contacts,
    oneOffCosts,
    holidays,
    balances,
    cursor,
  ] = await Promise.all([
    db.select().from(project),
    db.select().from(projectSolidtime),
    db.select().from(person),
    db.select().from(payRate),
    db
      .select({
        id: solidtimeTimeEntry.id,
        userId: solidtimeTimeEntry.userId,
        projectId: solidtimeTimeEntry.projectId,
        start: solidtimeTimeEntry.start,
        end: solidtimeTimeEntry.end,
        seconds: solidtimeTimeEntry.durationSeconds,
        billable: solidtimeTimeEntry.billable,
      })
      .from(solidtimeTimeEntry),
    db.select().from(vForecastSalesInvoice),
    db.select().from(forecastOverride),
    loadCashLines(settings, since),
    db.select().from(contractorBill),
    db.select().from(cashAdjustment),
    db.select().from(holdBack),
    db.select().from(invoiceExpectation),
    db.select().from(customInvoice),
    db
      .select({ id: xeroContact.contactId, name: xeroContact.name })
      .from(xeroContact),
    db.select({ id: runningCostOneOff.sourceId }).from(runningCostOneOff),
    db.select({ date: bankHoliday.date }).from(bankHoliday),
    db.select().from(bankBalance).orderBy(desc(bankBalance.asOf)),
    db
      .select({ at: syncCursor.lastCompletedAt })
      .from(syncCursor)
      .where(
        and(
          eq(syncCursor.resource, "invoices"),
          isNotNull(syncCursor.lastCompletedAt)
        )
      ),
  ])

  const roles = rolesOf(settings)
  const xeroBalances = balances.filter(
    (b) => b.source === "xero" && b.periodStart === monthStart(today)
  )
  const latest = xeroBalances[0]?.asOf
  const latestRows = xeroBalances.filter((b) => b.asOf === latest)
  const operatingRows = latestRows.filter(
    (b) => roles[b.accountId] === "operating"
  )
  const reserve = balances.filter(
    (b) => b.source === "xero" && roles[b.accountId] === "tax_reserve"
  )
  const reserveLatest = reserve[0]?.asOf
  const addUp = (values: (string | null)[]) =>
    values.reduce((t, v) => t + Math.round(Number(v ?? 0) * 100), 0) / 100
  const manual = balances.find((b) => b.source === "manual" && b.asOf === today)

  const stored: StoredBill[] = bills.map((b) => ({
    id: b.id,
    personId: b.personId,
    issuedOn: b.issuedOn,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    amountGbp: b.amountGbp,
    dueOn: b.dueOn,
    payOrder: b.payOrder,
    plannedPayOn: b.plannedPayOn,
    paidOn: b.paidOn,
    paidAmountGbp: b.paidAmountGbp,
    paidByBankTransactionId: b.paidByBankTransactionId,
    paidSource: b.paidSource,
  }))

  return {
    today,
    settings: {
      ctSetAsideRate: settings.ct_set_aside_rate,
      hoursPerDay: settings.hours_per_day,
      invoiceDayRounding: settings.invoice_day_rounding,
      lookbackDays: settings.forecast_lookback_days,
      months: settings.forecast_months,
      bufferGbp: settings.operating_buffer_gbp,
      directorSalaryGbp: settings.director_monthly_salary_gbp,
      startDate,
      vatRegisteredFrom: settings.vat_registered_from,
      vatRate: settings.vat_rate,
    },
    holidays: holidays.map((h) => h.date),
    lastXeroSync: cursor[0]?.at ? londonDate(cursor[0].at) : null,
    projects: projects.map((p) => ({
      ...p,
      solidtimeProjectIds: projectMaps
        .filter((m) => m.projectId === p.id)
        .map((m) => m.solidtimeProjectId),
    })),
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      solidtimeUserId: p.solidtimeUserId,
      billTermsDays: p.billTermsDays,
      billCutoffDays: p.billCutoffDays,
    })),
    payRates: payRates.map((r) => ({
      personId: r.personId,
      projectId: r.projectId,
      dayRateGbp: r.dayRateGbp,
    })),
    entries: entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      date: londonDate(e.start),
      seconds: e.seconds,
      billable: e.billable,
      running: e.end === null,
    })),
    invoices: invoices.map((i) => ({
      invoiceId: i.invoiceId,
      contactId: i.contactId,
      invoiceNumber: i.invoiceNumber,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      subTotal: i.subTotal,
      totalTax: i.totalTax,
      total: i.total,
      outstanding: i.outstandingGbp,
    })),
    overrides: overrides.map((o) => ({
      projectId: o.projectId,
      periodEnd: o.periodEnd,
      days: o.days,
      amountGbp: o.amountGbp,
      note: o.note,
    })),
    cash,
    bills: stored,
    adjustments: adjustments.map((a) => ({
      date: a.date,
      label: a.label,
      amountGbp: a.amountGbp,
    })),
    holdBacks: holdBacks.map((h) => ({
      month: h.month,
      amountGbp: h.amountGbp,
    })),
    balance:
      operatingRows.length > 0
        ? {
            opening: addUp(operatingRows.map((b) => b.openingGbp)).toFixed(2),
            closing: addUp(operatingRows.map((b) => b.closingGbp)).toFixed(2),
          }
        : null,
    manualBalance: manual?.closingGbp ?? null,
    contacts,
    oneOffCosts: oneOffCosts.map((o) => o.id),
    customInvoices: customInvoices.map((c) => ({
      id: c.id,
      label: c.label,
      amountGbp: c.amountGbp,
      contractorCostGbp: c.contractorCostGbp,
      landsOn: c.landsOn,
      note: c.note,
    })),
    expectations: expectations.map((e) => ({
      invoiceKey: e.invoiceKey,
      excluded: e.excluded,
      expectedOn: e.expectedOn,
      note: e.note,
    })),
    taxReserveBalance:
      reserveLatest !== undefined
        ? addUp(
            reserve
              .filter((b) => b.asOf === reserveLatest)
              .map((b) => b.closingGbp)
          ).toFixed(2)
        : null,
  }
}

// ------------------------------------------------------------------ the page

export type PageWarning = { kind: string; message: string }

export type ForecastPageData = {
  setup: ForecastSetup
  result: ForecastResult | null
  warnings: PageWarning[]
  accuracy: AccuracyRow[]
  settings: ForecastSettings | null
  manualBalance: string | null
  xeroClosing: string | null
  operatingAccountId: string | null
  people: { id: string; name: string; billTermsDays: number; kind: string }[]
  adjustments: {
    id: string
    date: string
    label: string
    amountGbp: string
    note: string | null
  }[]
  unlinkedPayments: {
    bankTransactionId: string
    personId: string
    date: string
    amount: string
  }[]
}

/** The Solidtime token's expiry date, and whether it's within the 30-day warning. */
export function solidtimeTokenStatus(settings: Settings) {
  const expires = settings.solidtime_token_expires_at
  if (!expires) return { tokenExpires: null, expiringSoon: false }
  const tokenExpires = londonDate(new Date(expires))
  const soon = addDays(londonDate(new Date()), 30)
  return { tokenExpires, expiringSoon: tokenExpires <= soon }
}

/** Warnings the engine can't see: they come from the setup, not the figures. */
export async function setupWarnings(
  settings: Settings,
  today: string
): Promise<PageWarning[]> {
  const warnings: PageWarning[] = []
  const expires = settings.solidtime_token_expires_at
  if (expires) {
    const soon = addDays(today, 30)
    const expiresOn = londonDate(new Date(expires))
    if (expiresOn <= soon)
      warnings.push({
        kind: "token_expiry",
        message:
          expiresOn < today
            ? `The Solidtime token expired on ${expiresOn}. Create a new one.`
            : `The Solidtime token expires on ${expiresOn}. Create a new one before then.`,
      })
  }

  const unmapped = await unmappedSolidtime()
  for (const p of unmapped.projects)
    warnings.push({
      kind: "unmapped_project",
      message: `Solidtime project not mapped: ${p.name}. Its time still counts for contractors, at their default rate.`,
    })
  for (const m of unmapped.members)
    warnings.push({
      kind: "unmapped_member",
      message: `Solidtime member not mapped: ${m.name}.`,
    })
  return warnings
}

/** Solidtime projects and members with tracked time that nothing points at yet. */
export async function unmappedSolidtime() {
  const [projects, members, mappedProjects, mappedPeople, entries] =
    await Promise.all([
      db.select().from(solidtimeProject),
      db.select().from(solidtimeMember),
      db
        .select({ id: projectSolidtime.solidtimeProjectId })
        .from(projectSolidtime),
      db
        .select({ id: person.solidtimeUserId })
        .from(person)
        .where(isNotNull(person.solidtimeUserId)),
      db
        .selectDistinct({
          projectId: solidtimeTimeEntry.projectId,
          userId: solidtimeTimeEntry.userId,
        })
        .from(solidtimeTimeEntry),
    ])
  const mappedP = new Set(mappedProjects.map((p) => p.id))
  const mappedM = new Set(mappedPeople.map((p) => p.id))
  const tracked = new Set(entries.map((e) => e.projectId))
  const trackedBy = new Set(entries.map((e) => e.userId))
  return {
    projects: projects.filter((p) => !mappedP.has(p.id) && tracked.has(p.id)),
    members: members.filter(
      (m) => !mappedM.has(m.userId) && trackedBy.has(m.userId)
    ),
  }
}

export async function getForecastPage(): Promise<ForecastPageData> {
  const settings = await getSettings()
  const today = londonDate(new Date())
  const setup: ForecastSetup = {
    startDateSet: Boolean(settings.forecast_start_date),
    operatingAccountSet: accountsWith(settings, "operating").length > 0,
    solidtimeConfigured: solidtimeConfigured(),
  }
  const [input, warnings, people, adjustments, snapshots] = await Promise.all([
    loadForecastInput(settings, today),
    setupWarnings(settings, today),
    db
      .select({
        id: person.id,
        name: person.name,
        billTermsDays: person.billTermsDays,
        kind: person.kind,
      })
      .from(person),
    db.select().from(cashAdjustment),
    db.select().from(forecastSnapshot),
  ])

  const result = input ? runForecast(input) : null
  const accuracy =
    result && !result.blocked ? accuracyRows(result.invoices, snapshots) : []

  const linked = new Set(
    (input?.bills ?? []).map((b) => b.paidByBankTransactionId).filter(Boolean)
  )
  const byTransaction = new Map<
    string,
    {
      bankTransactionId: string
      personId: string
      date: string
      amount: number
    }
  >()
  for (const l of input?.cash ?? []) {
    if (l.kind !== "contractor_payment" || !l.personId) continue
    if (linked.has(l.sourceId)) continue
    const hit = byTransaction.get(l.sourceId)
    if (hit) hit.amount += Number(l.amount)
    else
      byTransaction.set(l.sourceId, {
        bankTransactionId: l.sourceId,
        personId: l.personId,
        date: l.date,
        amount: Number(l.amount),
      })
  }

  return {
    setup,
    result,
    warnings: [
      ...(result && !result.blocked ? result.warnings : []),
      ...warnings,
    ],
    accuracy,
    settings: input?.settings ?? null,
    manualBalance: input?.manualBalance ?? null,
    xeroClosing: input?.balance?.closing ?? null,
    operatingAccountId: accountsWith(settings, "operating")[0] ?? null,
    people,
    adjustments,
    unlinkedPayments: [...byTransaction.values()]
      .map((p) => ({ ...p, amount: p.amount.toFixed(2) }))
      .reverse(),
  }
}

/** Everything the Markdown export needs; null until the forecast can run. */
export async function getForecastPackInput(): Promise<ForecastPackInput | null> {
  const page = await getForecastPage()
  if (!page.result || page.result.blocked || !page.settings) return null
  const [org, cursors, projects, maps, stProjects, people, rates] =
    await Promise.all([
      db.select({ name: xeroOrganisation.name }).from(xeroOrganisation),
      db
        .select({ at: syncCursor.lastCompletedAt })
        .from(syncCursor)
        .where(eq(syncCursor.resource, "bank_transactions")),
      db.select().from(project).orderBy(asc(project.code), asc(project.name)),
      db.select().from(projectSolidtime),
      db.select().from(solidtimeProject),
      db.select().from(person).orderBy(asc(person.name)),
      db.select().from(payRate),
    ])
  const stName = new Map(stProjects.map((p) => [p.id, p.name]))
  return {
    company: org[0]?.name ?? "Company",
    generatedAt: new Date(),
    asOf: cursors[0]?.at ?? null,
    settings: page.settings,
    result: page.result,
    warnings: page.warnings,
    accuracy: page.accuracy,
    xeroClosing: page.xeroClosing,
    manualBalance: page.manualBalance,
    projects: projects.map((p) => ({
      code: p.code,
      name: p.name,
      kind: p.kind,
      endDate: p.endDate,
      chargeRate: p.chargeRateGbp,
      intervalDays: p.invoiceIntervalDays,
      termsDays: p.paymentTermsDays,
      active: p.active,
      solidtimeProjects: maps
        .filter((m) => m.projectId === p.id)
        .map((m) => stName.get(m.solidtimeProjectId) ?? "Unknown"),
    })),
    people: people.map((p) => ({
      name: p.name,
      kind: p.kind,
      defaultRate:
        rates.find((r) => r.personId === p.id && r.projectId === null)
          ?.dayRateGbp ?? null,
      termsDays: p.billTermsDays,
      cutoffDays: p.billCutoffDays,
    })),
    adjustments: page.adjustments.map((a) => ({
      date: a.date,
      label: a.label,
      amount: a.amountGbp,
      note: a.note,
    })),
  }
}

// ------------------------------------------------------------------ F0

export type UncountedLine = {
  date: string
  contact: string
  amount: string
  account: string
}

/**
 * Operating-account spend in the last 12 months coded to an `exclude` account, so
 * missing from the P&L. Transfers and dividends to a director belong there.
 */
export async function uncountedSpend(
  settings: Settings,
  today: string
): Promise<UncountedLine[]> {
  const since = addDays(today, -365)
  const lines = await loadCashLines(settings, since)
  const toCheck = runningCostsToCheck(lines).filter(
    (l) => l.direction === "out" && l.accountGroup === "exclude"
  )
  const contractorsOrDirectors = lines.filter(
    (l) =>
      l.direction === "out" &&
      l.accountGroup === "exclude" &&
      (l.kind === "contractor_payment" ||
        l.kind === "director_salary" ||
        l.kind === "vat_payment")
  )
  const chosen = [...toCheck, ...contractorsOrDirectors]
  if (chosen.length === 0) return []
  const contactIds = [
    ...new Set(chosen.map((l) => l.contactId).filter(Boolean)),
  ] as string[]
  const [contacts, accounts] = await Promise.all([
    contactIds.length
      ? db
          .select({ id: xeroContact.contactId, name: xeroContact.name })
          .from(xeroContact)
          .where(inArray(xeroContact.contactId, contactIds))
      : [],
    db
      .select({ id: xeroAccount.accountId, name: xeroAccount.name })
      .from(xeroAccount),
  ])
  const contactName = new Map(contacts.map((c) => [c.id, c.name]))
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  return chosen
    .map((l) => ({
      date: l.date,
      contact: (l.contactId && contactName.get(l.contactId)) || "No contact",
      amount: l.amount,
      account: (l.accountId && accountName.get(l.accountId)) || "No account",
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}
