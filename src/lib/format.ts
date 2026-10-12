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
