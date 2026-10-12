/**
 * Xero's JSON dates come as Microsoft "/Date(1518685950940+0000)/" strings,
 * sometimes alongside an ISO "DateString". These turn them into JS values.
 */

const MS_DATE = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/

/** A Xero timestamp (e.g. UpdatedDateUTC) → Date. */
export function parseXeroTimestamp(value: string): Date {
  const m = MS_DATE.exec(value)
  if (m) return new Date(Number(m[1]))
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
  if (Number.isNaN(d.getTime()))
    throw new Error(`Unparseable Xero date: ${value}`)
  return d
}

/** A Xero calendar date (invoice Date, DueDate) → "YYYY-MM-DD". Xero stores them as UTC midnight. */
export function parseXeroDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return parseXeroTimestamp(value).toISOString().slice(0, 10)
}

/** Format for the If-Modified-Since header (Xero accepts ISO 8601 UTC). */
export function toIfModifiedSince(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "")
}
