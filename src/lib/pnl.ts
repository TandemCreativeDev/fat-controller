/** How an account counts in the monthly P&L. "exclude" leaves it out entirely. */
export const ACCOUNT_GROUPS = ["sales", "people", "other", "exclude"] as const
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number]

export const GROUP_LABELS: Record<AccountGroup, string> = {
  sales: "Sales",
  people: "People costs",
  other: "Other costs",
  exclude: "Excluded",
}

const PEOPLE =
  /salar|wage|payroll|pension|national insurance|\bni\b|employer|director|staff|subcontract|contractor|freelanc/i

/**
 * Default grouping for an account nobody has mapped by hand: revenue accounts
 * are Sales, expense accounts are People costs when the name says so and
 * Other costs otherwise, and balance-sheet accounts are excluded.
 */
export function defaultGroup(account: {
  class: string | null
  name: string
}): AccountGroup {
  if (account.class === "REVENUE") return "sales"
  if (account.class === "EXPENSE")
    return PEOPLE.test(account.name) ? "people" : "other"
  return "exclude"
}

// ------------------------------------------------------------------ periods

/** "YYYY-MM-DD" first and last day of each of the last `count` months, oldest first, ending with `today`'s month. */
export function lastMonths(
  today: Date,
  count: number
): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1)
    )
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)
    )
    out.push({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    })
  }
  return out
}

/**
 * Every month from `first` ("YYYY-MM-DD", any day in the month) to `today`'s
 * month, oldest first; just today's month if `first` is null or later.
 */
export function monthsSince(
  first: string | null,
  today: Date
): { start: string; end: string }[] {
  const f = first ? new Date(`${first.slice(0, 7)}-01T00:00:00Z`) : today
  const count =
    (today.getUTCFullYear() - f.getUTCFullYear()) * 12 +
    today.getUTCMonth() -
    f.getUTCMonth() +
    1
  return lastMonths(today, Math.max(1, count))
}

/** Today's date in London, as a UTC-midnight Date for month arithmetic. */
export function londonToday(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
  }).format(now)
  return new Date(`${ymd}T00:00:00Z`)
}

/** Financial year start (day after the year end Xero reports). */
export function fyStartFromYearEnd(
  day: number,
  month: number
): { month: number; day: number } {
  // Use a leap year so 29 Feb year ends behave; the year itself doesn't matter.
  const next = new Date(Date.UTC(2000, month - 1, day + 1))
  return { month: next.getUTCMonth() + 1, day: next.getUTCDate() }
}

// ------------------------------------------------------------------ averages

/**
 * Adds a rolling 3-month average of Sales and Profit to consecutive months
 * (oldest first): the month and the two before it. Months on or after
 * `currentMonth` are incomplete, so they get null and never feed an average;
 * so do months without two complete months before them in the list.
 */
export function withRolling3<
  T extends { month: string; sales: number; profit: number },
>(
  months: T[],
  currentMonth: string
): (T & { salesAvg3: number | null; profitAvg3: number | null })[] {
  // Average in pennies so 2dp inputs don't pick up float drift.
  const avg = (vals: number[]) =>
    Math.round(vals.reduce((t, v) => t + Math.round(v * 100), 0) / 3) / 100
  return months.map((m, i) => {
    const window = months.slice(i - 2, i + 1)
    const ok = i >= 2 && m.month < currentMonth
    return {
      ...m,
      salesAvg3: ok ? avg(window.map((w) => w.sales)) : null,
      profitAvg3: ok ? avg(window.map((w) => w.profit)) : null,
    }
  })
}
