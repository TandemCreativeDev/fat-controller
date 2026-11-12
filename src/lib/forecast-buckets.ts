import Decimal from "decimal.js"

import {
  NEUTRAL_COLOUR,
  SERIES_SLOTS,
  seriesColour,
} from "@/lib/forecast-colours"
import {
  moneyInTable,
  monthStart,
  type ForecastResult,
  type MoneyInRow,
} from "@/lib/forecast"

/**
 * The money in view: each invoice in the payout it lands in, grouped by client,
 * with what it adds to take-home per director. Pure, so the sums are tested here;
 * the component only displays them. Money stays in decimal.js, half-up to the penny.
 */

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
type Dec = InstanceType<typeof D>
const ZERO = new D(0)
const money = (d: Decimal.Value) => new D(d).toFixed(2)
const penny = (d: Decimal.Value) => new D(d).toDecimalPlaces(2)
const sum = (xs: Dec[]) => xs.reduce((t, x) => t.plus(x), ZERO)

export type BucketKind = "raised" | "overdue" | "predicted"

export type BucketInvoice = {
  row: MoneyInRow
  kind: BucketKind
  /** The project, without a client prefix that repeats the group header. */
  title: string
  /** What this adds to take-home per director; contractor cost is paid either way. */
  each: string
  /** When the money is expected: a director's date, or the due date. */
  dueOn: string
  /** The muted line under the dates. */
  detail: string
}

/** Invoices from one billing run: the same due date and the same raise date. */
export type InvoiceRun = {
  dueDate: string
  raiseDate: string
  invoices: BucketInvoice[]
  /** What the ticked invoices add up to; left-out ones count for nothing. */
  total: string
}

export type ClientGroup = {
  client: string
  /** The same colour as this client's part of the bar, on every tab. */
  colour: string
  invoices: BucketInvoice[]
  /** The same invoices, by billing run. */
  runs: InvoiceRun[]
  /** Included invoices only. */
  total: string
  each: string
  /** Days invoiced or forecast on included invoices, across all the client's projects. */
  days: string
}

/** One client's part of a month's money in, for the split bar and its legend. */
export type BucketSegment = {
  key: string
  label: string
  amount: string
  /** Exact share for the bar's width. */
  percent: number
  /** Whole-number share for the legend. */
  percentLabel: number
  /** The chart colour slot, fixed per client across months. Null is neutral. */
  colorSlot: number | null
  colour: string
  /** Days on the included invoices. Blank where there are no invoices to count. */
  days?: string
}

export type PayoutBucket = {
  /** Null for invoices landing after the months shown. */
  month: string | null
  payoutDate: string | null
  /** Included invoices, plus anything already received this month. */
  totalIn: string
  /** The month's take-home per director. Null for invoices after the months shown. */
  takeHome: string | null
  /** What the take-home is made of, in words. */
  takeHomeNote: string | null
  /** Invoices less set-asides, shared between directors. Not take-home. */
  each: string
  /** Days invoiced or forecast on included invoices, across all clients. */
  days: string
  /** Client money that has already landed this month, and so isn't listed. */
  received: string
  raised: string
  predicted: string
  /** Who the month's money comes from: every client, in the order of the groups. */
  segments: BucketSegment[]
  leftOut: { count: number; worth: string; each: string } | null
  clients: ClientGroup[]
}

/** Everything a client could bring in this month, ticked or not. */
const grossTotal = (group: ClientGroup): Dec =>
  sum(group.invoices.map((i) => new D(i.row.amount)))

const kindOf = (row: MoneyInRow): BucketKind =>
  row.status === "overdue"
    ? "overdue"
    : row.status === "raised"
      ? "raised"
      : "predicted"

/**
 * Take-home per director from this invoice: what's still to land before VAT, less
 * that share of its set-aside, split between the directors.
 */
export function invoiceShare(row: MoneyInRow, directors: number): string {
  const total = new D(row.totalAmount)
  if (total.isZero()) return "0.00"
  const landing = new D(row.amount).div(total)
  const kept = landing.times(new D(row.netAmount).minus(row.setAside))
  return money(penny(kept.div(directors)))
}

/** "Acme Portal" under the client "ACME HOLDINGS LTD" reads as "Portal". */
export function projectTitle(name: string, client: string): string {
  const first = client.split(/\s+/)[0]?.toLowerCase()
  const words = name.split(/\s+/)
  return first && words.length > 1 && words[0].toLowerCase() === first
    ? words.slice(1).join(" ")
    : name
}

const days = (d: string) => new D(d).toFixed(2)

/** Says where a figure came from, leaving out the parts that are zero. */
export function invoiceDetail(
  row: MoneyInRow,
  formatMoney: (amount: string) => string
): string {
  const cost = new D(row.contractorCost).isZero()
    ? "No contractor cost"
    : `Contractor cost ${formatMoney(row.contractorCost)}`
  if (kindOf(row) !== "predicted") return cost
  const costSuffix = new D(row.contractorCost).isZero()
    ? "no cost"
    : `cost ${formatMoney(row.contractorCost)}`
  if (row.custom) return `One-off, added by hand · ${costSuffix}`
  const tracked = new D(row.trackedDays)
  const forecast = new D(row.forecastDays)
  const basis =
    tracked.gt(0) && forecast.gt(0)
      ? `From ${days(row.trackedDays)} tracked + ${days(row.forecastDays)} forecast days`
      : forecast.gt(0)
        ? `${days(row.forecastDays)} days forecast, none tracked yet`
        : tracked.gt(0)
          ? `From ${days(row.trackedDays)} days tracked`
          : "No time tracked or forecast yet"
  const set =
    row.overrideDays !== null || row.overrideAmount !== null
      ? ` · set to ${days(row.totalDays)} days`
      : row.capped
        ? ` · capped at ${days(row.totalDays)} days`
        : ""
  return `${basis}${set} · ${costSuffix}`
}

/** Earliest due date first. Invoices inside a run stay in the order they came. */
export function groupInvoicesIntoRuns(invoices: BucketInvoice[]): InvoiceRun[] {
  const runs = new Map<string, BucketInvoice[]>()
  for (const invoice of invoices) {
    const key = `${invoice.dueOn}|${invoice.row.invoiceDate}`
    runs.set(key, [...(runs.get(key) ?? []), invoice])
  }
  return [...runs.values()]
    .map((list) => ({
      dueDate: list[0].dueOn,
      raiseDate: list[0].row.invoiceDate,
      invoices: list,
      total: money(
        sum(list.filter((i) => i.row.included).map((i) => new D(i.row.amount)))
      ),
    }))
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.raiseDate.localeCompare(b.raiseDate)
    )
}

function buildBucket(
  month: string | null,
  payoutDate: string | null,
  takeHome: string | null,
  takeHomeNote: string | null,
  rows: MoneyInRow[],
  received: Dec,
  directors: number,
  formatMoney: (amount: string) => string
): PayoutBucket {
  const invoices = rows.map((row): BucketInvoice => {
    const client = row.clientName ?? noClient(row)
    return {
      row,
      kind: kindOf(row),
      title: projectTitle(row.projectName ?? "No project", client),
      each: invoiceShare(row, directors),
      dueOn: row.expectedOn ?? row.dueDate,
      detail: invoiceDetail(row, formatMoney),
    }
  })

  const included = invoices.filter((i) => i.row.included)
  const left = invoices.filter((i) => !i.row.included)
  const addAmounts = (list: BucketInvoice[]) =>
    sum(list.map((i) => new D(i.row.amount)))
  const addEach = (list: BucketInvoice[]) => sum(list.map((i) => new D(i.each)))

  const raised = addAmounts(
    included.filter((i) => i.kind !== "predicted")
  ).plus(received)
  const predicted = addAmounts(included.filter((i) => i.kind === "predicted"))
  const totalIn = raised.plus(predicted)
  const byClient = new Map<string, BucketInvoice[]>()
  for (const i of invoices) {
    const client = i.row.clientName ?? noClient(i.row)
    byClient.set(client, [...(byClient.get(client) ?? []), i])
  }
  const clients = [...byClient.entries()]
    .map(([client, list]): ClientGroup => {
      const counted = list.filter((i) => i.row.included)
      return {
        client,
        colour: NEUTRAL_COLOUR,
        invoices: [...list].sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
        runs: groupInvoicesIntoRuns(list),
        total: money(addAmounts(counted)),
        each: money(addEach(counted)),
        days: days(sum(counted.map((i) => new D(i.row.totalDays))).toFixed(4)),
      }
    })
    // Ticking an invoice must not reorder anything, so left-out ones count here too.
    .sort(
      (a, b) =>
        b.invoices.length - a.invoices.length ||
        grossTotal(b).comparedTo(grossTotal(a)) ||
        a.client.localeCompare(b.client)
    )

  return {
    month,
    payoutDate,
    takeHome,
    takeHomeNote,
    totalIn: money(totalIn),
    days: days(sum(included.map((i) => new D(i.row.totalDays))).toFixed(4)),
    each: money(addEach(included)),
    received: money(received),
    raised: money(raised),
    predicted: money(predicted),
    segments: [],
    leftOut: left.length
      ? {
          count: left.length,
          worth: money(addAmounts(left)),
          each: money(addEach(left)),
        }
      : null,
    clients,
  }
}

const noClient = (row: MoneyInRow) => (row.custom ? "One-off" : "No client")

function segmentsFor(
  bucket: PayoutBucket,
  slots: Map<string, number>
): BucketSegment[] {
  const total = new D(bucket.totalIn)
  const segment = (
    key: string,
    label: string,
    amount: Dec,
    colorSlot: number | null,
    dayCount?: string
  ): BucketSegment => {
    // Nothing ticked means an empty bar and 0% all round, not a division by zero.
    const share = total.isZero() ? ZERO : amount.div(total).times(100)
    return {
      key,
      label,
      amount: money(amount),
      percent: share.toDecimalPlaces(2).toNumber(),
      percentLabel: share.toDecimalPlaces(0).toNumber(),
      colorSlot,
      colour: seriesColour(colorSlot),
      days: dayCount,
    }
  }
  // Every client stays, in the order of the groups below, whatever's ticked.
  const named = bucket.clients
    .filter((c) => slots.has(c.client))
    .map((c) =>
      segment(c.client, c.client, new D(c.total), slots.get(c.client)!, c.days)
    )
  const unnamed = bucket.clients.filter((c) => !slots.has(c.client))
  const received = new D(bucket.received)
  return [
    ...named,
    ...(unnamed.length
      ? [
          segment(
            "other",
            "Other clients",
            sum(unnamed.map((c) => new D(c.total))),
            null,
            days(
              sum(
                unnamed.flatMap((c) =>
                  c.invoices
                    .filter((i) => i.row.included)
                    .map((i) => new D(i.row.totalDays))
                )
              ).toFixed(4)
            )
          ),
        ]
      : []),
    ...(received.gt(0)
      ? [segment("received", "Already received", received, null)]
      : []),
  ]
}

/** The id of a client's invoices in one month, so a link can go straight to them. */
export const clientAnchor = (client: string, month: string) =>
  `client-${month.slice(0, 7)}-${client.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

/**
 * Take-home is the whole month-end payout, so it's salary and dividend together.
 * The salary comes first; only what's above it is dividend.
 */
export function takeHomeNote(
  result: Extract<ForecastResult, { blocked: false }>,
  takeHome: string,
  formatMoney: (amount: string) => string
): string {
  const salary = new D(result.salaryPerMonth).div(
    Math.max(result.directorCount, 1)
  )
  if (salary.isZero()) return "Salary and dividend together"
  const total = new D(takeHome)
  if (total.lt(salary))
    return `${formatMoney(money(total))} salary, ${formatMoney(money(salary.minus(total)))} short of the full salary, no dividend`
  const dividend = total.minus(salary)
  return dividend.isZero()
    ? `${formatMoney(money(salary))} salary, no dividend`
    : `${formatMoney(money(salary))} salary + ${formatMoney(money(dividend))} dividend`
}

/** One bucket per month shown, then one for anything landing after them. */
export function payoutBuckets(
  result: Extract<ForecastResult, { blocked: false }>,
  formatMoney: (amount: string) => string
): {
  months: PayoutBucket[]
  later: PayoutBucket | null
  /** Each client's colour, for anything else that lists clients. */
  clientColours: Record<string, string>
} {
  const groups = moneyInTable(result)
  const directors = result.directorCount
  const rows = groups.flatMap((g) => g.rows)

  const months = result.months.map((m) => {
    const inMonth = rows.filter((r) => monthStart(r.landsOn) === m.month)
    const group = groups.find((g) => g.month === m.month)
    return buildBucket(
      m.month,
      m.payoutDate,
      m.takeHomePerDirector,
      takeHomeNote(result, m.takeHomePerDirector, formatMoney),
      inMonth,
      new D(group?.received ?? 0),
      directors,
      formatMoney
    )
  })

  // A client keeps its colour across months, and across ticking: biggest overall first.
  const overall = new Map<string, Dec>()
  for (const b of months)
    for (const c of b.clients)
      overall.set(c.client, (overall.get(c.client) ?? ZERO).plus(grossTotal(c)))
  const slots = new Map(
    [...overall.entries()]
      .filter(([, total]) => total.gt(0))
      .sort((a, b) => b[1].comparedTo(a[1]) || a[0].localeCompare(b[0]))
      .slice(0, SERIES_SLOTS)
      .map(([client], i) => [client, i])
  )
  for (const b of months) {
    b.segments = segmentsFor(b, slots)
    for (const c of b.clients) c.colour = seriesColour(slots.get(c.client))
  }

  const laterRows = groups.find((g) => g.kind === "later")?.rows ?? []
  return {
    months,
    clientColours: Object.fromEntries(
      [...slots.entries()].map(([client, slot]) => [client, seriesColour(slot)])
    ),
    later: laterRows.length
      ? buildBucket(
          null,
          null,
          null,
          null,
          laterRows,
          ZERO,
          directors,
          formatMoney
        )
      : null,
  }
}
