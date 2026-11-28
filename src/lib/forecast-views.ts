import Decimal from "decimal.js"

import {
  financialYearOf,
  monthEnd,
  monthStart,
  timelineMonths,
  type BillPlan,
  type ForecastResult,
  type Source,
  type TimelineCategory,
  type TimelineRow,
  type MonthBreakdown,
} from "@/lib/forecast"
import { formatDayName } from "@/lib/format"
import {
  clientAnchor,
  payoutBuckets,
  takeHomeNote,
} from "@/lib/forecast-buckets"
import {
  CATEGORY_COLOUR,
  NEUTRAL_COLOUR,
  seriesColour,
} from "@/lib/forecast-colours"

/**
 * What the Overview, Bills and Timeline tabs display. Pure, tested, and only ever
 * rearranging the engine's figures: every total here comes from the engine.
 */

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
type Dec = InstanceType<typeof D>
const ZERO = new D(0)
const money = (d: Decimal.Value) => new D(d).toFixed(2)
const sum = (xs: Dec[]) => xs.reduce((t, x) => t.plus(x), ZERO)
type Ready = Extract<ForecastResult, { blocked: false }>

export type Part = {
  key: string
  label: string
  amount: string
  percent: number
  percentLabel: number
  colour: string
}

const partsOf = (
  total: Dec,
  items: { key: string; label: string; amount: Dec; colour: string }[]
): Part[] =>
  items.map(({ key, label, amount, colour }) => {
    const share = total.isZero() ? ZERO : amount.div(total).times(100)
    return {
      key,
      label,
      amount: money(amount),
      percent: share.toDecimalPlaces(2).toNumber(),
      percentLabel: share.toDecimalPlaces(0).toNumber(),
      colour,
    }
  })

// ------------------------------------------------------------------ month cards

export type SumRow = {
  key: string
  label: string
  amount: string
  colour: string
  /** Where to see what's behind this row. */
  href?: string
  /** Where tapping the row goes on mobile, when the whole row is a link. */
  mobileHref?: string
}

/** One month as a sum: what came in, what went out, and what that leaves. */
export type MonthSum = {
  month: string
  moneyIn: SumRow[]
  moneyInTotal: string
  moneyOut: SumRow[]
  moneyOutTotal: string
  /** Money in less money out. */
  left: string
}

const rowsTotal = (rows: SumRow[]) => sum(rows.map((r) => new D(r.amount)))

const shown = (rows: SumRow[]) => rows.filter((r) => !new D(r.amount).isZero())

const monthSum = (
  month: string,
  moneyInRows: SumRow[],
  moneyOutRows: SumRow[]
): MonthSum => {
  const moneyIn = shown(moneyInRows)
  const moneyOut = shown(moneyOutRows)
  const inTotal = rowsTotal(moneyIn)
  const outTotal = rowsTotal(moneyOut)
  return {
    month,
    moneyIn,
    moneyInTotal: money(inTotal),
    moneyOut,
    moneyOutTotal: money(outTotal),
    left: money(inTotal.minus(outTotal)),
  }
}

const row = (
  key: string,
  label: string,
  amount: Decimal.Value,
  colour: string
): SumRow => ({
  key,
  label,
  amount: money(amount),
  colour,
  ...(key === "running" ? { href: "/forecast?tab=running-costs" } : {}),
})

// ------------------------------------------------------------------ in and out

export type InOutMonth = MonthSum & {
  /** Bank only, part bank and part forecast, or all forecast. */
  basis: "actual" | "current" | "forecast"
  /** Borrowed from the tax reserve: it helped pay the bills, but it isn't income. */
  fromReserve: string
}

/**
 * Money in and money out by month, without dividends or transfers. The forecast pays
 * salary and dividends as one payout, so future months use the salary setting instead.
 */
export function inOutMonths(
  result: Ready,
  formatMoney: (amount: string) => string
): InOutMonth[] {
  const { months: buckets, clientColours } = payoutBuckets(result, formatMoney)
  const colourOf = (name: string) => clientColours[name] ?? NEUTRAL_COLOUR
  const outRows = (f: {
    contractors: Decimal.Value
    setAsides: Decimal.Value
    running: Decimal.Value
    salaries: Decimal.Value
    other: Decimal.Value
  }) => [
    row(
      "contractors",
      "Contractors",
      f.contractors,
      CATEGORY_COLOUR.contractors
    ),
    row(
      "set_asides",
      "Tax set-asides",
      f.setAsides,
      CATEGORY_COLOUR.set_asides
    ),
    row("running", "Running costs", f.running, CATEGORY_COLOUR.running),
    row("salaries", "Director salaries", f.salaries, CATEGORY_COLOUR.directors),
    row("other", "VAT and one-offs", f.other, CATEGORY_COLOUR.other),
  ]

  const past = result.cashHistory.map((h): InOutMonth => {
    // Money moved out and back in the same month is a correction, not a set-aside
    // and a withdrawal, so only what's left of either counts.
    const moved = new D(h.setAsides)
    const back = new D(h.fromReserve)
    const reversed = D.min(moved, back)
    return {
      ...monthSum(
        h.month,
        h.clients.map((c) =>
          row(c.label, c.label, c.amount, colourOf(c.label))
        ),
        outRows({ ...h, setAsides: moved.minus(reversed) })
      ),
      basis: "actual",
      fromReserve: money(back.minus(reversed)),
    }
  })

  const currentMonth = monthStart(result.today)
  const salaryPlan = new D(result.salaryPerMonth)
  const current = result.months.map((m, i): InOutMonth => {
    const events = result.timeline.filter((e) => monthStart(e.date) === m.month)
    const total = (...types: string[]) =>
      sum(
        events.filter((e) => types.includes(e.type)).map((e) => new D(e.amount))
      )
    const adjustments = events
      .filter((e) => e.type === "adjustment")
      .map((e) => new D(e.amount))
    return {
      ...monthSum(
        m.month,
        [
          ...buckets[i].segments.map((s) =>
            row(s.key, s.label, s.amount, s.colour)
          ),
          row("other_in", "Other money in", total("other_in"), NEUTRAL_COLOUR),
          row(
            "adjustments_in",
            "One-offs",
            sum(adjustments.filter((a) => a.gt(0))),
            NEUTRAL_COLOUR
          ),
        ],
        outRows({
          contractors: total("contractor_payment", "contractor_bill").abs(),
          setAsides: total("set_aside").abs(),
          running: total("running_cost").abs(),
          salaries: D.max(total("director_salary").abs(), salaryPlan),
          other: total("vat_payment")
            .abs()
            .plus(sum(adjustments.filter((a) => a.lt(0))).abs()),
        })
      ),
      basis: m.month === currentMonth ? "current" : "forecast",
      fromReserve: m.backstopIn,
    }
  })
  return [...past, ...current]
}

/** Complete months from the bank, newest first, for the collapsed history. */
export function earlierMonths(
  result: Ready,
  formatMoney: (amount: string) => string
): InOutMonth[] {
  return inOutMonths(result, formatMoney)
    .filter((m) => m.basis === "actual")
    .reverse()
}

// ------------------------------------------------------------------ overview

export type OverviewBucket = MonthSum & {
  payoutDate: string
  opening: string
  takeHome: string
  /** What the take-home is made of, in words. */
  takeHomeNote: string
  /** All directors together. */
  payout: string
  closing: string
  holdBack: string | null
  /** What's in the account straight after the payout. */
  afterPayout: string
  /** What the payout leaves behind and why. Empty when there's no payout to explain. */
  leftInBank: LeftInBank[]
  /** What the hold-back leaves uncovered next month, if anything. */
  shortfall: string | null
  taxReserve: string | null
  vatOwed: string | null
  /** The month's hold-back, editable while its payout day is still to come. */
  holdBackEdit: {
    amount: string
    /** A director set it; otherwise the buffer applies. */
    chosen: boolean
    buffer: string
  } | null
  /** Money borrowed from the tax reserve, if any is owed going into payout day. */
  reserveLoan: {
    owedBefore: string
    repaying: string
    owedAfter: string
    /** A director chose the amount, rather than repaying it all. */
    chosen: boolean
  } | null
}

export type LeftInBank = {
  key: "hold_back" | "set_asides" | "vat" | "buffer" | "after_take_home"
  label: string
  amount: string
  reason: string
}

function leftInBank(
  result: Ready,
  m: MonthBreakdown,
  formatMoney: (amount: string) => string
): LeftInBank[] {
  if (new D(m.payout).lte(0)) return []
  const rows: LeftInBank[] = [
    {
      key: "hold_back",
      label: "Held for next month",
      amount: m.holdBack,
      reason: "A director set this; it replaces the buffer.",
    },
    {
      key: "set_asides",
      label: "Tax set-asides",
      amount: m.setAsideOwedAtPayout,
      reason: "Not moved to the tax reserve yet.",
    },
    {
      key: "vat",
      label: "VAT",
      amount: m.vatOwedAtPayout,
      reason: "Owed to HMRC.",
    },
    // A hold-back a director set is everything left: the buffer doesn't apply.
    {
      key: "buffer",
      label: "Buffer",
      amount: m.holdBackSource === "director" ? "0.00" : result.buffer,
      reason: "Always left in the account.",
    },
  ]
  const shown = rows.filter((r) => new D(r.amount).gt(0))
  // Only explain what adds up: anything else would be a made-up reason.
  if (
    sum(shown.map((r) => new D(r.amount)))
      .minus(m.afterPayout)
      .abs()
      .gt(0.01)
  )
    return []
  // What moves between take-home day and the end of the month, so this adds up
  // to the closing balance that next month starts from.
  const after = new D(m.closing).minus(m.afterPayout)
  return after.isZero()
    ? shown
    : [
        ...shown,
        {
          key: "after_take_home",
          label: after.lt(0) ? "Spent after take-home" : "In after take-home",
          amount: money(after),
          reason: "",
        },
      ]
}

export function overviewBuckets(
  result: Ready,
  formatMoney: (amount: string) => string
): OverviewBucket[] {
  const clients = payoutBuckets(result, formatMoney).months
  return result.months.map((m, i): OverviewBucket => {
    const adjustment = new D(m.adjustments)
    return {
      ...monthSum(
        m.month,
        [
          ...clients[i].segments.map((s) => ({
            ...row(s.key, s.label, s.amount, s.colour),
            mobileHref: `/forecast?tab=money-in&month=${m.month.slice(0, 7)}#${clientAnchor(s.label, m.month)}`,
          })),
          row(
            "backstop",
            "From tax reserve",
            m.backstopIn,
            CATEGORY_COLOUR.other
          ),
          row("other_in", "Other money in", m.otherIn, CATEGORY_COLOUR.other),
          row(
            "adjustments_in",
            "Adjustments",
            adjustment.gt(0) ? adjustment : ZERO,
            CATEGORY_COLOUR.other
          ),
        ],
        [
          {
            ...row(
              "contractors",
              "Contractors",
              new D(m.contractorBills).abs(),
              CATEGORY_COLOUR.contractors
            ),
            mobileHref: `/forecast?tab=bills&month=${m.month.slice(0, 7)}`,
          },
          row(
            "set_asides",
            "Tax set-asides",
            new D(m.setAsides).minus(m.reserveRepaid).abs(),
            CATEGORY_COLOUR.set_asides
          ),
          row(
            "reserve_repaid",
            "Repaid to tax reserve",
            new D(m.reserveRepaid).abs(),
            CATEGORY_COLOUR.set_asides
          ),
          {
            ...row(
              "running",
              "Running costs",
              new D(m.runningCosts).abs(),
              CATEGORY_COLOUR.running
            ),
            mobileHref: `/forecast?tab=running-costs&month=${m.month.slice(0, 7)}`,
          },
          row(
            "vat",
            "VAT payments",
            new D(m.vatPayments).abs(),
            CATEGORY_COLOUR.other
          ),
          row(
            "transfers",
            "Other transfers out",
            new D(m.otherTransfersOut).abs(),
            CATEGORY_COLOUR.other
          ),
          row(
            "adjustments_out",
            "Adjustments",
            adjustment.lt(0) ? adjustment.abs() : ZERO,
            CATEGORY_COLOUR.other
          ),
        ]
      ),
      payoutDate: m.payoutDate,
      opening: m.opening,
      takeHome: m.takeHomePerDirector,
      takeHomeNote: takeHomeNote(result, m.takeHomePerDirector, formatMoney),
      payout: money(new D(m.directorPay).abs()),
      closing: m.closing,
      holdBack: new D(m.holdBack).gt(0) ? m.holdBack : null,
      afterPayout: m.afterPayout,
      leftInBank: leftInBank(result, m, formatMoney),
      shortfall: new D(m.shortfall).gt(0) ? m.shortfall : null,
      taxReserve: result.taxReserveBalance,
      vatOwed: new D(m.vatOwed).isZero() ? null : m.vatOwed,
      holdBackEdit:
        m.payoutDate >= result.today
          ? {
              amount: m.holdBack,
              chosen: m.holdBackSource === "director",
              buffer: result.buffer,
            }
          : null,
      reserveLoan:
        new D(m.reserveOwedBefore).gt(0) && m.payoutDate >= result.today
          ? {
              owedBefore: m.reserveOwedBefore,
              repaying: money(new D(m.reserveRepaid).abs()),
              owedAfter: m.reserveOwedAfter,
              chosen: m.reserveRepayChosen,
            }
          : null,
    }
  })
}

// ------------------------------------------------------------------ bills

export type BillCard = {
  bill: BillPlan
  /**
   * Entered from a real bill; calculated from time already tracked, for work
   * that's finished; or forecast, for work that's still to come.
   */
  kind: "entered" | "calculated" | "forecast"
  /** The pay date: actual, planned or expected. Null if after the months shown. */
  payOn: string | null
  late: boolean
  basis: string
  colour: string
}

export type BillBucket = {
  month: string
  count: number
  /** The engine's contractor bills figure for the month, as a positive amount. */
  total: string
  entered: string
  calculated: string
  forecast: string
  /** Contractor payments already made this month, which aren't listed as to pay. */
  alreadyPaid: string
  parts: Part[]
  danger: { balance: string; personName: string; date: string } | null
  cards: BillCard[]
}

export type BillBuckets = {
  months: BillBucket[]
  later: BillCard[]
  paid: BillCard[]
}

export const contractorColour = (result: Ready, name: string): string => {
  const slot = result.contractors.indexOf(name)
  return slot < 0 ? NEUTRAL_COLOUR : seriesColour(slot)
}

const billCard = (result: Ready, bill: BillPlan): BillCard => {
  const payOn = bill.paidOn ?? bill.expectedPayOn
  return {
    bill,
    kind: bill.id
      ? "entered"
      : bill.periodEnd < result.today
        ? "calculated"
        : "forecast",
    payOn,
    late: payOn !== null && payOn > bill.dueOn,
    basis: bill.id
      ? "Entered from the bill"
      : bill.source === "tracked"
        ? "From tracked hours"
        : "Tracked hours so far + forecast at their usual rate",
    colour: contractorColour(result, bill.personName),
  }
}

export function billBuckets(result: Ready): BillBuckets {
  const unpaid = result.bills
    .filter((b) => b.status === "unpaid")
    .map((b) => billCard(result, b))
    .sort((a, b) => (a.payOn ?? "9").localeCompare(b.payOn ?? "9"))
  const nameOf = new Map(result.bills.map((b) => [b.personId, b.personName]))

  const months = result.months.map((m): BillBucket => {
    const cards = unpaid.filter(
      (c) => c.payOn !== null && monthStart(c.payOn) === m.month
    )
    const total = new D(m.contractorBills).abs()
    const add = (list: BillCard[]) => sum(list.map((c) => new D(c.bill.amount)))
    const entered = add(cards.filter((c) => c.kind === "entered"))
    const calculated = add(cards.filter((c) => c.kind === "calculated"))
    const forecast = add(cards.filter((c) => c.kind === "forecast"))
    const alreadyPaid = total.minus(entered).minus(calculated).minus(forecast)

    const items = result.contractors.flatMap((name) => {
      const mine = cards.filter((c) => c.bill.personName === name)
      return mine.length
        ? [
            {
              key: name,
              label: name,
              amount: add(mine),
              colour: contractorColour(result, name),
            },
          ]
        : []
    })
    if (alreadyPaid.gt(0))
      items.push({
        key: "paid",
        label: "Already paid",
        amount: alreadyPaid,
        colour: NEUTRAL_COLOUR,
      })

    // The worst pay day, from the engine's own running balance.
    const end = monthEnd(m.month)
    const below = result.timeline
      .filter(
        (e) =>
          e.type === "contractor_bill" &&
          e.date >= m.month &&
          e.date <= end &&
          new D(e.balance).lt(0)
      )
      .sort((a, b) => new D(a.balance).comparedTo(b.balance))[0]

    return {
      month: m.month,
      count: cards.length,
      total: money(total),
      entered: money(entered),
      calculated: money(calculated),
      forecast: money(forecast),
      alreadyPaid: money(alreadyPaid),
      parts: partsOf(total, items),
      danger: below
        ? {
            balance: below.balance,
            personName: nameOf.get(below.personId ?? "") ?? "a contractor",
            date: below.date,
          }
        : null,
      cards,
    }
  })

  const lastMonth = monthEnd(result.months.at(-1)!.month)
  return {
    months,
    later: unpaid.filter((c) => c.payOn === null || c.payOn > lastMonth),
    paid: result.bills
      .filter((b) => b.status !== "unpaid")
      .map((b) => billCard(result, b))
      .sort((a, b) => (b.payOn ?? "").localeCompare(a.payOn ?? "")),
  }
}

// ------------------------------------------------------------------ timeline

export type TimelineChip = {
  key: string
  category: TimelineCategory
  colour: string
  label: string
  /** Signed, so money in reads as money in. */
  amount: string
  direction: "in" | "out"
  /** Dashed in the UI: it comes from a forecast rather than Xero or a director. */
  predicted: boolean
  /** Every event behind the chip, for its tooltip. */
  events: { label: string; amount: string }[]
}

export type TimelineDay = {
  date: string
  chips: TimelineChip[]
  balance: string
  /** Where the balance bar sits, as percentages of its 140px track. */
  bar: { left: number; width: number; negative: boolean }
}

export type TimelineMonthView = {
  month: string
  totalIn: string
  totalOut: string
  closing: string
  lowest: string
  lowestOn: string
  days: TimelineDay[]
}

export type TimelineView = { months: TimelineMonthView[]; zeroAt: number }

const PREDICTED: Source[] = ["forecast", "tracked", "override"]

const NOUNS: Record<TimelineCategory, string> = {
  money_in: "invoices",
  contractors: "bills",
  set_asides: "set-asides",
  directors: "director payments",
  running: "running costs",
  other: "other items",
}

/** A shorter label for an event that gets a chip to itself. */
export function chipLabel(label: string): string {
  return label
    .replace(/^Invoice \(late\): /, "Invoice (late) ")
    .replace(/^Invoice due: /, "Invoice ")
    .replace(/^Forecast invoice: /, "Invoice ")
    .replace(/^One-off invoice: /, "One-off ")
    .replace(/^Client payment: /, "Paid ")
    .replace(/^Contractor bill: /, "Bill: ")
    .replace(/^Contractor payment: /, "Paid: ")
    .replace(/^Set-aside: /, "Set-aside ")
    .replace(/^Running cost: /, "")
    .replace(/^Running costs \(monthly average\)$/, "Running costs")
}

/** One chip per category, direction and basis, so a busy day still reads as one row. */
export function mergeDay(rows: TimelineRow[]): TimelineChip[] {
  const groups = new Map<string, TimelineRow[]>()
  for (const r of rows) {
    const direction = r.moneyIn ? "in" : "out"
    const basis = PREDICTED.includes(r.source)
      ? "predicted"
      : r.actual
        ? "actual"
        : r.source
    const key = `${r.category}|${direction}|${basis}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.entries()].map(([key, list]) => {
    const first = list[0]
    const direction = first.moneyIn ? "in" : "out"
    const predicted = PREDICTED.includes(first.source)
    const total = sum(list.map((r) => new D(r.moneyIn ?? r.moneyOut ?? 0)))
    const noun =
      first.category === "money_in" && predicted
        ? "predicted invoices"
        : first.category === "money_in" && first.actual
          ? "client payments"
          : NOUNS[first.category]
    return {
      key,
      category: first.category,
      colour: CATEGORY_COLOUR[first.category],
      label:
        list.length === 1 ? chipLabel(first.label) : `${list.length} ${noun}`,
      amount: money(total),
      direction,
      predicted,
      events: list.map((r) => ({
        label: r.label,
        amount: money(r.moneyIn ?? `-${r.moneyOut}`),
      })),
    }
  })
}

export function timelineView(result: Ready): TimelineView {
  const months = timelineMonths(result)
  const balances = months.flatMap((m) => m.rows.map((r) => new D(r.balance)))
  const high = D.max(ZERO, ...balances)
  const low = D.min(ZERO, ...balances)
  const range = high.minus(low)
  const zeroAt = range.isZero()
    ? 0
    : low.abs().div(range).times(100).toDecimalPlaces(2).toNumber()
  const width = (v: Dec) =>
    range.isZero()
      ? 0
      : v.abs().div(range).times(100).toDecimalPlaces(2).toNumber()

  return {
    zeroAt,
    months: months.map((m) => {
      const dates = [...new Set(m.rows.map((r) => r.date))]
      return {
        month: m.month,
        totalIn: m.totalIn,
        totalOut: m.totalOut,
        closing: m.closing,
        lowest: m.lowest,
        lowestOn: m.lowestOn,
        days: dates.map((date) => {
          const rows = m.rows.filter((r) => r.date === date)
          const balance = new D(rows.at(-1)!.balance)
          const negative = balance.isNegative()
          return {
            date,
            chips: mergeDay(rows),
            balance: money(balance),
            bar: {
              left: negative
                ? new D(zeroAt).minus(width(balance)).toNumber()
                : zeroAt,
              width: width(balance),
              negative,
            },
          }
        }),
      }
    }),
  }
}

// ------------------------------------------------------------------ paid

export type PaidInvoice = {
  invoiceId: string
  /** The latest payment against it. */
  paidOn: string
  invoiceNumber: string | null
  title: string
  clientName: string | null
  /** Received so far, with VAT. */
  paid: string
  netAmount: string
  contractorCost: string
  profit: string
  /** On what's been received: the whole set-aside once it's fully paid. */
  setAside: string
  partPaid: boolean
  /** Raised after tracking began, yet no tracked time matched it, so no contractor cost. */
  noCostMatched: boolean
}

export type PaidYear = {
  /** The financial year's first and last days. */
  start: string
  end: string
  /** Payments only count from the forecast start date, so an earlier year is part-counted. */
  countedFrom: string | null
  total: string
  /** A director ticked this year's CT as paid. */
  ctPaid: boolean
  invoices: PaidInvoice[]
}

export type PaidView = {
  /** What should be in the tax reserve: every year whose CT isn't paid yet. */
  owed: string
  years: PaidYear[]
}

/**
 * Invoices paid since the forecast start date by financial year, latest first,
 * with the CT set-aside each brings in. A part-paid invoice brings in its share so
 * far, and sits in the year of its latest payment.
 */
export function paidView(result: Ready, ctPaidYears: string[]): PaidView {
  const byId = new Map(
    result.invoices
      .filter((i) => i.invoiceId !== null)
      .map((i) => [i.invoiceId!, i])
  )
  const paid = new Map<string, { amount: Dec; on: string }>()
  for (const p of result.invoicePayments) {
    const so = paid.get(p.invoiceId)
    paid.set(p.invoiceId, {
      amount: (so?.amount ?? ZERO).plus(p.amount),
      on: so && so.on > p.paidOn ? so.on : p.paidOn,
    })
  }

  const invoices: PaidInvoice[] = [...paid.entries()].flatMap(([id, p]) => {
    const inv = byId.get(id)
    if (!inv) return []
    const total = new D(inv.total)
    const share = total.isZero() ? new D(1) : D.min(p.amount.div(total), 1)
    return [
      {
        invoiceId: id,
        paidOn: p.on,
        invoiceNumber: inv.invoiceNumber,
        title:
          inv.projectName ?? inv.clientName ?? inv.invoiceNumber ?? "Invoice",
        clientName: inv.clientName ?? null,
        paid: money(p.amount),
        netAmount: inv.amount,
        contractorCost: inv.contractorCost,
        profit: money(new D(inv.amount).minus(inv.contractorCost)),
        setAside: money(new D(inv.setAside).times(share)),
        partPaid: p.amount.lt(total),
        noCostMatched: !inv.linked && inv.invoiceDate >= result.trackingFrom,
      },
    ]
  })
  invoices.sort(
    (a, b) =>
      b.paidOn.localeCompare(a.paidOn) ||
      (b.invoiceNumber ?? "").localeCompare(a.invoiceNumber ?? "")
  )
  const byYear = new Map<string, PaidInvoice[]>()
  for (const i of invoices) {
    const { start } = financialYearOf(i.paidOn, result.financialYearStart)
    byYear.set(start, [...(byYear.get(start) ?? []), i])
  }
  const years: PaidYear[] = [...byYear.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([start, list]) => ({
      ...financialYearOf(start, result.financialYearStart),
      countedFrom: start < result.paymentsFrom ? result.paymentsFrom : null,
      total: money(sum(list.map((i) => new D(i.setAside)))),
      ctPaid: ctPaidYears.includes(start),
      invoices: list,
    }))
  return {
    owed: money(sum(years.filter((y) => !y.ctPaid).map((y) => new D(y.total)))),
    years,
  }
}

export type PaidDay = {
  paidOn: string
  setAside: string
  invoices: PaidInvoice[]
}

/** Paid invoices grouped by the day the money landed, latest first. */
export function paidByDay(invoices: PaidInvoice[]): PaidDay[] {
  const days = new Map<string, PaidInvoice[]>()
  for (const i of invoices)
    days.set(i.paidOn, [...(days.get(i.paidOn) ?? []), i])
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([paidOn, list]) => ({
      paidOn,
      setAside: money(sum(list.map((i) => new D(i.setAside)))),
      invoices: list,
    }))
}
