import { z } from "zod"

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

// ------------------------------------------------------------------ report parsing

const cell = z.looseObject({
  Value: z.string().nullish(),
  Attributes: z
    .array(z.looseObject({ Id: z.string(), Value: z.string() }))
    .nullish(),
})
type Row = {
  RowType: string
  Title?: string | null
  Cells?: z.infer<typeof cell>[] | null
  Rows?: Row[] | null
}
const row: z.ZodType<Row> = z.lazy(() =>
  z.looseObject({
    RowType: z.string(),
    Title: z.string().nullish(),
    Cells: z.array(cell).nullish(),
    Rows: z.array(row).nullish(),
  })
)
export const reportResponseSchema = z.looseObject({
  Reports: z
    .array(z.looseObject({ ReportID: z.string(), Rows: z.array(row) }))
    .min(1),
})

export type PnlLine = {
  accountId: string
  accountName: string
  section: string
  amount: string
}

/**
 * Extract per-account amounts from a single-period Xero ProfitAndLoss report.
 * Summary and calculated rows (Total Income, Gross Profit, Net Profit) carry no
 * account attribute and are skipped; we recompute totals from our own grouping.
 */
export function parsePnlReport(body: unknown): PnlLine[] {
  const report = reportResponseSchema.parse(body).Reports[0]
  const lines: PnlLine[] = []
  for (const section of report.Rows) {
    if (section.RowType !== "Section") continue
    for (const r of section.Rows ?? []) {
      if (r.RowType !== "Row" || !r.Cells || r.Cells.length < 2) continue
      const accountId = r.Cells[0].Attributes?.find(
        (a) => a.Id === "account"
      )?.Value
      if (!accountId) continue
      const value = (r.Cells[1].Value ?? "").replace(/,/g, "")
      if (!/^-?\d+(\.\d+)?$/.test(value)) continue
      lines.push({
        accountId,
        accountName: r.Cells[0].Value ?? "",
        section: section.Title ?? "",
        amount: Number(value).toFixed(2),
      })
    }
  }
  return lines
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

/** Financial year start (day after the year end Xero reports). */
export function fyStartFromYearEnd(
  day: number,
  month: number
): { month: number; day: number } {
  // Use a leap year so 29 Feb year ends behave; the year itself doesn't matter.
  const next = new Date(Date.UTC(2000, month - 1, day + 1))
  return { month: next.getUTCMonth() + 1, day: next.getUTCDate() }
}
