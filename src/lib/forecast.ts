import Decimal from "decimal.js"

/**
 * The forecast engine: pure functions, no I/O. Stores in forecast-store.ts load
 * the inputs. Money crosses this boundary as strings with two decimal places;
 * all arithmetic inside uses decimal.js with half-up rounding, never floats.
 *
 * Dates are London "YYYY-MM-DD" strings, which compare correctly as strings.
 */

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
type Dec = InstanceType<typeof D>
const ZERO = new D(0)

const penny = (d: Decimal.Value) => new D(d).toDecimalPlaces(2)
const money = (d: Decimal.Value) => new D(d).toFixed(2)
const sum = (xs: Dec[]) => xs.reduce((t, x) => t.plus(x), ZERO)

// ------------------------------------------------------------------ dates

const toUtc = (d: string) => {
  const [y, m, day] = d.split("-").map(Number)
  return Date.UTC(y, m - 1, day)
}
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDays = (d: string, n: number) =>
  fromUtc(toUtc(d) + n * 86_400_000)

/** First day of the month containing `d`. */
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`

export function addMonths(d: string, n: number): string {
  const [y, m] = d.split("-").map(Number)
  return fromUtc(Date.UTC(y, m - 1 + n, 1))
}

export const monthEnd = (d: string) => addDays(addMonths(d, 1), -1)
const daysInMonth = (d: string) => Number(monthEnd(d).slice(8))
const weekday = (d: string) => new Date(toUtc(d)).getUTCDay()

/** The last Friday of the month containing `d`. */
export function lastFriday(d: string): string {
  const end = monthEnd(d)
  return addDays(end, -((weekday(end) - 5 + 7) % 7))
}

/** The London calendar date of an instant, including during British Summer Time. */
export function londonDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant)
}

export function isWorkingDay(d: string, holidays: Set<string>): boolean {
  const w = weekday(d)
  return w !== 0 && w !== 6 && !holidays.has(d)
}

export function workingDaysBetween(
  from: string,
  to: string,
  holidays: Set<string>
): number {
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1))
    if (isWorkingDay(d, holidays)) n++
  return n
}

export function lastWorkingDay(d: string, holidays: Set<string>): string {
  let day = monthEnd(d)
  while (!isWorkingDay(day, holidays)) day = addDays(day, -1)
  return day
}

function addWorkingDays(d: string, n: number, holidays: Set<string>): string {
  let day = d
  for (let left = n; left > 0;) {
    day = addDays(day, 1)
    if (isWorkingDay(day, holidays)) left--
  }
  return day
}

/** Cycle dates (anchor + n × interval) plus extras, minus skips, inside the range. */
export function invoiceDates(
  p: {
    invoiceAnchorDate: string | null
    invoiceIntervalDays: number
    extraInvoiceDates: string[]
    skippedInvoiceDates: string[]
  },
  from: string,
  to: string
): string[] {
  const dates = new Set<string>()
  if (p.invoiceAnchorDate && p.invoiceIntervalDays > 0) {
    const gap = Math.ceil(
      (toUtc(from) - toUtc(p.invoiceAnchorDate)) /
        (p.invoiceIntervalDays * 86_400_000)
    )
    for (
      let d = addDays(p.invoiceAnchorDate, gap * p.invoiceIntervalDays);
      d <= to;
      d = addDays(d, p.invoiceIntervalDays)
    )
      dates.add(d)
  }
  for (const d of p.extraInvoiceDates) if (d >= from && d <= to) dates.add(d)
  for (const d of p.skippedInvoiceDates) dates.delete(d)
  return [...dates].sort()
}

// ------------------------------------------------------------------ inputs

export type ForecastSettings = {
  ctSetAsideRate: number | string
  hoursPerDay: number | string
  invoiceDayRounding: number | string
  lookbackDays: number
  months: number
  bufferGbp: number | string
  /** Each director's monthly salary. Only the In and out view uses this. */
  directorSalaryGbp: number | string
  startDate: string
  vatRegisteredFrom: string | null
  vatRate: number | string
}

export type ProjectInput = {
  id: string
  kind: "client" | "internal"
  code: string | null
  name: string
  solidtimeProjectIds: string[]
  chargeRateGbp: string | null
  invoiceAnchorDate: string | null
  invoiceIntervalDays: number
  extraInvoiceDates: string[]
  skippedInvoiceDates: string[]
  paymentTermsDays: number
  active: boolean
  xeroContactId?: string | null
  /** No work is forecast after this date. */
  endDate?: string | null
}

export type PersonInput = {
  id: string
  name: string
  kind: "director" | "contractor"
  solidtimeUserId: string | null
  billTermsDays: number
  /** A bill covers work up to this many days before its date. */
  billCutoffDays: number
}

export type PayRateInput = {
  personId: string
  projectId: string | null
  dayRateGbp: string
}

export type TimeEntryInput = {
  id: string
  userId: string
  /** The Solidtime project ID, if any. */
  projectId: string | null
  /** London date of the entry's start. */
  date: string
  seconds: number
  billable: boolean
  /** A running timer has no end time. */
  running: boolean
}

export type SalesInvoiceInput = {
  invoiceId: string
  contactId?: string | null
  invoiceNumber: string | null
  invoiceDate: string
  dueDate: string | null
  subTotal: string
  totalTax: string
  total: string
  outstanding: string
}

export type CustomInvoiceInput = {
  id: string
  label: string
  amountGbp: string
  contractorCostGbp: string
  landsOn: string
  note: string | null
}

export type InvoiceExpectationInput = {
  invoiceKey: string
  excluded: boolean
  expectedOn: string | null
  note?: string | null
}

export type OverrideInput = {
  projectId: string
  periodEnd: string
  days: string | null
  amountGbp: string | null
  note?: string | null
}

export type StoredBill = {
  id: string
  personId: string
  issuedOn: string
  periodStart: string
  periodEnd: string
  amountGbp: string
  dueOn: string
  payOrder: number | null
  plannedPayOn: string | null
  paidOn: string | null
  paidAmountGbp: string | null
  paidByBankTransactionId: string | null
  paidSource: "auto" | "unmatched" | "manual" | null
}

/** One bank movement on the operating account (or one line of it), before classifying. */
export type RawCashLine = {
  /** The Xero bank transaction or payment ID. */
  sourceId: string
  source: "payment" | "bank_transaction"
  direction: "in" | "out"
  date: string
  amount: string
  transactionType: string | null
  contactId: string | null
  accountId: string | null
  accountGroup: string | null
  accountClass: string | null
  /** For a payment: its invoice, if it's a sales invoice. */
  salesInvoiceId: string | null
  /** For a transfer: the role of the account on the other side, if known. */
  transferOtherRole: "operating" | "tax_reserve" | null
  description: string | null
}

export type CashKind =
  | "client_payment"
  | "backstop_in"
  | "other_transfer_in"
  | "other_in"
  | "set_aside"
  | "other_transfer_out"
  | "vat_payment"
  | "contractor_payment"
  | "director_salary"
  | "dividend"
  | "running_cost"

export type CashLine = RawCashLine & { kind: CashKind; personId: string | null }

// ------------------------------------------------------------------ classifying

/** Sort one bank line into its kind, using the rules in the spec, in their order. */
export function classifyCashLine(
  line: RawCashLine,
  ctx: {
    people: Pick<PersonInput, "id" | "kind">[]
    contactToPerson: Map<string, string>
    vatLiabilityAccountId: string | null
  }
): CashLine {
  const personId = line.contactId
    ? (ctx.contactToPerson.get(line.contactId) ?? null)
    : null
  const person = ctx.people.find((p) => p.id === personId)
  const done = (kind: CashKind): CashLine => ({ ...line, kind, personId })

  if (line.direction === "in") {
    if (line.salesInvoiceId) return done("client_payment")
    if (line.transactionType === "RECEIVE-TRANSFER")
      return done(
        line.transferOtherRole === "tax_reserve"
          ? "backstop_in"
          : "other_transfer_in"
      )
    return done("other_in")
  }

  if (line.transactionType === "SPEND-TRANSFER")
    return done(
      line.transferOtherRole === "tax_reserve"
        ? "set_aside"
        : "other_transfer_out"
    )
  if (ctx.vatLiabilityAccountId && line.accountId === ctx.vatLiabilityAccountId)
    return done("vat_payment")
  if (person?.kind === "contractor" && line.accountGroup === "people")
    return done("contractor_payment")
  if (person?.kind === "director" && line.accountGroup === "people")
    return done("director_salary")
  if (person?.kind === "director" && line.accountClass === "EQUITY")
    return done("dividend")
  return done("running_cost")
}

/** Rule 7 lines on accounts with no group, or grouped `exclude`, need a second look. */
export function runningCostsToCheck(lines: CashLine[]): CashLine[] {
  return lines.filter(
    (l) =>
      l.kind === "running_cost" &&
      (l.accountGroup === null || l.accountGroup === "exclude")
  )
}

// ------------------------------------------------------------------ bank lines

const money2 = (n: Decimal.Value) => new D(n).toFixed(2)

/** Payments that send money out of the bank; every other type brings it in. */
const OUTGOING_PAYMENTS = new Set([
  "ACCPAYPAYMENT",
  "ARCREDITPAYMENT",
  "AROVERPAYMENTPAYMENT",
  "ARPREPAYMENTPAYMENT",
])

/**
 * One Xero Payment as a bank line. A payment in a batch stands on its own: the
 * batch total is never added, so a batch counts once.
 */
export function paymentCashLine(p: {
  paymentId: string
  paymentType: string | null
  date: string
  /** BankAmount where Xero sends it, otherwise Amount. */
  amount: string
  contactId: string | null
  salesInvoiceId: string | null
  accountId: string | null
  accountGroup: string | null
  accountClass: string | null
  description: string | null
}): RawCashLine {
  const value = new D(p.amount)
  const out = OUTGOING_PAYMENTS.has(p.paymentType ?? "")
  return {
    sourceId: p.paymentId,
    source: "payment",
    direction: out !== value.isNegative() ? "out" : "in",
    date: p.date,
    amount: money2(value.abs()),
    transactionType: p.paymentType,
    contactId: p.contactId,
    accountId: p.accountId,
    accountGroup: p.accountGroup,
    accountClass: p.accountClass,
    salesInvoiceId: p.salesInvoiceId,
    transferOtherRole: null,
    description: p.description,
  }
}

/**
 * One Xero BankTransaction as bank lines, one per coded account. Each line includes
 * any tax, and the last takes the rounding, so the lines add up to `Total`.
 */
export function bankTransactionCashLines(tx: {
  bankTransactionId: string
  type: string
  date: string
  total: string
  contactId: string | null
  reference: string | null
  transferOtherRole: "operating" | "tax_reserve" | null
  lineAmountTypes: string | null
  lines: {
    accountId: string | null
    accountGroup: string | null
    accountClass: string | null
    lineAmount: string
    taxAmount: string
    description: string | null
  }[]
}): RawCashLine[] {
  const direction = tx.type.startsWith("SPEND") ? "out" : "in"
  const base = {
    sourceId: tx.bankTransactionId,
    source: "bank_transaction" as const,
    direction: direction as "in" | "out",
    date: tx.date,
    transactionType: tx.type,
    contactId: tx.contactId,
    salesInvoiceId: null,
    transferOtherRole: tx.transferOtherRole,
  }
  const total = new D(tx.total)
  if (tx.lines.length === 0)
    return [
      {
        ...base,
        amount: money2(total),
        accountId: null,
        accountGroup: null,
        accountClass: null,
        description: tx.reference,
      },
    ]
  let left = total
  return tx.lines.map((l, i) => {
    const gross =
      tx.lineAmountTypes === "Exclusive"
        ? new D(l.lineAmount).plus(l.taxAmount)
        : new D(l.lineAmount)
    const amount = i === tx.lines.length - 1 ? left : penny(gross)
    left = left.minus(amount)
    return {
      ...base,
      amount: money2(amount),
      accountId: l.accountId,
      accountGroup: l.accountGroup,
      accountClass: l.accountClass,
      description: l.description ?? tx.reference,
    }
  })
}

// ------------------------------------------------------------------ outputs

export type Source = "actual" | "tracked" | "forecast" | "override" | "manual"

export type InvoiceStatus = "raised" | "forecast" | "late" | "missed"

export type BuiltInvoice = {
  key: string
  projectId: string | null
  projectName: string | null
  status: InvoiceStatus
  linked: boolean
  invoiceId: string | null
  invoiceNumber: string | null
  invoiceDate: string
  dueDate: string
  periodStart: string
  periodEnd: string
  /** Days before any override. */
  trackedDays: string
  forecastDays: string
  /** Days after any override. */
  totalDays: string
  amount: string
  contractorCost: string
  setAside: string
  total: string
  totalTax: string
  outstanding: string
  source: Source
  hasOverride: boolean
  overrideDays: string | null
  overrideAmount: string | null
  overrideNote: string | null
  /** The Xero contact on the invoice, or on its project for a forecast one. */
  clientName?: string | null
  /** Set on a one-off invoice a director added. */
  customId?: string
  customNote?: string | null
}

/** One invoice not yet fully paid, and when the forecast expects its money. */
export type ExpectedMoney = {
  key: string
  projectName: string | null
  invoiceNumber: string | null
  invoiceDate: string
  dueDate: string
  status: "overdue" | "raised" | "late" | "forecast" | "one-off"
  /** What's still to land, including any VAT. */
  amount: string
  /** Null when a director has left it out. */
  landsOn: string | null
  included: boolean
  expectedOn: string | null
  note: string | null
  source: Source
}

export type BillPlan = {
  /** Null for a forecast bill, which isn't stored. */
  id: string | null
  personId: string
  personName: string
  issuedOn: string
  periodStart: string
  periodEnd: string
  amount: string
  dueOn: string
  payOrder: number | null
  plannedPayOn: string | null
  status: "unpaid" | "paid" | "unmatched"
  paidOn: string | null
  paidAmount: string | null
  paidSource: StoredBill["paidSource"]
  paidByBankTransactionId: string | null
  source: Source
  /** When the forecast expects to pay it; null when paid or outside the window. */
  expectedPayOn: string | null
}

export type EventType =
  | CashKind
  | "expected_invoice"
  | "contractor_bill"
  | "adjustment"
  | "manual_balance"
  | "director_payout"
  | "reserve_repayment"

export type TimelineEvent = {
  date: string
  amount: string
  type: EventType
  label: string
  projectId: string | null
  personId: string | null
  source: Source
  /** It has already happened, according to Xero. */
  actual: boolean
  balance: string
}

export type MonthBreakdown = {
  month: string
  opening: string
  invoicesLanding: string
  backstopIn: string
  otherIn: string
  contractorBills: string
  setAsides: string
  vatPayments: string
  otherTransfersOut: string
  runningCosts: string
  adjustments: string
  directorPay: string
  closing: string
  vatOwed: string
  holdBack: string
  holdBackSource: "suggested" | "director" | "none"
  suggestedHoldBack: string
  holdBackReason: {
    /** The worst day next month, if nothing were held back. */
    shortOn: string
    shortBy: string
    /** Bills paid next month up to that day, added up per person. */
    bills: { personName: string; amount: string }[]
    /** The first invoice to land after that day, if any is forecast. */
    nextInvoice: { name: string; landsOn: string } | null
  } | null
  /** What's in the account straight after the payout. */
  afterPayout: string
  /** Set-asides and VAT still owed when the payout is worked out. */
  setAsideOwedAtPayout: string
  vatOwedAtPayout: string
  /** What the hold-back leaves uncovered next month, for the backstop warning. */
  shortfall: string
  payout: string
  takeHomePerDirector: string
  /** The last working day of the month, when the payout happens. */
  payoutDate: string
  addsUp: boolean
}

export type ForecastWarning = {
  kind:
    | "reconciliation"
    | "no_balance"
    | "breakdown"
    | "invoice_not_linked"
    | "contractor_paid_no_bill"
    | "bill_unmatched"
    | "invoice_missed"
    | "check_coding"
  message: string
}

export type ForecastInput = {
  today: string
  settings: ForecastSettings
  holidays: string[]
  /** London date of the latest successful Xero sync. */
  lastXeroSync: string | null
  projects: ProjectInput[]
  people: PersonInput[]
  payRates: PayRateInput[]
  entries: TimeEntryInput[]
  invoices: SalesInvoiceInput[]
  overrides: OverrideInput[]
  /** Classified lines from at least three complete months before this one. */
  cash: CashLine[]
  bills: StoredBill[]
  adjustments: { date: string; label: string; amountGbp: string }[]
  holdBacks: { month: string; amountGbp: string }[]
  /** Xero's balance on the operating account(s): the 1st of this month, and today. */
  balance: { opening: string; closing: string } | null
  /** A director's real balance for today, if entered. */
  manualBalance: string | null
  taxReserveBalance: string | null
  /** What-ifs on money expected in. */
  expectations: InvoiceExpectationInput[]
  /** One-off invoices added by a director. */
  customInvoices: CustomInvoiceInput[]
  /** Xero contacts, for client names. */
  contacts: { id: string; name: string }[]
  /** Running-cost bank movements marked as one-offs, by source ID. */
  oneOffCosts: string[]
  /** Suppliers with a known monthly cost, instead of their share of the average. */
  fixedCosts: { supplierKey: string; amountGbp: string }[]
}

/** A past month's bank movements, by what they were for. */
export type CashMonth = {
  month: string
  moneyIn: string
  contractors: string
  running: string
  salaries: string
  other: string
  setAsides: string
  /** Money moved back from the tax reserve, which still has to be replaced. */
  fromReserve: string
  /** The month's money in, by Xero client. */
  clients: { label: string; amount: string }[]
}

export type ForecastResult =
  | { blocked: true; missingDefaultRate: string[] }
  | {
      blocked: false
      today: string
      months: MonthBreakdown[]
      invoices: BuiltInvoice[]
      expectedMoney: ExpectedMoney[]
      bills: BillPlan[]
      timeline: TimelineEvent[]
      warnings: ForecastWarning[]
      runningCostAverage: string
      runningCosts: RunningCostTally
      /** Left in the main account each month. */
      buffer: string
      taxReserveBalance: string | null
      directorCount: number
      /** Salaries a month, all directors together. */
      salaryPerMonth: string
      /** Months before the timeline starts, from the bank. */
      cashHistory: CashMonth[]
      /** In name order, so each keeps one colour. */
      contractors: string[]
    }

// ------------------------------------------------------------------ days

const NON_CLIENT = "__non_client__"

type Tracked = Map<string, Map<string, Map<string, Dec>>>

/** The per-day figures everything else is built from. */
class DayBook {
  /** project key → person key → date → hours */
  readonly tracked: Tracked = new Map()
  /** person ID → date → internal-project hours by pay-rate project */
  readonly nonClient = new Map<
    string,
    { date: string; hours: Dec; projectId: string | null }[]
  >()
  readonly holidays: Set<string>
  readonly hoursPerDay: Dec
  private readonly lookbackFrom: string
  private readonly lookbackWorkingDays: number
  private readonly rateCache = new Map<string, Dec>()
  private readonly endDates: Map<string, string | null | undefined>

  constructor(readonly input: ForecastInput) {
    const { settings, today } = input
    this.holidays = new Set(input.holidays)
    this.endDates = new Map(input.projects.map((p) => [p.id, p.endDate]))
    this.hoursPerDay = new D(settings.hoursPerDay)
    const span = addDays(today, 1 - settings.lookbackDays)
    this.lookbackFrom = span > settings.startDate ? span : settings.startDate
    this.lookbackWorkingDays = workingDaysBetween(
      this.lookbackFrom,
      today,
      this.holidays
    )

    const projectByStId = new Map(
      input.projects.flatMap((p) =>
        p.solidtimeProjectIds.map((id) => [id, p] as const)
      )
    )
    const personByUser = new Map(
      input.people
        .filter((p) => p.solidtimeUserId)
        .map((p) => [p.solidtimeUserId!, p])
    )
    for (const e of input.entries) {
      if (e.running) continue
      const hours = new D(e.seconds).div(3600)
      const person = personByUser.get(e.userId)
      const project = e.projectId ? projectByStId.get(e.projectId) : undefined
      if (project?.kind === "client") {
        // Someone with no person row still counts towards the invoice, at no cost.
        this.add(project.id, person?.id ?? `user:${e.userId}`, e.date, hours)
      } else if (person?.kind === "contractor") {
        // Internal, unmapped and no-project time: cost only.
        this.add(NON_CLIENT, person.id, e.date, hours)
        const list = this.nonClient.get(person.id) ?? []
        list.push({ date: e.date, hours, projectId: project?.id ?? null })
        this.nonClient.set(person.id, list)
      }
    }
  }

  private add(project: string, person: string, date: string, hours: Dec) {
    const byPerson = this.tracked.get(project) ?? new Map()
    this.tracked.set(project, byPerson)
    const byDate: Map<string, Dec> = byPerson.get(person) ?? new Map()
    byPerson.set(person, byDate)
    byDate.set(date, (byDate.get(date) ?? ZERO).plus(hours))
  }

  personsOn(project: string): string[] {
    return [...(this.tracked.get(project)?.keys() ?? [])]
  }

  /** Days per working day, from the lookback window. */
  dailyRate(project: string, person: string): Dec {
    const key = `${project}|${person}`
    const hit = this.rateCache.get(key)
    if (hit) return hit
    let hours = ZERO
    for (const [date, h] of this.tracked.get(project)?.get(person) ?? [])
      if (date >= this.lookbackFrom && date <= this.input.today)
        hours = hours.plus(h)
    const rate =
      this.lookbackWorkingDays > 0
        ? hours.div(this.lookbackWorkingDays).div(this.hoursPerDay)
        : ZERO
    this.rateCache.set(key, rate)
    return rate
  }

  trackedOn(project: string, person: string, date: string): Dec {
    const hours = this.tracked.get(project)?.get(person)?.get(date) ?? ZERO
    return hours.div(this.hoursPerDay)
  }

  forecastOn(project: string, person: string, date: string): Dec {
    if (date <= this.input.today) return ZERO
    const end = this.endDates.get(project)
    if (end && date > end) return ZERO
    if (!isWorkingDay(date, this.holidays)) return ZERO
    return this.dailyRate(project, person)
  }
}

// ------------------------------------------------------------------ section A

type Built = BuiltInvoice & {
  /** Multiplies every person's days inside the period. */
  factor: Dec
  /** VAT on a forecast invoice, once registered. */
  forecastVat: Dec
  dueDateRaw: string
}

function rateFor(
  input: ForecastInput,
  personId: string,
  projectId: string | null
): Dec | null {
  const exact =
    projectId &&
    input.payRates.find(
      (r) => r.personId === personId && r.projectId === projectId
    )
  const rate =
    exact ||
    input.payRates.find((r) => r.personId === personId && r.projectId === null)
  return rate ? new D(rate.dayRateGbp) : null
}

function isContractor(input: ForecastInput, personId: string) {
  return input.people.some((p) => p.id === personId && p.kind === "contractor")
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Section A: every invoice, real and forecast, with its contractor cost and set-aside. */
function buildInvoices(
  input: ForecastInput,
  book: DayBook,
  windowEnd: string
): Built[] {
  const { settings, today } = input
  const rate = new D(settings.ctSetAsideRate)
  const step = new D(settings.invoiceDayRounding)
  const out: Built[] = []

  const setAsideFor = (amount: Dec, cost: Dec) =>
    D.max(penny(rate.times(amount.minus(cost))), ZERO)

  const claimed = new Set<string>()
  const paidInForecast = new Set(
    input.cash
      .filter(
        (l) => l.kind === "client_payment" && l.date >= settings.startDate
      )
      .map((l) => l.salesInvoiceId)
  )

  for (const project of input.projects) {
    if (project.kind !== "client" || !project.code) continue
    const prefix = `${project.code}-I`
    const real = input.invoices
      .filter((i) => i.invoiceNumber?.startsWith(prefix))
      .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
    const realDates = new Set(real.map((i) => i.invoiceDate))

    let previous: string | null = null
    for (const inv of real) {
      claimed.add(inv.invoiceId)
      const prev: string | null = previous
      previous = inv.invoiceDate
      // An older invoice only matters once money from it lands inside the forecast.
      const beforeStart = inv.invoiceDate < settings.startDate
      if (
        beforeStart &&
        new D(inv.outstanding).lte(0) &&
        !paidInForecast.has(inv.invoiceId)
      )
        continue
      const start = prev
        ? addDays(prev, 1)
        : beforeStart
          ? addDays(inv.invoiceDate, 1 - project.invoiceIntervalDays)
          : settings.startDate
      // A real invoice covers everything since the last one, even if that began
      // before the forecast did: only the first has nothing else to start from.
      const from = start
      const days = eachDate(from, inv.invoiceDate)
      let tracked = ZERO
      let cost = ZERO
      for (const person of book.personsOn(project.id)) {
        let personDays = ZERO
        for (const d of days)
          personDays = personDays.plus(book.trackedOn(project.id, person, d))
        tracked = tracked.plus(personDays)
        if (isContractor(input, person))
          cost = cost.plus(
            personDays.times(rateFor(input, person, project.id) ?? ZERO)
          )
      }
      cost = penny(cost)
      const amount = new D(inv.subTotal)
      out.push({
        key: inv.invoiceId,
        projectId: project.id,
        projectName: project.name,
        status: "raised",
        linked: true,
        invoiceId: inv.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate ?? inv.invoiceDate,
        dueDateRaw: inv.dueDate ?? inv.invoiceDate,
        periodStart: from,
        periodEnd: inv.invoiceDate,
        trackedDays: tracked.toFixed(4),
        forecastDays: "0.0000",
        totalDays: tracked.toFixed(4),
        amount: money(amount),
        contractorCost: money(cost),
        setAside: money(setAsideFor(amount, cost)),
        total: inv.total,
        totalTax: inv.totalTax,
        outstanding: inv.outstanding,
        source: "actual",
        hasOverride: false,
        overrideDays: null,
        overrideAmount: null,
        overrideNote: null,
        factor: new D(1),
        forecastVat: ZERO,
      })
    }

    if (!project.active || !project.chargeRateGbp) continue
    const chargeRate = new D(project.chargeRateGbp)
    const latestReal = real.at(-1)?.invoiceDate ?? null

    let lastDate: string | null = null
    const cycleDates = invoiceDates(project, settings.startDate, windowEnd)
    // The first invoice date on or after the end covers the last of the work.
    const lastInvoice = project.endDate
      ? cycleDates.find((d) => d >= project.endDate!)
      : undefined
    const allDates = lastInvoice
      ? cycleDates.filter((d) => d <= lastInvoice)
      : cycleDates
    const timelineDates = [...new Set([...allDates, ...realDates])].sort()

    for (const date of timelineDates) {
      if (realDates.has(date)) {
        lastDate = date
        continue
      }
      let status: InvoiceStatus = "forecast"
      if (date < today) {
        const threeDaysOld = addWorkingDays(date, 3, book.holidays)
        const syncedSince =
          input.lastXeroSync !== null && input.lastXeroSync >= threeDaysOld
        // A later real invoice already covers this period.
        const superseded = latestReal !== null && latestReal > date
        status =
          superseded || (today >= threeDaysOld && syncedSince)
            ? "missed"
            : "late"
      }

      const after: string = lastDate ? addDays(lastDate, 1) : settings.startDate
      const start = after > settings.startDate ? after : settings.startDate
      const days = eachDate(start, date)

      let tracked = ZERO
      let forecast = ZERO
      const byPerson = new Map<string, Dec>()
      for (const person of book.personsOn(project.id)) {
        let personDays = ZERO
        for (const d of days) {
          const t = book.trackedOn(project.id, person, d)
          const f = book.forecastOn(project.id, person, d)
          tracked = tracked.plus(t)
          forecast = forecast.plus(f)
          personDays = personDays.plus(t).plus(f)
        }
        byPerson.set(person, personDays)
      }
      const unscaled = tracked.plus(forecast)

      const override = input.overrides.find(
        (o) => o.projectId === project.id && o.periodEnd === date
      )
      const hasAmount = override?.amountGbp != null
      const hasDays = override?.days != null
      let factor = new D(1)
      let total = unscaled
      if (hasAmount || hasDays) {
        total = hasAmount
          ? new D(override!.amountGbp!).div(chargeRate)
          : new D(override!.days!)
        factor = unscaled.isZero() ? ZERO : total.div(unscaled)
      }

      // Nothing left to bill after the project ended, so there's no last invoice.
      if (
        project.endDate &&
        date > project.endDate &&
        unscaled.isZero() &&
        !override
      )
        continue

      if (status === "missed") {
        out.push(
          missed(project, date, start, tracked, forecast, override ?? null)
        )
        continue
      }

      const amount = hasAmount
        ? penny(override!.amountGbp!)
        : penny(
            total.div(step).toDecimalPlaces(0).times(step).times(chargeRate)
          )

      let cost = ZERO
      for (const [person, personDays] of byPerson)
        if (isContractor(input, person))
          cost = cost.plus(
            personDays
              .times(factor)
              .times(rateFor(input, person, project.id) ?? ZERO)
          )
      cost = penny(cost)

      const due = addDays(date, project.paymentTermsDays)
      const registered =
        settings.vatRegisteredFrom !== null &&
        date >= settings.vatRegisteredFrom
      const vat = registered ? penny(amount.times(settings.vatRate)) : ZERO

      lastDate = date
      out.push({
        key: `${project.id}|${date}`,
        projectId: project.id,
        projectName: project.name,
        status,
        linked: true,
        invoiceId: null,
        invoiceNumber: null,
        invoiceDate: date,
        dueDate: due,
        dueDateRaw: due,
        periodStart: start,
        periodEnd: date,
        trackedDays: tracked.toFixed(4),
        forecastDays: forecast.toFixed(4),
        totalDays: total.toFixed(4),
        amount: money(amount),
        contractorCost: money(cost),
        setAside: money(setAsideFor(amount, cost)),
        total: money(amount.plus(vat)),
        totalTax: money(vat),
        outstanding: money(amount.plus(vat)),
        source: override
          ? "override"
          : forecast.isZero()
            ? "tracked"
            : "forecast",
        hasOverride: Boolean(override),
        overrideDays: override?.days ?? null,
        overrideAmount: override?.amountGbp ?? null,
        overrideNote: override?.note ?? null,
        factor,
        forecastVat: vat,
      })
    }
  }

  // Everything left, or dated before tracking began: no contractor cost, full set-aside.
  for (const inv of input.invoices) {
    const linkedAlready = out.some((o) => o.invoiceId === inv.invoiceId)
    if (linkedAlready) continue
    const amount = new D(inv.subTotal)
    const project =
      claimed.has(inv.invoiceId) && inv.invoiceNumber
        ? input.projects.find(
            (p) => p.code && inv.invoiceNumber!.startsWith(`${p.code}-I`)
          )
        : undefined
    out.push({
      key: inv.invoiceId,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      status: "raised",
      linked: false,
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate ?? inv.invoiceDate,
      dueDateRaw: inv.dueDate ?? inv.invoiceDate,
      periodStart: inv.invoiceDate,
      periodEnd: inv.invoiceDate,
      trackedDays: "0.0000",
      forecastDays: "0.0000",
      totalDays: "0.0000",
      amount: money(amount),
      contractorCost: "0.00",
      setAside: money(setAsideFor(amount, ZERO)),
      total: inv.total,
      totalTax: inv.totalTax,
      outstanding: inv.outstanding,
      source: "actual",
      hasOverride: false,
      overrideDays: null,
      overrideAmount: null,
      overrideNote: null,
      factor: new D(1),
      forecastVat: ZERO,
    })
  }

  // One-off invoices a director added: their money and set-aside, nothing tracked.
  for (const c of input.customInvoices) {
    const amount = penny(c.amountGbp)
    const cost = penny(c.contractorCostGbp)
    const registered =
      settings.vatRegisteredFrom !== null &&
      c.landsOn >= settings.vatRegisteredFrom
    const vat = registered ? penny(amount.times(settings.vatRate)) : ZERO
    out.push({
      key: `custom:${c.id}`,
      customId: c.id,
      customNote: c.note,
      projectId: null,
      projectName: c.label,
      status: "forecast",
      linked: true,
      invoiceId: null,
      invoiceNumber: null,
      invoiceDate: c.landsOn,
      dueDate: c.landsOn,
      dueDateRaw: c.landsOn,
      periodStart: c.landsOn,
      periodEnd: c.landsOn,
      trackedDays: "0.0000",
      forecastDays: "0.0000",
      totalDays: "0.0000",
      amount: money(amount),
      contractorCost: money(cost),
      setAside: money(setAsideFor(amount, cost)),
      total: money(amount.plus(vat)),
      totalTax: money(vat),
      outstanding: money(amount.plus(vat)),
      source: "manual",
      hasOverride: false,
      overrideDays: null,
      overrideAmount: null,
      overrideNote: null,
      factor: new D(1),
      forecastVat: vat,
    })
  }

  const contactName = new Map(input.contacts.map((c) => [c.id, c.name]))
  const invoiceContact = new Map(
    input.invoices.map((i) => [i.invoiceId, i.contactId ?? null])
  )
  const projectContact = new Map(
    input.projects.map((p) => [p.id, p.xeroContactId ?? null])
  )
  for (const inv of out) {
    const contact =
      (inv.invoiceId ? invoiceContact.get(inv.invoiceId) : null) ??
      (inv.projectId ? projectContact.get(inv.projectId) : null)
    inv.clientName = contact ? (contactName.get(contact) ?? null) : null
  }

  return out.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
}

function missed(
  project: ProjectInput,
  date: string,
  start: string,
  tracked: Dec,
  forecast: Dec,
  override: OverrideInput | null
): Built {
  return {
    key: `${project.id}|${date}`,
    projectId: project.id,
    projectName: project.name,
    status: "missed",
    linked: true,
    invoiceId: null,
    invoiceNumber: null,
    invoiceDate: date,
    dueDate: date,
    dueDateRaw: date,
    periodStart: start,
    periodEnd: date,
    trackedDays: tracked.toFixed(4),
    forecastDays: forecast.toFixed(4),
    totalDays: tracked.plus(forecast).toFixed(4),
    amount: "0.00",
    contractorCost: "0.00",
    setAside: "0.00",
    total: "0.00",
    totalTax: "0.00",
    outstanding: "0.00",
    source: "forecast",
    hasOverride: Boolean(override),
    overrideDays: override?.days ?? null,
    overrideAmount: override?.amountGbp ?? null,
    overrideNote: override?.note ?? null,
    factor: new D(1),
    forecastVat: ZERO,
  }
}

// ------------------------------------------------------------------ bills

type ForecastBill = {
  personId: string
  issuedOn: string
  periodStart: string
  periodEnd: string
  amount: Dec
  dueOn: string
  source: Source
}

/** What a contractor is owed for work in a date range, across everything they tracked. */
function contractorCostInRange(
  input: ForecastInput,
  book: DayBook,
  invoices: Built[],
  personId: string,
  from: string,
  to: string
): { amount: Dec; overridden: boolean; future: boolean } {
  let amount = ZERO
  let overridden = false
  let future = false
  const dates = eachDate(from, to)
  const defaultRate = rateFor(input, personId, null) ?? ZERO

  for (const project of input.projects) {
    if (project.kind !== "client") continue
    if (!book.personsOn(project.id).includes(personId)) continue
    const rate = rateFor(input, personId, project.id) ?? ZERO
    const periods = invoices.filter(
      (i) => i.projectId === project.id && i.status !== "missed"
    )
    for (const d of dates) {
      const period = periods.find((p) => d >= p.periodStart && d <= p.periodEnd)
      const factor = period?.factor ?? new D(1)
      const t = book.trackedOn(project.id, personId, d)
      const f = book.forecastOn(project.id, personId, d)
      if (!factor.equals(1) && (t.gt(0) || f.gt(0))) overridden = true
      if (f.gt(0)) future = true
      amount = amount.plus(t.plus(f).times(factor).times(rate))
    }
  }

  for (const e of book.nonClient.get(personId) ?? [])
    if (e.date >= from && e.date <= to)
      amount = amount.plus(
        e.hours
          .div(book.hoursPerDay)
          .times(rateFor(input, personId, e.projectId) ?? defaultRate)
      )
  for (const d of dates) {
    const f = book.forecastOn(NON_CLIENT, personId, d)
    if (f.gt(0)) future = true
    amount = amount.plus(f.times(defaultRate))
  }
  return { amount, overridden, future }
}

/** One calculated bill per last Friday that no stored bill already covers. */
function forecastBills(
  input: ForecastInput,
  book: DayBook,
  invoices: Built[],
  windowEnd: string
): ForecastBill[] {
  const { settings } = input
  const out: ForecastBill[] = []
  const firstMonth = monthStart(settings.startDate)

  for (const person of input.people) {
    if (person.kind !== "contractor") continue
    const stored = input.bills
      .filter((b) => b.personId === person.id)
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    // Periods follow the billing cycle, so the first can begin before the forecast.
    const cutoff = (billDate: string) =>
      addDays(billDate, -person.billCutoffDays)
    let cursor: string | null = null

    for (let m = firstMonth; m <= windowEnd; m = addMonths(m, 1)) {
      const billDate = lastFriday(m)
      if (billDate > windowEnd) break
      if (billDate < settings.startDate) continue
      cursor ??= addDays(cutoff(lastFriday(addMonths(m, -1))), 1)
      const periodEnd = cutoff(billDate)
      // Stored bills up to here move the start of the next period along.
      for (const s of stored)
        if (s.issuedOn <= billDate && s.periodEnd >= cursor)
          cursor = addDays(s.periodEnd, 1)
      if (stored.some((s) => s.issuedOn === billDate)) continue
      if (cursor > periodEnd) continue
      const { amount, overridden, future } = contractorCostInRange(
        input,
        book,
        invoices,
        person.id,
        cursor,
        periodEnd
      )
      const rounded = penny(amount)
      if (rounded.gt(0))
        out.push({
          personId: person.id,
          issuedOn: billDate,
          periodStart: cursor,
          periodEnd,
          amount: rounded,
          dueOn: addDays(billDate, person.billTermsDays),
          source: overridden ? "override" : future ? "forecast" : "tracked",
        })
      cursor = addDays(periodEnd, 1)
    }
  }
  return out
}

// ------------------------------------------------------------------ matching

export type ContractorPayment = {
  bankTransactionId: string
  personId: string
  date: string
  amount: string
}

export type OpenBill = {
  /** Null for a forecast bill, which has to be saved when it's closed. */
  id: string | null
  personId: string
  issuedOn: string
  periodStart: string
  periodEnd: string
  amount: string
  dueOn: string
}

export type BillClosure = {
  bill: OpenBill
  payment: ContractorPayment
  paidSource: "auto" | "unmatched"
}

/** Group the contractor lines of each bank transaction into one payment. */
export function contractorPayments(lines: CashLine[]): ContractorPayment[] {
  const byTx = new Map<string, ContractorPayment>()
  for (const l of lines) {
    if (l.kind !== "contractor_payment" || !l.personId) continue
    const hit = byTx.get(l.sourceId)
    if (hit) hit.amount = money(new D(hit.amount).plus(l.amount))
    else
      byTx.set(l.sourceId, {
        bankTransactionId: l.sourceId,
        personId: l.personId,
        date: l.date,
        amount: money(l.amount),
      })
  }
  return [...byTx.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Link contractor payments to bills, oldest payment first: an exact match if
 * there is one, otherwise the person's oldest qualifying bill. A payment with no
 * bill issued on or before its date closes nothing.
 */
export function matchContractorPayments(args: {
  payments: ContractorPayment[]
  openBills: OpenBill[]
  linkedTransactionIds: Set<string>
  excludedTransactionIds: Set<string>
}): { closures: BillClosure[]; noBill: ContractorPayment[] } {
  const open = [...args.openBills].sort((a, b) =>
    a.issuedOn.localeCompare(b.issuedOn)
  )
  const closures: BillClosure[] = []
  const noBill: ContractorPayment[] = []
  for (const p of args.payments) {
    if (args.linkedTransactionIds.has(p.bankTransactionId)) continue
    if (args.excludedTransactionIds.has(p.bankTransactionId)) continue
    const qualifying = open.filter(
      (b) => b.personId === p.personId && b.issuedOn <= p.date
    )
    const exact = qualifying.find((b) => new D(b.amount).equals(p.amount))
    const bill = exact ?? qualifying[0]
    if (!bill) {
      noBill.push(p)
      continue
    }
    closures.push({
      bill,
      payment: p,
      paidSource: exact ? "auto" : "unmatched",
    })
    open.splice(open.indexOf(bill), 1)
  }
  return { closures, noBill }
}

// ------------------------------------------------------------------ section B and C

type StaticEvent = Omit<TimelineEvent, "amount" | "balance"> & { amount: Dec }

type SimBill = {
  id: string | null
  personId: string
  personName: string
  issuedOn: string
  dueOn: string
  amount: Dec
  payOrder: number | null
  plannedPayOn: string | null
  source: Source
}

type Prepared = {
  events: StaticEvent[]
  bills: SimBill[]
  /** Set-aside owed but not yet transferred, as of a given day. */
  setAsideOwedOn: (date: string) => Dec
  vatOwedOn: (date: string) => Dec
  firstDay: string
  lastDay: string
  displayEnd: string
}

type SimResult = {
  events: TimelineEvent[]
  /** Balance at the end of each day, before any payout that day is taken. */
  endOfDay: Map<string, Dec>
  paidOn: Map<SimBill, string>
  payouts: Map<string, Dec>
}

const compareBills = (a: SimBill, b: SimBill) => {
  const ao = a.payOrder ?? Number.POSITIVE_INFINITY
  const bo = b.payOrder ?? Number.POSITIVE_INFINITY
  return ao - bo || a.issuedOn.localeCompare(b.issuedOn)
}

function simulate(
  input: ForecastInput,
  prepared: Prepared,
  opening: Dec,
  holdBacks: Map<string, Dec>
): SimResult {
  const { today, settings } = input
  const holidays = new Set(input.holidays)
  const buffer = new D(settings.bufferGbp)

  const byDate = new Map<string, StaticEvent[]>()
  for (const e of prepared.events) {
    const list = byDate.get(e.date) ?? []
    list.push(e)
    byDate.set(e.date, list)
  }

  const events: TimelineEvent[] = []
  const endOfDay = new Map<string, Dec>()
  const paidOn = new Map<SimBill, string>()
  const payouts = new Map<string, Dec>()
  const unpaid = [...prepared.bills].sort(compareBills)
  let balance = opening

  const push = (e: StaticEvent) => {
    balance = balance.plus(e.amount)
    events.push({ ...e, amount: money(e.amount), balance: money(balance) })
  }
  const pay = (bill: SimBill, date: string) => {
    push({
      date,
      amount: bill.amount.negated(),
      type: "contractor_bill",
      label: `Contractor bill: ${bill.personName}`,
      projectId: null,
      personId: bill.personId,
      source: bill.source,
      actual: false,
    })
    paidOn.set(bill, date)
    unpaid.splice(unpaid.indexOf(bill), 1)
  }

  for (
    let date = prepared.firstDay;
    date <= prepared.lastDay;
    date = addDays(date, 1)
  ) {
    // Money in first, so a bill or payout can use what lands that day.
    const todays = (byDate.get(date) ?? []).sort(
      (a, b) => Number(b.amount.gt(0)) - Number(a.amount.gt(0))
    )
    for (const e of todays) push(e)

    if (date >= today) {
      for (const bill of [...unpaid]) {
        if (bill.plannedPayOn) {
          const planned = bill.plannedPayOn > today ? bill.plannedPayOn : today
          if (planned === date) pay(bill, date)
        } else if (bill.dueOn <= date) {
          pay(bill, date)
        }
      }
      // Pay in the chosen order; stop at the first bill the balance can't cover.
      for (const bill of [...unpaid]) {
        if (bill.plannedPayOn) continue
        const earliest = addMonths(bill.issuedOn, 1)
        if (date < earliest) continue
        const available = balance
          .minus(prepared.setAsideOwedOn(date))
          .minus(prepared.vatOwedOn(date))
        if (available.lt(bill.amount)) break
        pay(bill, date)
      }
    }
    endOfDay.set(date, balance)

    if (date >= today && date === lastWorkingDay(date, holidays)) {
      const month = monthStart(date)
      const payout = D.max(
        balance
          .minus(buffer)
          .minus(prepared.vatOwedOn(date))
          .minus(prepared.setAsideOwedOn(date))
          .minus(holdBacks.get(month) ?? ZERO),
        ZERO
      )
      const rounded = penny(payout)
      payouts.set(month, rounded)
      if (rounded.gt(0))
        push({
          date,
          amount: rounded.negated(),
          type: "director_payout",
          label: "Month-end take-home to directors",
          projectId: null,
          personId: null,
          source: "forecast",
          actual: false,
        })
    }
  }
  return { events, endOfDay, paidOn, payouts }
}

/**
 * What the month after `month` would need on top of what it has, to pay every
 * contractor bill by its due date. The worst day decides the amount.
 */
function shortfallIn(
  prepared: Prepared,
  sim: SimResult,
  month: string
): { amount: Dec; day: string | null } {
  const next = addMonths(month, 1)
  const end = monthEnd(next)
  const due = prepared.bills.filter((b) => {
    const when = b.plannedPayOn ?? b.dueOn
    return when >= next && when <= end
  })
  if (due.length === 0) return { amount: ZERO, day: null }
  const lastDue = due.reduce((m, b) => {
    const when = b.plannedPayOn ?? b.dueOn
    return when > m ? when : m
  }, next)
  let worst = ZERO
  let worstDay: string | null = null
  for (let d = next; d <= lastDue; d = addDays(d, 1)) {
    const short = (sim.endOfDay.get(d) ?? ZERO).negated()
    if (short.gt(worst)) {
      worst = short
      worstDay = d
    }
  }
  if (!worstDay) return { amount: ZERO, day: null }
  return { amount: worst, day: worstDay }
}

/** Bills paid between two days, in the order they went out, added up per person. */
function billsPaidBetween(
  sim: SimResult,
  from: string,
  to: string
): { personName: string; amount: string }[] {
  const byPerson = new Map<string, Dec>()
  const paid = [...sim.paidOn.entries()]
    .filter(([, on]) => on >= from && on <= to)
    .sort((a, b) => a[1].localeCompare(b[1]))
  for (const [bill] of paid)
    byPerson.set(
      bill.personName,
      (byPerson.get(bill.personName) ?? ZERO).plus(bill.amount)
    )
  return [...byPerson.entries()].map(([personName, amount]) => ({
    personName,
    amount: money(amount),
  }))
}

/** The first invoice to land after a day, with its name but not its label. */
function nextInvoiceAfter(
  sim: SimResult,
  day: string | null
): { name: string; landsOn: string } | null {
  if (!day) return null
  const hit = sim.events
    .filter((e) => e.type === "expected_invoice" && e.date > day)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  return hit
    ? { name: hit.label.replace(/^[^:]*: /, ""), landsOn: hit.date }
    : null
}

/** A director's date wins, but money can't land in the past. */
function landingDate(
  inv: Built,
  expectation: InvoiceExpectationInput | undefined,
  today: string
): string {
  const wanted = expectation?.expectedOn ?? inv.dueDateRaw
  return wanted > today ? wanted : today
}

/** Every invoice with money still to land, whatever its date, overdue ones first. */
function expectedMoney(
  input: ForecastInput,
  invoices: Built[],
  displayEnd: string
): ExpectedMoney[] {
  const { today } = input
  const expectations = new Map(input.expectations.map((e) => [e.invoiceKey, e]))
  return invoices
    .filter(
      (i) =>
        i.status !== "missed" &&
        new D(i.outstanding).gt(0) &&
        (i.customId !== undefined || i.invoiceDate <= displayEnd)
    )
    .map((i): ExpectedMoney => {
      const e = expectations.get(i.key)
      const included = !e?.excluded
      return {
        key: i.key,
        projectName: i.projectName,
        invoiceNumber: i.invoiceNumber,
        invoiceDate: i.invoiceDate,
        dueDate: i.dueDateRaw,
        status: i.customId
          ? "one-off"
          : i.status !== "raised"
            ? i.status === "late"
              ? "late"
              : "forecast"
            : i.dueDateRaw < today
              ? "overdue"
              : "raised",
        amount: money(i.outstanding),
        landsOn: included ? landingDate(i, e, today) : null,
        included,
        expectedOn: e?.expectedOn ?? null,
        note: e?.note ?? null,
        source: e ? "override" : i.source,
      }
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function prepare(
  input: ForecastInput,
  invoices: Built[],
  bills: ForecastBill[],
  displayEnd: string,
  lastDay: string
): Prepared & { billPlans: Omit<BillPlan, "expectedPayOn">[] } {
  const { today, settings, cash } = input
  const firstDay = monthStart(today)
  const events: StaticEvent[] = []
  const personName = (id: string | null) =>
    input.people.find((p) => p.id === id)?.name ?? "Unknown"
  const invoiceById = new Map(
    invoices.filter((i) => i.invoiceId).map((i) => [i.invoiceId!, i])
  )
  const rate = new D(settings.ctSetAsideRate)

  // -------- actual events, on their dates
  const labels: Record<CashKind, string> = {
    client_payment: "Client payment",
    backstop_in: "Money back from tax reserve",
    other_transfer_in: "Transfer in",
    other_in: "Other money in",
    set_aside: "Set-aside moved to tax reserve",
    other_transfer_out: "Transfer out",
    vat_payment: "VAT paid to HMRC",
    contractor_payment: "Contractor payment",
    director_salary: "Director salary",
    dividend: "Dividend",
    running_cost: "Running cost",
  }
  for (const l of cash) {
    if (l.date < firstDay || l.date > lastDay) continue
    const inv = l.salesInvoiceId ? invoiceById.get(l.salesInvoiceId) : undefined
    const who = l.personId ? `: ${personName(l.personId)}` : ""
    events.push({
      date: l.date,
      amount:
        l.direction === "in" ? new D(l.amount) : new D(l.amount).negated(),
      type: l.kind,
      label: inv?.invoiceNumber
        ? `${labels[l.kind]}: ${inv.invoiceNumber}`
        : l.description
          ? `${labels[l.kind]}: ${l.description}`
          : `${labels[l.kind]}${who}`,
      projectId: inv?.projectId ?? null,
      personId: l.personId,
      source: "actual",
      actual: true,
    })
  }

  // -------- expected money in
  const expectations = new Map(input.expectations.map((e) => [e.invoiceKey, e]))
  type Owed = {
    date: string
    amount: Dec
    label: string
    projectId: string | null
    repayment?: boolean
  }
  const owed: Owed[] = []
  // Money taken back from the tax reserve is still owed to it. It goes back on
  // the month's payout day, so it comes out of the payout rather than the bills.
  for (const l of cash)
    if (l.kind === "backstop_in" && l.date >= settings.startDate)
      owed.push({
        date: l.date,
        amount: new D(l.amount),
        label: "Repay tax reserve",
        projectId: null,
        repayment: true,
      })
  const vatItems: { date: string; amount: Dec }[] = []
  const registeredFrom = settings.vatRegisteredFrom

  for (const l of cash) {
    if (l.kind !== "client_payment" || l.date < settings.startDate) continue
    const inv = l.salesInvoiceId ? invoiceById.get(l.salesInvoiceId) : undefined
    const total = inv ? new D(inv.total) : ZERO
    const share = total.isZero()
      ? penny(rate.times(l.amount))
      : penny(new D(l.amount).div(total).times(inv!.setAside))
    owed.push({
      date: l.date,
      amount: share,
      label: inv?.invoiceNumber ?? "client payment",
      projectId: inv?.projectId ?? null,
    })
    if (registeredFrom && l.date >= registeredFrom && inv && !total.isZero())
      vatItems.push({
        date: l.date,
        amount: penny(new D(l.amount).times(inv.totalTax).div(total)),
      })
  }
  for (const l of cash)
    if (l.kind === "vat_payment" && registeredFrom && l.date >= registeredFrom)
      vatItems.push({ date: l.date, amount: new D(l.amount).negated() })

  for (const inv of invoices) {
    const outstanding = new D(inv.outstanding)
    if (inv.status === "missed" || outstanding.lte(0)) continue
    const expectation = expectations.get(inv.key)
    if (expectation?.excluded) continue
    const landing = landingDate(inv, expectation, today)
    if (landing > lastDay) continue
    const name = inv.invoiceNumber ?? inv.projectName ?? "Invoice"
    events.push({
      date: landing,
      amount: outstanding,
      type: "expected_invoice",
      label: inv.customId
        ? `One-off invoice: ${name}`
        : inv.status === "late"
          ? `Invoice (late): ${name}`
          : inv.status === "raised"
            ? `Invoice due: ${name}`
            : `Forecast invoice: ${name}`,
      projectId: inv.projectId,
      personId: null,
      source: expectation?.expectedOn ? "override" : inv.source,
      actual: false,
    })
    const total = new D(inv.total)
    owed.push({
      date: landing,
      amount: total.isZero()
        ? ZERO
        : penny(outstanding.div(total).times(inv.setAside)),
      label: name,
      projectId: inv.projectId,
    })
    if (registeredFrom && landing >= registeredFrom && !total.isZero())
      vatItems.push({
        date: landing,
        amount: penny(outstanding.times(inv.totalTax).div(total)),
      })
  }

  // -------- set-asides: actual transfers settle what's owed, oldest first
  let credit = sum(
    cash
      .filter((l) => l.kind === "set_aside" && l.date >= settings.startDate)
      .map((l) => new D(l.amount))
  )
  const scheduled: { owedOn: string; moveOn: string; amount: Dec }[] = []
  for (const o of owed.sort((a, b) => a.date.localeCompare(b.date))) {
    const settled = D.min(credit, o.amount)
    credit = credit.minus(settled)
    const remaining = o.amount.minus(settled)
    if (remaining.lte(0)) continue
    // A set-aside moves the moment the money lands; a repayment waits for payout day.
    const landed = o.date > today ? o.date : today
    const moveOn = o.repayment
      ? lastWorkingDay(landed, new Set(input.holidays))
      : landed
    scheduled.push({ owedOn: o.date, moveOn, amount: remaining })
    if (moveOn <= lastDay)
      events.push({
        date: moveOn,
        amount: remaining.negated(),
        type: o.repayment ? "reserve_repayment" : "set_aside",
        label: o.repayment ? o.label : `Set-aside: ${o.label}`,
        projectId: o.projectId,
        personId: null,
        source: "forecast",
        actual: false,
      })
  }

  // -------- running costs, spread over each remaining day
  const average = runningCostAverage(input)
  for (let d = addDays(today, 1); d <= lastDay; d = addDays(d, 1))
    if (average.gt(0))
      events.push({
        date: d,
        amount: penny(average.div(daysInMonth(d))).negated(),
        type: "running_cost",
        label: "Running costs (monthly average)",
        projectId: null,
        personId: null,
        source: "forecast",
        actual: false,
      })

  // -------- adjustments and a hand-entered balance
  for (const a of input.adjustments)
    if (a.date >= firstDay && a.date <= lastDay)
      events.push({
        date: a.date,
        amount: new D(a.amountGbp),
        type: "adjustment",
        label: a.label,
        projectId: null,
        personId: null,
        source: "manual",
        actual: false,
      })
  if (input.manualBalance !== null && input.balance) {
    const difference = new D(input.manualBalance).minus(input.balance.closing)
    if (!difference.isZero())
      events.push({
        date: today,
        amount: difference,
        type: "manual_balance",
        label: "Not yet in Xero",
        projectId: null,
        personId: null,
        source: "manual",
        actual: false,
      })
  }

  // -------- bills
  const sim: SimBill[] = []
  const billPlans: Omit<BillPlan, "expectedPayOn">[] = []
  for (const b of input.bills) {
    const paid = b.paidSource !== null || b.paidOn !== null
    billPlans.push({
      id: b.id,
      personId: b.personId,
      personName: personName(b.personId),
      issuedOn: b.issuedOn,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      amount: money(b.amountGbp),
      dueOn: b.dueOn,
      payOrder: b.payOrder,
      plannedPayOn: b.plannedPayOn,
      status: !paid
        ? "unpaid"
        : b.paidSource === "unmatched"
          ? "unmatched"
          : "paid",
      paidOn: b.paidOn,
      paidAmount: b.paidAmountGbp ? money(b.paidAmountGbp) : null,
      paidSource: b.paidSource,
      paidByBankTransactionId: b.paidByBankTransactionId,
      source: "manual",
    })
    if (!paid)
      sim.push({
        id: b.id,
        personId: b.personId,
        personName: personName(b.personId),
        issuedOn: b.issuedOn,
        dueOn: b.dueOn,
        amount: new D(b.amountGbp),
        payOrder: b.payOrder,
        plannedPayOn: b.plannedPayOn,
        source: "manual",
      })
  }
  for (const b of bills) {
    billPlans.push({
      id: null,
      personId: b.personId,
      personName: personName(b.personId),
      issuedOn: b.issuedOn,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      amount: money(b.amount),
      dueOn: b.dueOn,
      payOrder: null,
      plannedPayOn: null,
      status: "unpaid",
      paidOn: null,
      paidAmount: null,
      paidSource: null,
      paidByBankTransactionId: null,
      source: b.source,
    })
    sim.push({
      id: null,
      personId: b.personId,
      personName: personName(b.personId),
      issuedOn: b.issuedOn,
      dueOn: b.dueOn,
      amount: b.amount,
      payOrder: null,
      plannedPayOn: null,
      source: b.source,
    })
  }

  return {
    events,
    bills: sim,
    billPlans,
    setAsideOwedOn: (date) =>
      sum(
        scheduled
          .filter((s) => s.owedOn <= date && s.moveOn > date)
          .map((s) => s.amount)
      ),
    vatOwedOn: (date) =>
      sum(vatItems.filter((v) => v.date <= date).map((v) => v.amount)),
    firstDay,
    lastDay,
    displayEnd,
  }
}

/** What a running-cost line took out of the bank; a refund is negative. */
const runningCostOf = (l: CashLine) =>
  l.direction === "out" ? new D(l.amount) : new D(l.amount).negated()

/** Who a running cost was paid to. References differ between charges, so they don't split a payee. */
const runningCostKey = (l: {
  contactId: string | null
  description: string | null
}) =>
  l.contactId ??
  `text:${(l.description ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()}`

/**
 * The average of the last three complete months of running-cost spend,
 * leaving out anything a director marked as a one-off. A supplier with a fixed
 * monthly amount counts at that amount instead of its share of the average.
 */
function runningCostAverage(
  input: ForecastInput,
  options: { fromBankOnly?: boolean } = {}
): Dec {
  const end = monthStart(input.today)
  const start = addMonths(end, -3)
  const oneOffs = new Set(options.fromBankOnly ? [] : input.oneOffCosts)
  const fixed = options.fromBankOnly ? [] : input.fixedCosts
  const fixedKeys = new Set(fixed.map((f) => f.supplierKey))
  const spent = sum(
    input.cash
      .filter(
        (l) =>
          l.kind === "running_cost" &&
          l.date >= start &&
          l.date < end &&
          !oneOffs.has(l.sourceId) &&
          !fixedKeys.has(runningCostKey(l))
      )
      .map(runningCostOf)
  )
  return penny(spent.div(3).plus(sum(fixed.map((f) => new D(f.amountGbp)))))
}

export type RunningCostStatus =
  /** Inside the three months the average uses. */
  | "in_average"
  /** Inside those months, but marked as a one-off. */
  | "one_off"
  /** Not used, because the supplier has a fixed monthly amount. */
  | "fixed"
  /** This month: the average will start using it next month. */
  | "this_month"
  /** Before those months, so it no longer affects the forecast. */
  | "older"

/** One bank movement, with its lines on running-cost accounts added together. */
export type RunningCostCharge = {
  sourceId: string
  date: string
  amount: string
  oneOff: boolean
  status: RunningCostStatus
  /** Marking a charge only matters if the average uses it now or will later. */
  canMark: boolean
}

export type RunningCostGroup = {
  key: string
  label: string
  /** Charged in more than one month. */
  recurring: boolean
  total: string
  /** What this adds to the monthly forecast. */
  perMonth: string
  /** The director's known monthly amount, if there is one. */
  fixedAmount: string | null
  charges: RunningCostCharge[]
}

export type RunningCostMonth = {
  month: string
  spent: string
  forecast: string
  total: string
  oneOffs: string
  /** One of the three months the average uses. */
  inAverage: boolean
}

export type RunningCostTally = {
  average: string
  /** The plain three-month average, before one-offs and fixed amounts. */
  averageFromBank: string
  /** Spent so far, in every month listed. */
  spent: string
  /** Still to come, at the average, up to the last forecast month. */
  forecast: string
  total: string
  months: RunningCostMonth[]
  /** Biggest effect on the average first. */
  recurring: RunningCostGroup[]
  single: RunningCostGroup[]
}

/** Every running cost from the bank, by who was paid, and what the forecast adds. */
function runningCostTally(
  input: ForecastInput,
  shown: MonthBreakdown[]
): RunningCostTally {
  const thisMonth = monthStart(input.today)
  const windowStart = addMonths(thisMonth, -3)
  const oneOffs = new Set(input.oneOffCosts)
  const contactName = new Map(input.contacts.map((c) => [c.id, c.name]))
  const fixedBy = new Map(
    input.fixedCosts.map((f) => [f.supplierKey, money(f.amountGbp)])
  )

  type Raw = {
    sourceId: string
    date: string
    amount: Dec
    contactId: string | null
    description: string | null
  }
  const bySource = new Map<string, Raw>()
  for (const l of input.cash) {
    if (l.kind !== "running_cost") continue
    const hit = bySource.get(l.sourceId)
    if (hit) hit.amount = hit.amount.plus(runningCostOf(l))
    else
      bySource.set(l.sourceId, {
        sourceId: l.sourceId,
        date: l.date,
        amount: runningCostOf(l),
        contactId: l.contactId,
        description: l.description,
      })
  }

  const keyOf = runningCostKey
  const statusOf = (r: Raw): RunningCostStatus => {
    if (r.date < windowStart) return "older"
    if (fixedBy.has(keyOf(r))) return "fixed"
    if (r.date >= thisMonth) return "this_month"
    return oneOffs.has(r.sourceId) ? "one_off" : "in_average"
  }
  const groups = new Map<string, Raw[]>()
  for (const r of bySource.values())
    groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r])
  // A fixed amount always stays visible, so it can be changed or cleared.
  for (const key of fixedBy.keys()) if (!groups.has(key)) groups.set(key, [])

  // Sorted ignoring one-offs, so ticking one doesn't move anything on the page.
  const windowSpend = (key: string) =>
    sum(
      (groups.get(key) ?? [])
        .filter((r) => r.date >= windowStart && r.date < thisMonth)
        .map((r) => r.amount)
    )
  const built = [...groups.entries()]
    .map(([key, raws]): RunningCostGroup => {
      const sorted = [...raws].sort((a, b) => b.date.localeCompare(a.date))
      const first = sorted[0]
      return {
        key,
        label:
          contactName.get(key) ||
          first?.description ||
          key.replace(/^text:/, "") ||
          "No description",
        recurring: new Set(raws.map((r) => monthStart(r.date))).size > 1,
        total: money(sum(raws.map((r) => r.amount))),
        perMonth:
          fixedBy.get(key) ??
          money(
            sum(
              raws
                .filter((r) => statusOf(r) === "in_average")
                .map((r) => r.amount)
            ).div(3)
          ),
        fixedAmount: fixedBy.get(key) ?? null,
        charges: sorted.map((r) => ({
          sourceId: r.sourceId,
          date: r.date,
          amount: money(r.amount),
          oneOff: oneOffs.has(r.sourceId),
          status: statusOf(r),
          canMark: statusOf(r) !== "older" && statusOf(r) !== "fixed",
        })),
      }
    })
    .sort(
      (a, b) =>
        windowSpend(b.key).comparedTo(windowSpend(a.key)) ||
        new D(b.total).comparedTo(a.total) ||
        a.label.localeCompare(b.label)
    )

  const raws = [...bySource.values()]
  const firstDisplayed = shown[0]?.month ?? thisMonth
  const earlier = [
    ...new Set(
      raws.map((r) => monthStart(r.date)).filter((m) => m < firstDisplayed)
    ),
  ].sort()
  const spentIn = (month: string) =>
    sum(raws.filter((r) => monthStart(r.date) === month).map((r) => r.amount))
  const months = [
    ...earlier.map((month) => ({ month, total: spentIn(month) })),
    ...shown.map((m) => ({
      month: m.month,
      total: new D(m.runningCosts).abs(),
    })),
  ].map(({ month, total }): RunningCostMonth => {
    const spent = spentIn(month)
    return {
      month,
      spent: money(spent),
      forecast: money(total.minus(spent)),
      total: money(total),
      oneOffs: money(
        sum(
          raws
            .filter(
              (r) => monthStart(r.date) === month && oneOffs.has(r.sourceId)
            )
            .map((r) => r.amount)
        )
      ),
      inAverage: month >= windowStart && month < thisMonth,
    }
  })

  const spent = sum(months.map((m) => new D(m.spent)))
  const total = sum(months.map((m) => new D(m.total)))
  return {
    average: money(runningCostAverage(input)),
    averageFromBank: money(runningCostAverage(input, { fromBankOnly: true })),
    spent: money(spent),
    forecast: money(total.minus(spent)),
    total: money(total),
    months,
    recurring: built.filter((g) => g.recurring),
    single: built.filter((g) => !g.recurring),
  }
}

// ------------------------------------------------------------------ the whole thing

/** Complete months before this one, from bank lines. Dividends aren't counted anywhere. */
function cashHistory(input: ForecastInput): CashMonth[] {
  const first = monthStart(input.today)
  const contactOf = new Map(
    input.invoices.map((i) => [i.invoiceId, i.contactId ?? null])
  )
  const nameOf = new Map(input.contacts.map((c) => [c.id, c.name]))
  const months = [
    ...new Set(
      input.cash.filter((l) => l.date < first).map((l) => monthStart(l.date))
    ),
  ].sort()
  return months.map((month) => {
    const lines = input.cash.filter((l) => monthStart(l.date) === month)
    const total = (...kinds: CashKind[]) =>
      money(
        sum(
          lines
            .filter((l) => kinds.includes(l.kind))
            .map((l) => new D(l.amount))
        )
      )
    return {
      month,
      moneyIn: total("client_payment", "other_in"),
      contractors: total("contractor_payment"),
      running: total("running_cost"),
      salaries: total("director_salary"),
      other: total("vat_payment"),
      setAsides: total("set_aside"),
      fromReserve: total("backstop_in"),
      clients: [
        ...lines
          .filter((l) => l.kind === "client_payment" || l.kind === "other_in")
          .reduce((byName, l) => {
            const contact = l.salesInvoiceId
              ? contactOf.get(l.salesInvoiceId)
              : null
            const name = contact
              ? (nameOf.get(contact) ?? "Other money in")
              : "Other money in"
            return byName.set(name, (byName.get(name) ?? ZERO).plus(l.amount))
          }, new Map<string, Dec>())
          .entries(),
      ]
        .sort((a, b) => b[1].comparedTo(a[1]))
        .map(([label, amount]) => ({ label, amount: money(amount) })),
    }
  })
}

/** Directors split take-home equally. With none set up, nothing is divided. */
function directorCount(input: ForecastInput): number {
  return Math.max(input.people.filter((p) => p.kind === "director").length, 1)
}

function monthRows(
  input: ForecastInput,
  prepared: Prepared,
  sim: SimResult,
  month: string,
  opening: Dec
): Omit<
  MonthBreakdown,
  | "holdBack"
  | "holdBackSource"
  | "suggestedHoldBack"
  | "holdBackReason"
  | "afterPayout"
  | "setAsideOwedAtPayout"
  | "vatOwedAtPayout"
  | "shortfall"
> {
  const end = monthEnd(month)
  const inMonth = sim.events.filter((e) => e.date >= month && e.date <= end)
  const total = (...types: EventType[]) =>
    sum(
      inMonth.filter((e) => types.includes(e.type)).map((e) => new D(e.amount))
    )

  const invoicesLanding = total("client_payment", "expected_invoice")
  const backstopIn = total("backstop_in")
  const otherIn = total("other_in", "other_transfer_in")
  const contractorBills = total("contractor_payment", "contractor_bill")
  const setAsides = total("set_aside", "reserve_repayment")
  const vatPayments = total("vat_payment")
  const otherTransfersOut = total("other_transfer_out")
  const runningCosts = total("running_cost")
  const adjustments = total("adjustment", "manual_balance")
  const directorPay = total("director_salary", "dividend", "director_payout")

  const closing = opening
    .plus(invoicesLanding)
    .plus(backstopIn)
    .plus(otherIn)
    .plus(contractorBills)
    .plus(setAsides)
    .plus(vatPayments)
    .plus(otherTransfersOut)
    .plus(runningCosts)
    .plus(adjustments)
    .plus(directorPay)

  const lastEvent = inMonth.at(-1)
  const addsUp = lastEvent ? new D(lastEvent.balance).equals(closing) : true
  const payout = sim.payouts.get(month) ?? ZERO

  return {
    month,
    opening: money(opening),
    invoicesLanding: money(invoicesLanding),
    backstopIn: money(backstopIn),
    otherIn: money(otherIn),
    contractorBills: money(contractorBills),
    setAsides: money(setAsides),
    vatPayments: money(vatPayments),
    otherTransfersOut: money(otherTransfersOut),
    runningCosts: money(runningCosts),
    adjustments: money(adjustments),
    directorPay: money(directorPay),
    closing: money(closing),
    vatOwed: money(prepared.vatOwedOn(end)),
    payout: money(payout),
    takeHomePerDirector: money(
      penny(directorPay.negated().div(directorCount(input)))
    ),
    payoutDate: lastWorkingDay(month, new Set(input.holidays)),
    addsUp,
  }
}

/** The unpaid bills a payment could close: stored ones, plus calculated ones. */
export function openBills(input: ForecastInput): OpenBill[] {
  const stored: OpenBill[] = input.bills
    .filter((b) => b.paidSource === null && b.paidOn === null)
    .map((b) => ({
      id: b.id,
      personId: b.personId,
      issuedOn: b.issuedOn,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      amount: money(b.amountGbp),
      dueOn: b.dueOn,
    }))
  const lastDay = monthEnd(
    addMonths(monthStart(input.today), input.settings.months)
  )
  const book = new DayBook(input)
  const invoices = buildInvoices(input, book, lastDay)
  const calculated = forecastBills(input, book, invoices, lastDay)
    .filter((b) => b.issuedOn <= input.today)
    .map((b) => ({
      id: null,
      personId: b.personId,
      issuedOn: b.issuedOn,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      amount: money(b.amount),
      dueOn: b.dueOn,
    }))
  return [...stored, ...calculated]
}

/** Today's forecast invoice amounts, for the Accuracy section. */
export function snapshotRows(
  invoices: BuiltInvoice[],
  today: string
): {
  snapshotDate: string
  projectId: string
  invoiceDate: string
  amountGbp: string
}[] {
  return invoices
    .filter(
      (i) =>
        i.projectId !== null && (i.status === "forecast" || i.status === "late")
    )
    .map((i) => ({
      snapshotDate: today,
      projectId: i.projectId!,
      invoiceDate: i.invoiceDate,
      amountGbp: i.amount,
    }))
}

export function runForecast(input: ForecastInput): ForecastResult {
  const missingDefaultRate = input.people
    .filter(
      (p) =>
        p.kind === "contractor" &&
        !input.payRates.some((r) => r.personId === p.id && r.projectId === null)
    )
    .map((p) => p.name)
  if (missingDefaultRate.length > 0)
    return { blocked: true, missingDefaultRate }

  const { today, settings } = input
  const first = monthStart(today)
  const displayMonths = Array.from({ length: settings.months }, (_, i) =>
    addMonths(first, i)
  )
  const displayEnd = monthEnd(displayMonths.at(-1)!)
  // One hidden month, so the last displayed month can have a suggested hold-back.
  const lastDay = monthEnd(addMonths(first, settings.months))

  const book = new DayBook(input)
  const invoices = buildInvoices(input, book, lastDay)
  const bills = forecastBills(input, book, invoices, lastDay)
  const prepared = prepare(input, invoices, bills, displayEnd, lastDay)

  const opening = new D(input.balance?.opening ?? 0)
  const directorChoice = new Map(
    input.holdBacks.map((h) => [h.month, new D(h.amountGbp)])
  )

  // Hold-backs depend on earlier months, so settle them one month at a time.
  const holdBacks = new Map<string, Dec>()
  const suggestions = new Map<
    string,
    { amount: Dec; reason: MonthBreakdown["holdBackReason"] }
  >()
  for (const month of displayMonths) {
    const trial = new Map(holdBacks)
    trial.set(month, ZERO)
    const sim = simulate(input, prepared, opening, trial)
    const short = shortfallIn(prepared, sim, month)
    const canHold = sim.payouts.has(month)
    const amount = canHold ? penny(short.amount) : ZERO
    suggestions.set(month, {
      amount,
      reason: short.day
        ? {
            shortOn: short.day,
            shortBy: money(penny(short.amount)),
            bills: billsPaidBetween(sim, addMonths(month, 1), short.day),
            nextInvoice: nextInvoiceAfter(sim, short.day),
          }
        : null,
    })
    holdBacks.set(month, directorChoice.get(month) ?? amount)
  }
  const sim = simulate(input, prepared, opening, holdBacks)

  const months: MonthBreakdown[] = []
  let running = opening
  for (const month of displayMonths) {
    const rows = monthRows(input, prepared, sim, month, running)
    running = new D(rows.closing)
    const suggestion = suggestions.get(month)!
    const chosen = directorChoice.has(month)
    const held = holdBacks.get(month) ?? ZERO
    const after = shortfallIn(prepared, sim, month)
    months.push({
      ...rows,
      holdBack: money(held),
      holdBackSource: chosen ? "director" : held.gt(0) ? "suggested" : "none",
      suggestedHoldBack: money(suggestion.amount),
      holdBackReason: suggestion.reason,
      afterPayout: money(
        (sim.endOfDay.get(rows.payoutDate) ?? ZERO).minus(
          sim.payouts.get(month) ?? ZERO
        )
      ),
      setAsideOwedAtPayout: money(prepared.setAsideOwedOn(rows.payoutDate)),
      vatOwedAtPayout: money(prepared.vatOwedOn(rows.payoutDate)),
      shortfall: money(penny(after.amount)),
    })
  }

  const billPlans: BillPlan[] = prepared.billPlans
    .map((plan) => {
      const match = [...sim.paidOn.entries()].find(
        ([b]) =>
          b.personId === plan.personId &&
          b.issuedOn === plan.issuedOn &&
          b.id === plan.id
      )
      return { ...plan, expectedPayOn: match?.[1] ?? null }
    })
    .sort((a, b) => a.issuedOn.localeCompare(b.issuedOn))

  const timeline = sim.events.filter((e) => e.date <= displayEnd)
  const warnings = buildWarnings(input, invoices, months, opening)

  return {
    blocked: false,
    today,
    months,
    invoices: invoices.map(stripBuilt),
    expectedMoney: expectedMoney(input, invoices, displayEnd),
    bills: billPlans.filter((b) => b.issuedOn <= displayEnd),
    timeline,
    warnings,
    runningCostAverage: money(runningCostAverage(input)),
    runningCosts: runningCostTally(input, months),
    buffer: money(settings.bufferGbp),
    taxReserveBalance: input.taxReserveBalance,
    directorCount: directorCount(input),
    salaryPerMonth: money(
      new D(settings.directorSalaryGbp).times(
        input.people.filter((p) => p.kind === "director").length
      )
    ),
    cashHistory: cashHistory(input),
    contractors: input.people
      .filter((p) => p.kind === "contractor")
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b)),
  }
}

function stripBuilt(b: Built): BuiltInvoice {
  const { factor: _f, forecastVat: _v, dueDateRaw: _d, ...rest } = b
  void _f
  void _v
  void _d
  return rest
}

function buildWarnings(
  input: ForecastInput,
  invoices: Built[],
  months: MonthBreakdown[],
  opening: Dec
): ForecastWarning[] {
  const { today, settings } = input
  const first = monthStart(today)
  const warnings: ForecastWarning[] = []
  const nameOf = (id: string | null) =>
    input.people.find((p) => p.id === id)?.name ?? "Unknown"

  // Reconciliation: Xero's opening + actual events to date = Xero's closing.
  if (!input.balance) {
    warnings.push({
      kind: "no_balance",
      message:
        "No bank balance from Xero yet, so the forecast starts from £0. Run a sync.",
    })
  } else {
    const actual = sum(
      input.cash
        .filter((l) => l.date >= first && l.date <= today)
        .map((l) =>
          l.direction === "in" ? new D(l.amount) : new D(l.amount).negated()
        )
    )
    const difference = opening.plus(actual).minus(input.balance.closing)
    if (difference.abs().gt(1))
      warnings.push({
        kind: "reconciliation",
        message: `Timeline and Xero's balance differ by £${difference.abs().toFixed(2)}. Check bank lines from ${first} to ${today}: one is missing, duplicated or not yet synced.`,
      })
  }

  for (const m of months)
    if (!m.addsUp)
      warnings.push({
        kind: "breakdown",
        message: `The ${m.month.slice(0, 7)} breakdown doesn't add up to its closing balance.`,
      })

  // Only invoices still affecting cash: paid history before tracking is just noise.
  const unlinkedIds = new Set(
    input.cash
      .filter(
        (l) => l.kind === "client_payment" && l.date >= settings.startDate
      )
      .map((l) => l.salesInvoiceId)
  )
  for (const inv of invoices)
    if (
      !inv.linked &&
      (new D(inv.outstanding).gt(0) || unlinkedIds.has(inv.invoiceId))
    )
      warnings.push({
        kind: "invoice_not_linked",
        message: `Invoice not linked to a project: ${inv.invoiceNumber ?? "no number"}, £${inv.amount}.`,
      })

  const linked = new Set(
    input.bills.map((b) => b.paidByBankTransactionId).filter(Boolean)
  )
  // Anything paid before the first bill date is for work before the forecast began.
  const firstBill = lastFriday(settings.startDate)
  const firstBillDate =
    firstBill >= settings.startDate
      ? firstBill
      : lastFriday(addMonths(settings.startDate, 1))
  for (const p of contractorPayments(input.cash))
    if (p.date >= firstBillDate && !linked.has(p.bankTransactionId))
      warnings.push({
        kind: "contractor_paid_no_bill",
        message: `Contractor paid with no bill: ${nameOf(p.personId)}, £${p.amount} on ${p.date}.`,
      })
  for (const b of input.bills)
    if (b.paidSource === "unmatched" && b.paidAmountGbp) {
      const difference = new D(b.paidAmountGbp).minus(b.amountGbp)
      warnings.push({
        kind: "bill_unmatched",
        message: `${nameOf(b.personId)}'s bill of £${money(b.amountGbp)} was closed by a payment of £${money(b.paidAmountGbp)} (difference £${difference.toFixed(2)}).`,
      })
    }

  for (const inv of invoices)
    if (inv.status === "missed" && inv.invoiceDate >= first)
      warnings.push({
        kind: "invoice_missed",
        message: `No invoice raised for ${inv.projectName} on ${inv.invoiceDate}.`,
      })

  for (const l of runningCostsToCheck(
    input.cash.filter((c) => c.date >= first && c.date <= today)
  ))
    warnings.push({
      kind: "check_coding",
      message: `Counted as running cost: check coding. £${money(l.amount)} on ${l.date}${l.description ? `, ${l.description}` : ""}.`,
    })

  return warnings
}

// ------------------------------------------------------------------ accuracy

export type AccuracyRow = {
  invoiceId: string
  invoiceNumber: string | null
  projectName: string | null
  invoiceDate: string
  actual: string
  forecast14: string | null
  forecast7: string | null
  difference14: string | null
  difference7: string | null
}

/** Each raised invoice against what was forecast 14 and 7 days before its date. */
export function accuracyRows(
  invoices: BuiltInvoice[],
  snapshots: {
    projectId: string
    invoiceDate: string
    snapshotDate: string
    amountGbp: string
  }[]
): AccuracyRow[] {
  const latestBy = (inv: BuiltInvoice, days: number) => {
    const cutoff = addDays(inv.invoiceDate, -days)
    const hits = snapshots
      .filter(
        (s) =>
          s.projectId === inv.projectId &&
          s.invoiceDate === inv.invoiceDate &&
          s.snapshotDate <= cutoff
      )
      .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate))
    return hits[0]?.amountGbp ?? null
  }
  return invoices
    .filter((i) => i.status === "raised" && i.linked)
    .map((inv) => {
      const f14 = latestBy(inv, 14)
      const f7 = latestBy(inv, 7)
      const diff = (f: string | null) =>
        f === null ? null : money(new D(inv.amount).minus(f))
      return {
        invoiceId: inv.invoiceId!,
        invoiceNumber: inv.invoiceNumber,
        projectName: inv.projectName,
        invoiceDate: inv.invoiceDate,
        actual: inv.amount,
        forecast14: f14,
        forecast7: f7,
        difference14: diff(f14),
        difference7: diff(f7),
      }
    })
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
}

// ------------------------------------------------------------------ money in table

export type MoneyInRow = {
  key: string
  projectId: string | null
  projectName: string | null
  invoiceNumber: string | null
  invoiceDate: string
  dueDate: string
  periodStart: string
  periodEnd: string
  trackedDays: string
  forecastDays: string
  /** Days after any override. */
  totalDays: string
  amount: string
  contractorCost: string
  landsOn: string
  status: ExpectedMoney["status"]
  included: boolean
  expectedOn: string | null
  note: string | null
  hasOverride: boolean
  overrideDays: string | null
  overrideAmount: string | null
  overrideNote: string | null
  /** Forecast invoices can have their days or amount changed; raised ones can't. */
  canOverride: boolean
  clientName: string | null
  /** The whole invoice before VAT, its total with VAT, and its set-aside. */
  netAmount: string
  totalAmount: string
  setAside: string
  /** Set on a one-off invoice, with its figures before VAT for editing. */
  custom: { id: string; amount: string; cost: string; landsOn: string } | null
  customNote: string | null
}

export type MoneyInGroup = {
  kind: "month" | "later"
  /** The first of the month, for a month group. */
  month: string | null
  /** Client money that has already landed this month, so isn't listed. */
  received: string | null
  rows: MoneyInRow[]
  totalAmount: string
  totalCost: string
}

/**
 * Every unpaid and forecast invoice in one list, grouped by the month its money
 * lands. Each month's total equals "Invoices landing" in the breakdown.
 */
export function moneyInTable(
  result: Extract<ForecastResult, { blocked: false }>
): MoneyInGroup[] {
  const { today, months, invoices, expectedMoney } = result
  const end = monthEnd(months.at(-1)!.month)
  const expected = new Map(expectedMoney.map((m) => [m.key, m]))

  const rows: MoneyInRow[] = invoices.flatMap((inv) => {
    if (inv.status === "missed") return []
    if (!inv.customId && inv.invoiceDate > end) return []
    const m = expected.get(inv.key)
    // A forecast invoice at £0 stays listed, so its override can be changed back.
    if (!m && inv.status === "raised") return []
    const wanted = m?.expectedOn ?? inv.dueDate
    const wouldLand = wanted > today ? wanted : today
    return [
      {
        key: inv.key,
        projectId: inv.projectId,
        projectName: inv.projectName,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        trackedDays: inv.trackedDays,
        forecastDays: inv.forecastDays,
        totalDays: inv.totalDays,
        amount: m?.amount ?? "0.00",
        contractorCost: inv.contractorCost,
        // A left-out invoice keeps its place, at the date it would have landed.
        landsOn: m?.landsOn ?? wouldLand,
        status: m?.status ?? (inv.status === "late" ? "late" : "forecast"),
        included: m?.included ?? true,
        expectedOn: m?.expectedOn ?? null,
        note: m?.note ?? null,
        hasOverride: inv.hasOverride,
        overrideDays: inv.overrideDays,
        overrideAmount: inv.overrideAmount,
        overrideNote: inv.overrideNote,
        canOverride: inv.status !== "raised" && inv.projectId !== null,
        clientName: inv.clientName ?? null,
        netAmount: inv.amount,
        totalAmount: inv.total,
        setAside: inv.setAside,
        custom: inv.customId
          ? {
              id: inv.customId,
              amount: inv.amount,
              cost: inv.contractorCost,
              landsOn: inv.invoiceDate,
            }
          : null,
        customNote: inv.customNote ?? null,
      },
    ]
  })

  const group = (
    kind: MoneyInGroup["kind"],
    month: string | null,
    list: MoneyInRow[],
    received: Dec | null
  ): MoneyInGroup => {
    // Left-out rows stay listed, but only counted ones add up.
    const counted = list.filter((r) => r.included)
    const amounts = sum(counted.map((r) => new D(r.amount)))
    return {
      kind,
      month,
      received: received === null ? null : money(received),
      rows: [...list].sort((a, b) => a.landsOn.localeCompare(b.landsOn)),
      totalAmount: money(amounts.plus(received ?? ZERO)),
      totalCost: money(sum(counted.map((r) => new D(r.contractorCost)))),
    }
  }

  const groups = months.map((m) => {
    const list = rows.filter((r) => monthStart(r.landsOn) === m.month)
    const listed = sum(
      list.filter((r) => r.included).map((r) => new D(r.amount))
    )
    return group("month", m.month, list, new D(m.invoicesLanding).minus(listed))
  })
  const later = rows.filter((r) => r.landsOn > end)
  if (later.length) groups.push(group("later", null, later, null))
  return groups
}

// ------------------------------------------------------------------ timeline view

export type TimelineCategory =
  "money_in" | "contractors" | "set_asides" | "directors" | "running" | "other"

const CATEGORY_OF: Record<EventType, TimelineCategory> = {
  client_payment: "money_in",
  expected_invoice: "money_in",
  backstop_in: "other",
  other_transfer_in: "other",
  other_in: "other",
  set_aside: "set_asides",
  other_transfer_out: "other",
  vat_payment: "other",
  contractor_payment: "contractors",
  contractor_bill: "contractors",
  director_salary: "directors",
  dividend: "directors",
  director_payout: "directors",
  reserve_repayment: "set_asides",
  running_cost: "running",
  adjustment: "other",
  manual_balance: "other",
}

export type TimelineRow = {
  date: string
  label: string
  category: TimelineCategory
  source: Source
  actual: boolean
  moneyIn: string | null
  moneyOut: string | null
  balance: string
}

export type TimelineMonth = {
  month: string
  totalIn: string
  totalOut: string
  closing: string
  lowest: string
  lowestOn: string
  rows: TimelineRow[]
}

/** The timeline by month, each with the figures worth seeing before opening it. */
export function timelineMonths(
  result: Extract<ForecastResult, { blocked: false }>
): TimelineMonth[] {
  return result.months.map((m) => {
    const events = result.timeline.filter((e) => monthStart(e.date) === m.month)
    const amounts = events.map((e) => new D(e.amount))
    let lowest = new D(m.opening)
    let lowestOn = m.month
    for (const e of events)
      if (new D(e.balance).lt(lowest)) {
        lowest = new D(e.balance)
        lowestOn = e.date
      }
    return {
      month: m.month,
      totalIn: money(sum(amounts.filter((x) => x.gt(0)))),
      totalOut: money(sum(amounts.filter((x) => x.lt(0))).negated()),
      closing: m.closing,
      lowest: money(lowest),
      lowestOn,
      rows: events.map((e) => {
        const amount = new D(e.amount)
        return {
          date: e.date,
          label: e.label,
          category: CATEGORY_OF[e.type],
          source: e.source,
          actual: e.actual,
          moneyIn: amount.gt(0) ? money(amount) : null,
          moneyOut: amount.lt(0) ? money(amount.negated()) : null,
          balance: e.balance,
        }
      }),
    }
  })
}

// ------------------------------------------------------------------ accuracy view

export type AccuracySummary = {
  compared: number
  /** Average size of the miss, ignoring direction. Null with nothing to compare. */
  averageMiss14: number | null
  averageMiss7: number | null
  /** Forecast above actual is positive overall, so it shows which way it leans. */
  lean7: "over" | "under" | "even" | null
  rows: AccuracyRow[]
}

/** Only invoices with a forecast to compare; the rest just say "nothing recorded". */
export function accuracySummary(rows: AccuracyRow[]): AccuracySummary {
  const compared = rows.filter(
    (r) => r.forecast14 !== null || r.forecast7 !== null
  )
  const averageMiss = (pick: (r: AccuracyRow) => string | null) => {
    const misses = compared.flatMap((r) => {
      const f = pick(r)
      if (f === null || new D(r.actual).isZero()) return []
      return [new D(f).minus(r.actual).abs().div(r.actual)]
    })
    return misses.length
      ? sum(misses).div(misses.length).toDecimalPlaces(4).toNumber()
      : null
  }
  const net7 = sum(
    compared.flatMap((r) =>
      r.forecast7 === null ? [] : [new D(r.forecast7).minus(r.actual)]
    )
  )
  const has7 = compared.some((r) => r.forecast7 !== null)
  return {
    compared: compared.length,
    averageMiss14: averageMiss((r) => r.forecast14),
    averageMiss7: averageMiss((r) => r.forecast7),
    lean7: !has7 ? null : net7.gt(0) ? "over" : net7.lt(0) ? "under" : "even",
    rows: compared,
  }
}

// ------------------------------------------------------------------ charts

export type ForecastCharts = {
  today: string
  /** End-of-day balance. `actual` and `forecast` meet on today, so the line joins. */
  balance: { date: string; actual: number | null; forecast: number | null }[]
  moneyOut: {
    series: { key: string; label: string }[]
    months: ({ month: string } & Record<string, number | string>)[]
  }
}

const OUT_GROUPS: { key: string; label: string; types: EventType[] }[] = [
  {
    key: "contractors",
    label: "Contractor bills",
    types: ["contractor_payment", "contractor_bill"],
  },
  { key: "setAsides", label: "Set-asides", types: ["set_aside"] },
  { key: "running", label: "Running costs", types: ["running_cost"] },
  {
    key: "directors",
    label: "Director pay",
    types: ["director_salary", "dividend", "director_payout"],
  },
]

/** The Forecast page's charts, from the engine's own figures. For display only. */
export function forecastCharts(
  result: Extract<ForecastResult, { blocked: false }>
): ForecastCharts {
  const { today, months, timeline } = result
  const first = months[0].month
  const end = monthEnd(months.at(-1)!.month)
  const monthOf = (d: string) => monthStart(d)

  // -------- balance: each day's last event, carried forward
  const lastOnDay = new Map<string, string>()
  for (const e of timeline) lastOnDay.set(e.date, e.balance)
  const balance: ForecastCharts["balance"] = []
  let running = Number(months[0].opening)
  for (let d = first; d <= end; d = addDays(d, 1)) {
    const hit = lastOnDay.get(d)
    if (hit !== undefined) running = Number(hit)
    balance.push({
      date: d,
      actual: d <= today ? running : null,
      forecast: d >= today ? running : null,
    })
  }

  // -------- money out, by what it's for
  const grouped = new Set(OUT_GROUPS.flatMap((g) => g.types))
  const outEvents = timeline.filter((e) => new D(e.amount).lt(0))
  const moneyOut = months.map((m) => {
    const inMonth = outEvents.filter((e) => monthOf(e.date) === m.month)
    const total = (list: TimelineEvent[]) =>
      sum(list.map((e) => new D(e.amount).negated())).toNumber()
    const row: { month: string } & Record<string, number | string> = {
      month: m.month,
    }
    for (const g of OUT_GROUPS)
      row[g.key] = total(inMonth.filter((e) => g.types.includes(e.type)))
    row.other = total(inMonth.filter((e) => !grouped.has(e.type)))
    return row
  })
  const outSeries = OUT_GROUPS.map(({ key, label }) => ({ key, label }))
  if (moneyOut.some((row) => Number(row.other) > 0))
    outSeries.push({ key: "other", label: "Other" })

  return {
    today,
    balance,
    moneyOut: { series: outSeries, months: moneyOut },
  }
}

// ------------------------------------------------------------------ copy for chat

const pad = (s: string, n: number) => s.padEnd(n)
const padLeft = (s: string, n: number) => s.padStart(n)

/** The monthly breakdown as fixed-width text, for chat apps that don't render tables. */
export function breakdownText(months: MonthBreakdown[]): string {
  const rows: [string, (m: MonthBreakdown) => string][] = [
    ["Opening balance", (m) => m.opening],
    ["Invoices landing", (m) => m.invoicesLanding],
    ["Back from tax reserve", (m) => m.backstopIn],
    ["Other money in", (m) => m.otherIn],
    ["Contractor bills", (m) => m.contractorBills],
    ["Set-asides", (m) => m.setAsides],
    ["VAT payments", (m) => m.vatPayments],
    ["Other transfers out", (m) => m.otherTransfersOut],
    ["Running costs", (m) => m.runningCosts],
    ["Adjustments", (m) => m.adjustments],
    ["Director pay", (m) => m.directorPay],
    ["Closing balance", (m) => m.closing],
    ["VAT owed", (m) => m.vatOwed],
    ["Hold-back", (m) => m.holdBack],
    ["Take-home per director", (m) => m.takeHomePerDirector],
  ]
  const label = Math.max(...rows.map(([l]) => l.length))
  const width = 12
  const line = (l: string, cells: string[]) =>
    `${pad(l, label)}  ${cells.map((c) => padLeft(c, width)).join(" ")}`.trimEnd()
  const header = line(
    "",
    months.map((m) => m.month.slice(0, 7))
  )
  const rule = "-".repeat(label + 2 + months.length * (width + 1) - 1)
  return [
    header,
    rule,
    ...rows.map(([l, get]) => line(l, months.map(get))),
  ].join("\n")
}
