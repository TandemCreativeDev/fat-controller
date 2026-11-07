import Decimal from "decimal.js"

import {
  monthEnd,
  monthStart,
  timelineMonths,
  type BillPlan,
  type ForecastResult,
  type Source,
  type TimelineCategory,
  type TimelineRow,
} from "@/lib/forecast"
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
  /** Opening less closing balance: what the bank adds to the payout, or keeps. */
  fromBank: string
  opening: string
  /** The same figure In and out gives: no dividends, payout or transfers. */
  leftBeforeDividends: string
  /** Borrowed from the tax reserve, which that figure doesn't count as income. */
  fromReserve: string
  takeHome: string
  /** What the take-home is made of, in words. */
  takeHomeNote: string
  /** All directors together. */
  payout: string
  closing: string
  holdBack: { amount: string; personName: string; dueOn: string } | null
  /** What the hold-back leaves uncovered next month, if anything. */
  shortfall: string | null
  taxReserve: string | null
  vatOwed: string | null
}

export function overviewBuckets(
  result: Ready,
  formatMoney: (amount: string) => string
): OverviewBucket[] {
  const clients = payoutBuckets(result, formatMoney).months
  const inOut = new Map(
    inOutMonths(result, formatMoney).map((m) => [m.month, m])
  )
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
            new D(m.setAsides).abs(),
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
      fromBank: money(new D(m.opening).minus(m.closing)),
      opening: m.opening,
      leftBeforeDividends: inOut.get(m.month)!.left,
      fromReserve: inOut.get(m.month)!.fromReserve,
      takeHome: m.takeHomePerDirector,
      takeHomeNote: takeHomeNote(result, m.takeHomePerDirector, formatMoney),
      payout: money(new D(m.directorPay).abs()),
      closing: m.closing,
      holdBack: new D(m.holdBack).gt(0)
        ? {
            amount: m.holdBack,
            personName: m.holdBackReason?.personName ?? "",
            dueOn: m.holdBackReason?.dueOn ?? "",
          }
        : null,
      shortfall: new D(m.shortfall).gt(0) ? m.shortfall : null,
      taxReserve: result.taxReserveBalance,
      vatOwed: new D(m.vatOwed).isZero() ? null : m.vatOwed,
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
    basis: bill.id ? "Entered from the bill" : "From tracked hours",
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
