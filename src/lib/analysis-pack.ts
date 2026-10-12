/**
 * The Markdown "analysis pack": the dashboard's figures in one file an LLM can
 * read without guessing. Pure, so the format is unit-tested; the data comes
 * from the same views the dashboard reads (see analysis-pack-store.ts).
 */

export type AnalysisPackInput = {
  company: string
  generatedAt: Date
  asOf: Date | null
  period: { from: string; to: string }
  fyStart: string
  ctRate: number
  groups: { sales: string[]; people: string[]; other: string[] }
  pnl: {
    month: string
    sales: number
    peopleCosts: number
    otherCosts: number
    profit: number
    margin: number | null
    ctSetAside: number
  }[]
  clientMonths: {
    month: string
    client: string
    invoiced: number
    received: number
  }[]
  aged: {
    client: string
    invoiceNumber: string | null
    date: string | null
    dueDate: string | null
    daysOverdue: number
    bucket: string
    outstanding: number
  }[]
  costs: { month: string; account: string; group: string; amount: number }[]
  takeHome: {
    director: string
    salary: number
    dividends: number
    total: number
  }[]
  /** Optional CSV appendix. */
  lines?: {
    date: string
    type: string
    number: string | null
    contact: string | null
    account: string
    description: string | null
    net: number
  }[]
}

const gbp = (n: number) => n.toFixed(2)
const pct = (n: number | null) => (n === null ? "" : (n * 100).toFixed(1))
const ym = (iso: string) => iso.slice(0, 7)
const cell = (v: string | number | null) =>
  String(v ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")

export function markdownTable(
  headers: string[],
  rows: (string | number | null)[][]
): string {
  if (rows.length === 0) return "_No rows._"
  // Right-align columns whose every value is a number (amounts arrive as strings).
  const right = headers.map((_, i) =>
    rows.every((r) => /^-?\d+(\.\d+)?$/.test(String(r[i] ?? "")))
  )
  return [
    `| ${headers.map(cell).join(" | ")} |`,
    `| ${headers.map((_, i) => (right[i] ? "---:" : "---")).join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n")
}

export function csv(
  headers: string[],
  rows: (string | number | null)[][]
): string {
  const q = (v: string | number | null) => {
    const s = String(v ?? "")
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map((r) => r.map(q).join(",")).join("\n")
}

export function buildAnalysisPack(d: AnalysisPackInput): string {
  const out: string[] = []
  const date = (x: Date | null) =>
    x ? x.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "unknown"

  out.push(`# ${d.company}: finance analysis pack`)
  out.push(
    [
      "## Context",
      "",
      `- **Company:** ${d.company} (UK limited company)`,
      `- **Period:** ${ym(d.period.from)} to ${ym(d.period.to)} (the last 12 full months plus the current month to date; the current month is incomplete)`,
      `- **Currency:** GBP. Every amount column is in pounds sterling, two decimal places, no currency symbol.`,
      `- **VAT:** all Sales and cost figures **exclude VAT**. "Received" (cash from clients) **includes VAT**, because it is money in the bank.`,
      `- **Basis:** accruals by document date (invoice, bill or bank transaction date), built from Xero sales invoices, bills, credit notes, bank spend/receive transactions and manual journals. Bank transfers are excluded.`,
      `- **Financial year:** starts ${d.fyStart}. "Year to date" means since that date.`,
      `- **Corporation Tax set-aside:** ${(d.ctRate * 100).toFixed(1)}% of Sales, a management rule for cash planning, not a tax computation.`,
      `- **Data as of:** ${date(d.asOf)}. Generated ${date(d.generatedAt)}.`,
      `- These are management figures from the company's own dashboard, not statutory accounts.`,
      "",
      "### Definitions",
      "",
      `- **Sales:** income accounts: ${d.groups.sales.join(", ") || "none"}.`,
      `- **People costs:** ${d.groups.people.join(", ") || "none"}. Includes directors' salary; excludes dividends, which are a distribution of profit, not a cost.`,
      `- **Other costs:** every other expense account: ${d.groups.other.join(", ") || "none"}.`,
      `- **Profit:** Sales − People costs − Other costs (before Corporation Tax).`,
      `- **Margin (%):** Profit ÷ Sales × 100.`,
    ].join("\n")
  )

  out.push(
    "## Monthly P&L\n\nOne row per month.\n\n" +
      markdownTable(
        [
          "Month (YYYY-MM)",
          "Sales (GBP, ex VAT)",
          "People costs (GBP)",
          "Other costs (GBP)",
          "Profit (GBP)",
          "Margin (%)",
          "CT set-aside (GBP)",
        ],
        d.pnl.map((m) => [
          ym(m.month),
          gbp(m.sales),
          gbp(m.peopleCosts),
          gbp(m.otherCosts),
          gbp(m.profit),
          pct(m.margin),
          gbp(m.ctSetAside),
        ])
      )
  )

  out.push(
    "## Revenue by client by month\n\nOne row per client per month with any activity. Invoiced is net of credit notes.\n\n" +
      markdownTable(
        [
          "Month (YYYY-MM)",
          "Client",
          "Invoiced (GBP, ex VAT)",
          "Received (GBP, inc VAT)",
        ],
        d.clientMonths.map((r) => [
          ym(r.month),
          r.client,
          gbp(r.invoiced),
          gbp(r.received),
        ])
      )
  )

  out.push(
    `## Aged debtors\n\nOne row per unpaid sales invoice, as of the data date.\n\n` +
      markdownTable(
        [
          "Client",
          "Invoice",
          "Invoice date",
          "Due date",
          "Days overdue",
          "Bucket",
          "Outstanding (GBP, inc VAT)",
        ],
        d.aged.map((a) => [
          a.client,
          a.invoiceNumber,
          a.date,
          a.dueDate,
          String(a.daysOverdue),
          a.bucket,
          gbp(a.outstanding),
        ])
      )
  )

  out.push(
    "## Costs by account\n\nOne row per account per month with activity. Positive = money spent.\n\n" +
      markdownTable(
        ["Month (YYYY-MM)", "Account", "Group", "Amount (GBP, ex VAT)"],
        d.costs.map((c) => [ym(c.month), c.account, c.group, gbp(c.amount)])
      )
  )

  out.push(
    `## Take-home year to date\n\nWhat each director has been paid since ${d.fyStart}: salary (Directors' Remuneration) plus dividends paid, before personal income tax and dividend tax.\n\n` +
      markdownTable(
        [
          "Director",
          "Salary (GBP)",
          "Dividends (GBP)",
          "Total paid (GBP, before personal tax)",
        ],
        d.takeHome.map((t) => [
          t.director,
          gbp(t.salary),
          gbp(t.dividends),
          gbp(t.total),
        ])
      )
  )

  if (d.lines) {
    out.push(
      "## Appendix: invoice lines (CSV)\n\nEvery sales invoice and bill line in the period. `net_gbp` excludes VAT; positive for sales, negative for bills.\n\n```csv\n" +
        csv(
          [
            "date",
            "type",
            "invoice_number",
            "contact",
            "account",
            "description",
            "net_gbp",
          ],
          d.lines.map((l) => [
            l.date,
            l.type,
            l.number,
            l.contact,
            l.account,
            l.description,
            gbp(l.net),
          ])
        ) +
        "\n```"
    )
  }

  return out.join("\n\n") + "\n"
}
