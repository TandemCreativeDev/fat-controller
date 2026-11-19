import Decimal from "decimal.js"

/**
 * UK Corporation Tax from April 2023: 19% on profits up to the lower limit, 25%
 * from the upper limit, and in between 25% less marginal relief. Both limits are
 * shared between associated companies and cut pro rata for a short period.
 * An estimate from the books: HMRC's taxable profit can differ (disallowable
 * costs, capital allowances other than the Annual Investment Allowance).
 */

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
type Dec = InstanceType<typeof D>
const ZERO = new D(0)
const money = (d: Decimal.Value) => new D(d).toFixed(2)

const SMALL_RATE = new D("0.19")
const MAIN_RATE = new D("0.25")
const LOWER_LIMIT = new D(50_000)
const UPPER_LIMIT = new D(250_000)
const RELIEF_FRACTION = new D(3).div(200)

export type CtBand = "none" | "small" | "marginal" | "main"

export type CtOnProfit = {
  profit: string
  ct: string
  /** CT over profit, 0 to 1. */
  rate: string
  band: CtBand
  lowerLimit: string
  upperLimit: string
  /** For the marginal band: 25% of profit, and the relief taken off it. */
  mainRateTax: string
  relief: string
}

/** The figures behind the rates, for showing the working. */
export const CT_RULES = {
  smallRate: SMALL_RATE.toString(),
  mainRate: MAIN_RATE.toString(),
  lowerLimit: LOWER_LIMIT.toFixed(2),
  upperLimit: UPPER_LIMIT.toFixed(2),
  reliefFraction: "3/200",
}

const days = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000
  ) + 1

/** CT on a whole accounting period's taxable profit. */
export function ctOnProfit(
  profit: Decimal.Value,
  opts: { periodDays: number; associatedCompanies: number }
): CtOnProfit {
  const p = new D(profit)
  const share = new D(opts.periodDays)
    .div(365)
    .div(1 + opts.associatedCompanies)
  const lower = LOWER_LIMIT.times(share)
  const upper = UPPER_LIMIT.times(share)
  let ct: Dec
  let band: CtBand
  let relief = ZERO
  if (p.lte(0)) {
    ct = ZERO
    band = "none"
  } else if (p.lte(lower)) {
    ct = p.times(SMALL_RATE)
    band = "small"
  } else if (p.gte(upper)) {
    ct = p.times(MAIN_RATE)
    band = "main"
  } else {
    relief = upper.minus(p).times(RELIEF_FRACTION)
    ct = p.times(MAIN_RATE).minus(relief)
    band = "marginal"
  }
  return {
    profit: money(p),
    ct: money(ct),
    rate: p.gt(0) ? ct.div(p).toFixed(4) : "0.0000",
    band,
    lowerLimit: money(lower),
    upperLimit: money(upper),
    mainRateTax: money(Decimal.max(p, 0).times(MAIN_RATE)),
    relief: money(relief),
  }
}

export type CtYearInput = {
  start: string
  end: string
  today: string
  sales: string
  peopleCosts: string
  otherCosts: string
  /** Equipment bought, deducted in full under the Annual Investment Allowance. */
  equipment: string
  associatedCompanies: number
}

export type CtYear = {
  profit: string
  taxableProfit: string
  /** True while the year is still running: the rate comes from a full-year projection. */
  inProgress: boolean
  /** The full year's taxable profit at this pace; null once the year is over. */
  projectedProfit: string | null
  ct: string
  rate: string
  band: CtBand
  /** Days in the year, and days of it gone by (the same once it's over). */
  periodDays: number
  elapsedDays: number
  /** The calculation the rate comes from: on the taxable profit, or the projection. */
  working: CtOnProfit
}

/**
 * Estimated CT for a financial year from its books so far. A year still running
 * is taxed at the rate a full year at the same pace would pay, so the reserve
 * builds at the right rate rather than catching up in the last months.
 */
export function ctForYear(input: CtYearInput): CtYear {
  const profit = new D(input.sales)
    .minus(input.peopleCosts)
    .minus(input.otherCosts)
  const taxable = profit.minus(input.equipment)
  const periodDays = days(input.start, input.end)
  const inProgress = input.today < input.end
  const opts = { periodDays, associatedCompanies: input.associatedCompanies }

  if (!inProgress) {
    const whole = ctOnProfit(taxable, opts)
    return {
      profit: money(profit),
      taxableProfit: money(taxable),
      inProgress,
      projectedProfit: null,
      ct: whole.ct,
      rate: whole.rate,
      band: whole.band,
      periodDays,
      elapsedDays: periodDays,
      working: whole,
    }
  }

  const elapsed = Math.max(days(input.start, input.today), 1)
  const projected = taxable.times(periodDays).div(elapsed)
  const full = ctOnProfit(projected, opts)
  const ct = taxable.gt(0) ? new D(full.ct).div(projected).times(taxable) : ZERO
  return {
    profit: money(profit),
    taxableProfit: money(taxable),
    inProgress,
    projectedProfit: money(projected),
    ct: money(ct),
    rate: full.rate,
    band: full.band,
    periodDays,
    elapsedDays: elapsed,
    working: full,
  }
}
