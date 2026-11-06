import { markdownTable } from "@/lib/analysis-pack"
import type {
  AccuracyRow,
  ForecastResult,
  ForecastSettings,
  MonthBreakdown,
} from "@/lib/forecast"

/**
 * The forecast as one Markdown file an LLM can read without guessing: the rules
 * behind the figures, then the figures. Pure, so the format is unit-tested;
 * every number comes from the engine's result, and none is worked out here.
 */

export type ForecastPackInput = {
  company: string
  generatedAt: Date
  asOf: Date | null
  settings: ForecastSettings
  result: Extract<ForecastResult, { blocked: false }>
  warnings: { kind: string; message: string }[]
  accuracy: AccuracyRow[]
  xeroClosing: string | null
  manualBalance: string | null
  projects: {
    code: string | null
    name: string
    kind: string
    chargeRate: string | null
    intervalDays: number
    termsDays: number
    active: boolean
    solidtimeProjects: string[]
  }[]
  people: {
    name: string
    kind: string
    defaultRate: string | null
    termsDays: number
    cutoffDays: number
  }[]
  adjustments: {
    date: string
    label: string
    amount: string
    note: string | null
  }[]
}

const stamp = (x: Date | null) =>
  x ? x.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "unknown"

const ROWS: [string, (m: MonthBreakdown) => string][] = [
  ["Opening balance", (m) => m.opening],
  ["Invoices landing", (m) => m.invoicesLanding],
  ["Money back from tax reserve", (m) => m.backstopIn],
  ["Other money in", (m) => m.otherIn],
  ["Contractor bills", (m) => m.contractorBills],
  ["Set-asides", (m) => m.setAsides],
  ["VAT payments", (m) => m.vatPayments],
  ["Other transfers out", (m) => m.otherTransfersOut],
  ["Running costs", (m) => m.runningCosts],
  ["Adjustments", (m) => m.adjustments],
  ["Director salary and payouts", (m) => m.directorPay],
  ["Closing balance", (m) => m.closing],
  ["VAT owed (not a cash movement)", (m) => m.vatOwed],
  ["Hold-back", (m) => m.holdBack],
  ["Suggested hold-back", (m) => m.suggestedHoldBack],
  ["Shortfall next month after hold-back", (m) => m.shortfall],
  ["Take-home per director", (m) => m.takeHomePerDirector],
]

export function buildForecastPack(d: ForecastPackInput): string {
  const { result, settings } = d
  const out: string[] = []
  const percent = (rate: number | string) => `${Number(rate) * 100}%`

  out.push(`# ${d.company}: cash and take-home forecast`)

  out.push(
    [
      "## Context",
      "",
      `- **Company:** ${d.company} (UK limited company, two directors)`,
      `- **Today:** ${result.today}. The first month shown is part actual, part forecast.`,
      "- **Currency:** GBP. Every amount column is in pounds sterling, two decimal places, no currency symbol. Money out is negative in the breakdown and timeline.",
      `- **Data as of:** ${stamp(d.asOf)}. Generated ${stamp(d.generatedAt)}.`,
      "- **Sources:** past cash comes from Xero's bank records. Future invoices are forecast from Solidtime tracked hours and each project's settings.",
      "- These are management figures, not statutory accounts or tax advice. The Corporation Tax set-aside is the company's own rule of thumb.",
      "",
      "### How the forecast works",
      "",
      `- **Invoices:** billed in arrears on a fixed cycle, at one day rate per project. A day is ${settings.hoursPerDay} tracked hours, and each forecast invoice rounds its days to the nearest ${settings.invoiceDayRounding}.`,
      `- **Forecast days:** tracked time so far, plus each person's average daily rate on that project over the last ${settings.lookbackDays} days, for the working days left in the period.`,
      "- **Money in:** an invoice lands on its due date. An overdue unpaid invoice is assumed to land today, which may be optimistic.",
      "- **Contractor bills:** issued on the last Friday of the month, for work up to the cut-off before it, and paid from the following month's money as soon as the balance covers them, no later than the due date.",
      `- **Set-aside:** ${percent(settings.ctSetAsideRate)} × (invoice before VAT − contractor cost of that work), moved to the tax reserve the day after each client payment.`,
      `- **Take-home:** on the last working day of each month the main account is emptied into a director payout, split equally, apart from a £${settings.bufferGbp} buffer, VAT owed, set-asides not yet moved, and any hold-back.`,
      "- **Hold-back:** kept from a month's payout when next month's contractor bills couldn't otherwise be paid by their due dates.",
      `- **VAT:** ${settings.vatRegisteredFrom ? `registered from ${settings.vatRegisteredFrom}, at ${percent(settings.vatRate)}.` : "not registered."}`,
      `- **Running costs:** forecast at ${result.runningCostAverage} a month, the average of the last three complete months.`,
      "- **Tracking start:** " + settings.startDate + ".",
      "",
      "### Source tags",
      "",
      "- `actual`: from Xero. `tracked`: from Solidtime hours. `forecast`: from an average. `override`: a director's what-if. `manual`: entered by a director.",
    ].join("\n")
  )

  out.push(
    "## Monthly breakdown\n\nOpening balance plus every cash row equals the closing balance. VAT owed and hold-back are shown for information and aren't cash rows.\n\n" +
      markdownTable(
        ["Line", ...result.months.map((m) => m.month.slice(0, 7))],
        ROWS.map(([label, get]) => [label, ...result.months.map(get)])
      )
  )

  const reasons = result.months.filter((m) => m.holdBackReason)
  out.push(
    "## Hold-backs\n\n" +
      (reasons.length === 0
        ? "None suggested."
        : markdownTable(
            [
              "Month",
              "Amount",
              "Set by",
              "Suggested",
              "Protects the bill of",
              "Due",
            ],
            reasons.map((m) => [
              m.month.slice(0, 7),
              m.holdBack,
              m.holdBackSource,
              m.suggestedHoldBack,
              m.holdBackReason!.personName,
              m.holdBackReason!.dueOn,
            ])
          ))
  )

  const balances = [
    d.xeroClosing !== null &&
      `- **Main account, per Xero today:** ${d.xeroClosing}`,
    d.manualBalance !== null &&
      `- **Main account, entered by a director today:** ${d.manualBalance}`,
    result.taxReserveBalance !== null &&
      `- **Tax reserve (the backstop, never counted as cash to pay out):** ${result.taxReserveBalance}`,
  ].filter(Boolean)
  out.push(
    "## Balances\n\n" +
      (balances.length ? balances.join("\n") : "No balances synced yet.")
  )

  out.push(
    "## Warnings\n\nThings the forecast flags for a director to check.\n\n" +
      (d.warnings.length === 0
        ? "None."
        : d.warnings.map((w) => `- ${w.message}`).join("\n"))
  )

  const first = result.months[0].month
  const last = result.timeline.at(-1)?.date ?? result.today
  out.push(
    "## Invoices\n\nRaised and forecast invoices dated in the months shown. Amounts are before VAT. `Late` is forecast but past its date; `missed` is no longer forecast.\n\n" +
      markdownTable(
        [
          "Project",
          "Invoice",
          "Invoice date",
          "Due",
          "Status",
          "Period from",
          "Tracked days",
          "Forecast days",
          "Billed days",
          "Amount",
          "Contractor cost",
          "Set-aside",
          "Outstanding",
          "Source",
          "Override note",
        ],
        result.invoices
          .filter(
            (i) => i.linked && i.invoiceDate >= first && i.invoiceDate <= last
          )
          .map((i) => [
            i.projectName,
            i.invoiceNumber,
            i.invoiceDate,
            i.dueDate,
            i.status,
            i.periodStart,
            Number(i.trackedDays).toFixed(2),
            Number(i.forecastDays).toFixed(2),
            Number(i.totalDays).toFixed(2),
            i.amount,
            i.contractorCost,
            i.setAside,
            i.outstanding,
            i.source,
            i.overrideNote,
          ])
      )
  )

  out.push(
    "## Contractor bills\n\n`Entered` bills are stored; `forecast` ones are calculated from tracked and forecast time.\n\n" +
      markdownTable(
        [
          "Person",
          "Issued",
          "Period from",
          "Period to",
          "Amount",
          "Due",
          "Status",
          "Kind",
          "Expected to be paid",
          "Paid on",
          "Paid amount",
        ],
        result.bills.map((b) => [
          b.personName,
          b.issuedOn,
          b.periodStart,
          b.periodEnd,
          b.amount,
          b.dueOn,
          b.status,
          b.id ? "entered" : "forecast",
          b.expectedPayOn,
          b.paidOn,
          b.paidAmount,
        ])
      )
  )

  out.push(
    "## Timeline\n\nEvery cash event in date order, with the balance after it. Forecast daily running costs are left out to keep this readable, but their effect is in the balance, so the balance can step down between rows.\n\n" +
      markdownTable(
        ["Date", "Event", "Source", "Happened", "Amount", "Balance"],
        result.timeline
          .filter((e) => e.actual || e.type !== "running_cost")
          .map((e) => [
            e.date,
            e.label,
            e.source,
            e.actual ? "yes" : "no",
            e.amount,
            e.balance,
          ])
      )
  )

  out.push(
    "## Projects\n\n" +
      markdownTable(
        [
          "Code",
          "Project",
          "Kind",
          "Charge rate per day",
          "Invoice every (days)",
          "Terms (days)",
          "Active",
          "Solidtime projects",
        ],
        d.projects.map((p) => [
          p.code,
          p.name,
          p.kind,
          p.chargeRate,
          p.intervalDays,
          p.termsDays,
          p.active ? "yes" : "no",
          p.solidtimeProjects.join(", "),
        ])
      )
  )

  out.push(
    "## People\n\n" +
      markdownTable(
        [
          "Person",
          "Kind",
          "Default pay rate per day",
          "Bill terms (days)",
          "Bill cut-off (days before)",
        ],
        d.people.map((p) => [
          p.name,
          p.kind,
          p.defaultRate,
          p.termsDays,
          p.cutoffDays,
        ])
      )
  )

  if (d.adjustments.length > 0)
    out.push(
      "## One-off adjustments\n\n" +
        markdownTable(
          ["Date", "Label", "Amount", "Note"],
          d.adjustments.map((a) => [a.date, a.label, a.amount, a.note])
        )
    )

  out.push(
    "## Forecast accuracy\n\nEach raised invoice against what was forecast 14 and 7 days before its date. Blank means no forecast was recorded that early.\n\n" +
      markdownTable(
        [
          "Invoice",
          "Project",
          "Date",
          "Actual",
          "14 days before",
          "Difference",
          "7 days before",
          "Difference",
        ],
        d.accuracy.map((r) => [
          r.invoiceNumber,
          r.projectName,
          r.invoiceDate,
          r.actual,
          r.forecast14,
          r.difference14,
          r.forecast7,
          r.difference7,
        ])
      )
  )

  return out.join("\n\n") + "\n"
}
