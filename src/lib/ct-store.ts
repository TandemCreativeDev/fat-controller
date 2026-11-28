import "server-only"

import Decimal from "decimal.js"
import { sql } from "drizzle-orm"

import { db } from "@/db"
import { ctForYear, type CtYear } from "@/lib/corporation-tax"
import { financialYearOf, londonDate } from "@/lib/forecast"
import { getForecastPage } from "@/lib/forecast-store"
import { paidView, type PaidYear } from "@/lib/forecast-views"
import { CATEGORY_COLOUR } from "@/lib/forecast-colours"
import { getSettings } from "@/lib/settings-store"
import type { SplitPart } from "@/components/split-bar"

export type CtYearRow = {
  start: string
  end: string
  sales: string
  peopleCosts: string
  otherCosts: string
  equipment: string
  estimate: CtYear
  /** Set aside invoice by invoice, at the rate in Settings. */
  setAside: string
  /** Estimated CT less what the invoices set aside: positive means short. */
  short: string
  /** Where the year's sales go: costs, equipment, CT and what's left. */
  parts: SplitPart[]
  ctPaid: boolean
  paid: PaidYear | null
}

export type CompareBar = {
  key: "estimate" | "reserve" | "rule"
  label: string
  amount: string
  /** Width against the largest of the three, 0 to 100. */
  percent: number
}

export type ReserveCompare = {
  bars: CompareBar[]
  /** Each pair's difference, first less second: negative means the first is under. */
  gaps: { key: string; label: string; amount: string }[]
  /** Borrowed from the reserve and not paid back yet: part of why it's short. */
  reserveOwed: string
}

export type CtPage = {
  years: CtYearRow[]
  /** Estimated CT for every year not ticked as paid. */
  owed: string
  taxReserveBalance: string | null
  /** The three figures side by side, for the years not ticked as paid. */
  compare: ReserveCompare
  setAsideRate: number
  associatedCompanies: number
}

function partsOf(
  sales: string,
  items: Omit<SplitPart, "percent" | "percentLabel">[]
): SplitPart[] {
  const total = new Decimal(sales)
  return items.map((i) => {
    const share = total.gt(0)
      ? Decimal.max(new Decimal(i.amount), 0).div(total).times(100)
      : new Decimal(0)
    return {
      ...i,
      percent: share.toNumber(),
      percentLabel: share.toDecimalPlaces(0).toNumber(),
    }
  })
}

/** The books for one financial year: sales, costs and equipment bought. */
async function yearBooks(start: string, end: string) {
  const res = await db.execute<{
    sales: string
    people: string
    other: string
    equipment: string
  }>(sql`
    select
      coalesce(sum(l.credit) filter (where g."group" = 'sales'), 0)::numeric(14,2)::text as sales,
      coalesce(-sum(l.credit) filter (where g."group" = 'people'), 0)::numeric(14,2)::text as people,
      coalesce(-sum(l.credit) filter (where g."group" = 'other'), 0)::numeric(14,2)::text as other,
      coalesce(-sum(l.credit) filter (where a.type = 'FIXED'), 0)::numeric(14,2)::text as equipment
    from v_ledger_line l
    join xero_account a on a.account_id = l.account_id
    left join account_group g on g.account_id = l.account_id
    where l.date between ${start} and ${end}
  `)
  return res.rows[0]
}

/** Each financial year since tracking began, with its CT estimate and set-asides. */
export async function getCorporationTaxPage(): Promise<CtPage | null> {
  const [settings, forecast] = await Promise.all([
    getSettings(),
    getForecastPage(),
  ])
  const result = forecast.result
  if (!result || result.blocked) return null
  const today = londonDate(new Date())
  const yearStart = settings.financial_year_start
  const paid = paidView(result, settings.ct_paid_years)

  const starts = new Set(paid.years.map((y) => y.start))
  starts.add(financialYearOf(today, yearStart).start)
  starts.add(result.paymentsFrom)

  const years = await Promise.all(
    [...starts]
      .sort((a, b) => b.localeCompare(a))
      .map(async (start) => {
        const { end } = financialYearOf(start, yearStart)
        const books = await yearBooks(start, end)
        const paidYear = paid.years.find((y) => y.start === start) ?? null
        const setAside = paidYear?.total ?? "0.00"
        const estimate = ctForYear({
          start,
          end,
          today,
          sales: books.sales,
          peopleCosts: books.people,
          otherCosts: books.other,
          equipment: books.equipment,
          associatedCompanies: settings.ct_associated_companies,
        })
        const left = Decimal.max(
          new Decimal(estimate.taxableProfit).minus(estimate.ct),
          0
        )
        return {
          start,
          end,
          sales: books.sales,
          peopleCosts: books.people,
          otherCosts: books.other,
          equipment: books.equipment,
          estimate,
          setAside,
          short: new Decimal(estimate.ct).minus(setAside).toFixed(2),
          parts: partsOf(books.sales, [
            {
              key: "people",
              label: "People costs",
              amount: books.people,
              colour: CATEGORY_COLOUR.contractors,
            },
            {
              key: "other",
              label: "Other costs and equipment",
              amount: new Decimal(books.other).plus(books.equipment).toFixed(2),
              colour: CATEGORY_COLOUR.running,
            },
            {
              key: "ct",
              label: "Corporation Tax",
              amount: estimate.ct,
              colour: CATEGORY_COLOUR.set_asides,
            },
            {
              key: "left",
              label: "Left after CT",
              amount: left.toFixed(2),
              colour: CATEGORY_COLOUR.directors,
            },
          ]),
          ctPaid: settings.ct_paid_years.includes(start),
          paid: paidYear,
        }
      })
  )

  const owed = years
    .filter((y) => !y.ctPaid)
    .reduce((t, y) => t.plus(y.estimate.ct), new Decimal(0))
  const rule = years
    .filter((y) => !y.ctPaid)
    .reduce((t, y) => t.plus(y.setAside), new Decimal(0))
  const reserve =
    result.taxReserveBalance === null
      ? null
      : new Decimal(result.taxReserveBalance)
  const ruleName = `${Math.round(settings.ct_set_aside_rate * 100)}% rule`
  const figures = [
    {
      key: "estimate" as const,
      label: "Should be (estimated CT)",
      amount: owed,
    },
    ...(reserve
      ? [
          {
            key: "reserve" as const,
            label: "In the reserve now",
            amount: reserve,
          },
        ]
      : []),
    {
      key: "rule" as const,
      label: `The ${ruleName}`,
      amount: rule,
    },
  ]
  const top = Decimal.max(...figures.map((f) => f.amount), 1)
  const gap = (a: Decimal, b: Decimal) => a.minus(b).toFixed(2)
  const compare: ReserveCompare = {
    reserveOwed: result.reserveOwed,
    bars: figures.map((f) => ({
      key: f.key,
      label: f.label,
      amount: f.amount.toFixed(2),
      percent: Decimal.max(f.amount, 0).div(top).times(100).toNumber(),
    })),
    gaps: [
      ...(reserve
        ? [
            {
              key: "reserve-estimate",
              label: "Reserve vs estimate",
              amount: gap(reserve, owed),
            },
          ]
        : []),
      {
        key: "rule-estimate",
        label: `${ruleName} vs estimate`,
        amount: gap(rule, owed),
      },
      ...(reserve
        ? [
            {
              key: "reserve-rule",
              label: `Reserve vs ${ruleName}`,
              amount: gap(reserve, rule),
            },
          ]
        : []),
    ],
  }

  return {
    years,
    compare,
    owed: owed.toFixed(2),
    taxReserveBalance: result.taxReserveBalance,
    setAsideRate: settings.ct_set_aside_rate,
    associatedCompanies: settings.ct_associated_companies,
  }
}

export type SetAsidesPage = {
  years: PaidYear[]
  setAsideRate: number
}

/** Paid invoices since tracking's financial year began, each with its set-aside. */
export async function getSetAsidesPage(): Promise<SetAsidesPage | null> {
  const [settings, forecast] = await Promise.all([
    getSettings(),
    getForecastPage(),
  ])
  const result = forecast.result
  if (!result || result.blocked) return null
  return {
    years: paidView(result, []).years,
    setAsideRate: settings.ct_set_aside_rate,
  }
}
