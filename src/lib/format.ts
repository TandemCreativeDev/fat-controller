const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
})

/** £12,345, rounded to the pound for dashboards. */
export function formatGbp(n: number): string {
  return gbp.format(Math.round(n) === 0 ? 0 : n)
}

export function formatPercent(n: number | null): string {
  return n === null ? "–" : `${(n * 100).toFixed(1)}%`
}

/** "2026-09-01" → "Sep 2026" */
export function formatMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function formatAsOf(d: Date | null): string {
  return d
    ? d.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
      })
    : "never"
}

const gbpPence = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
})

/** "1234.5" → "£1,234.50", for the forecast's exact figures. For display only. */
export function formatPence(amount: string): string {
  return gbpPence.format(Number(amount))
}

/** "2026-06-05" → "5 Jun 2026" */
export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** "2026-06-05" → "5 Jun" */
export function formatDayShort(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

/** "3.2500" → "3.25", for display. */
export function formatDays(days: string): string {
  return Number(days).toFixed(2)
}
