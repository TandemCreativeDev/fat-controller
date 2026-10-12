import { formatMonth } from "@/lib/format"

/**
 * The reporting period every dashboard page and the analysis pack can switch
 * between, carried in the URL as `?period=`. Lifetime is the default.
 */
export const PERIODS = [
  { key: "fy", label: "This FY" },
  { key: "last-fy", label: "Last FY" },
  { key: "lifetime", label: "Lifetime" },
] as const

export type PeriodKey = (typeof PERIODS)[number]["key"]

export function parsePeriod(value: unknown): PeriodKey {
  return PERIODS.some((p) => p.key === value)
    ? (value as PeriodKey)
    : "lifetime"
}

type Range = {
  /** "YYYY-MM-DD", inclusive. */
  from: string
  /** "YYYY-MM-DD", inclusive. */
  to: string
  /** "Sep 2025 – Aug 2026" */
  label: string
}

export type Period = Range & {
  key: PeriodKey
  /** "This FY", "Last FY" or "Lifetime" */
  title: string
  /** First day of each month in the period, oldest first. */
  months: string[]
  /** The same span one year earlier, for comparison; null for lifetime. */
  previous: Range | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => new Date(`${s}T00:00:00Z`)
const addYears = (s: string, n: number) => {
  const d = utc(s)
  d.setUTCFullYear(d.getUTCFullYear() + n)
  return iso(d)
}
const addDays = (s: string, n: number) =>
  iso(new Date(utc(s).getTime() + n * 86_400_000))
const monthEnd = (d: Date) =>
  iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))

function range(from: string, to: string): Range {
  return { from, to, label: `${formatMonth(from)} – ${formatMonth(to)}` }
}

/** First day of each month from `from`'s month to `to`'s month. */
export function monthStarts(from: string, to: string): string[] {
  const out: string[] = []
  const end = utc(to)
  for (
    let d = new Date(
      Date.UTC(utc(from).getUTCFullYear(), utc(from).getUTCMonth(), 1)
    );
    d <= end;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  ) {
    out.push(iso(d))
  }
  return out
}

/**
 * Resolve a period against the current financial year start, the first month
 * with P&L activity and today (London date). Periods that include today end
 * at the end of this month.
 */
export function resolvePeriod(
  key: PeriodKey,
  ctx: { fyStart: string; firstMonth: string | null; today: Date }
): Period {
  const thisMonthEnd = monthEnd(ctx.today)
  const title = PERIODS.find((p) => p.key === key)!.label
  const lastFyStart = addYears(ctx.fyStart, -1)

  let r: Range
  let previous: Range | null
  if (key === "fy") {
    r = range(ctx.fyStart, thisMonthEnd)
    previous = range(lastFyStart, addDays(ctx.fyStart, -1))
  } else if (key === "last-fy") {
    r = range(lastFyStart, addDays(ctx.fyStart, -1))
    previous = range(addYears(ctx.fyStart, -2), addDays(lastFyStart, -1))
  } else {
    const first = ctx.firstMonth ?? iso(ctx.today)
    r = range(`${first.slice(0, 7)}-01`, thisMonthEnd)
    previous = null
  }
  return { ...r, key, title, months: monthStarts(r.from, r.to), previous }
}
