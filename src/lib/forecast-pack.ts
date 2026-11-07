import { markdownTable } from "@/lib/analysis-pack"
import {
  accuracySummary,
  type AccuracyRow,
  type ForecastResult,
  type ForecastSettings,
  type MonthBreakdown,
} from "@/lib/forecast"

import { payoutBuckets } from "@/lib/forecast-buckets"
import {
  billBuckets,
  holdBackWhy,
  inOutMonths,
  overviewBuckets,
  timelineView,
} from "@/lib/forecast-views"

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
    endDate: string | null
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
      `- **Set-aside:** ${percent(settings.ctSetAsideRate)} × (invoice before VAT − contractor cost of that work), moved to the tax reserve the same day each client payment lands.`,
      `- **Take-home:** on the last working day of each month the main account is emptied into a director payout, split equally, apart from a £${settings.bufferGbp} buffer, VAT owed, set-asides not yet moved, and any hold-back.`,
      "- **Hold-back:** kept from a month's payout when next month's contractor bills couldn't otherwise be paid by their due dates.",
      `- **VAT:** ${settings.vatRegisteredFrom ? `registered from ${settings.vatRegisteredFrom}, at ${percent(settings.vatRate)}.` : "not registered."}`,
      `- **Director salary:** ${settings.directorSalaryGbp} a month each, paid inside the month-end payout. There are ${result.directorCount} directors.`,
      `- **Running costs:** forecast at ${result.runningCostAverage} a month, the average of the last three complete months, leaving out charges marked as one-offs and using any fixed amounts set for a supplier (${result.runningCosts.averageFromBank} from the bank alone).`,
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

  const plain = (v: string) => v
  out.push(
    "## Take-home by month\n\nEach month as a sum: money in, less money out, gives what's left from the month. Adding what comes from the bank (opening less closing balance; negative means kept in the bank) gives the payout, shared between the directors. The payout includes salary and dividends.\n\n" +
      overviewBuckets(result, plain)
        .map((b) =>
          [
            `### ${b.month.slice(0, 7)}, payout ${b.payoutDate}`,
            "",
            markdownTable(
              ["Section", "Line", "Amount"],
              [
                ...b.moneyIn.map((r) => ["Money in", r.label, r.amount]),
                ["Money in", "Total", b.moneyInTotal],
                ...b.moneyOut.map((r) => ["Money out", r.label, r.amount]),
                ["Money out", "Total", b.moneyOutTotal],
                ["Result", "Left from the month", b.left],
                ["Result", "From the bank", b.fromBank],
                ["Result", "Payout, all directors", b.payout],
                ["Result", "Take-home per director", b.takeHome],
                ["Result", "Take-home is made of", b.takeHomeNote],
                ["Result", "Leaves in the bank", b.closing],
                ...(b.holdBack ? [["Result", "Held back", b.holdBack]] : []),
                ...(b.shortfall
                  ? [["Result", "Short next month", b.shortfall]]
                  : []),
                ...(b.vatOwed ? [["Result", "VAT owed", b.vatOwed]] : []),
                ...b.leftInBank.map((r) => [
                  "Left in the bank",
                  `${r.label}${r.reason ? `: ${r.reason}` : ""}`,
                  r.amount,
                ]),
              ]
            ),
          ].join("\n")
        )
        .join("\n\n")
  )

  out.push(
    "## Money in and out, before dividends\n\nBank movements for past months, forecast for later ones. Leaves out dividends, the month-end payout and transfers, apart from tax set-asides, and money moved out and back in the same month nets off. Future salaries come from the salary setting. Negative left means the month drew on money already in the bank.\n\n" +
      inOutMonths(result, plain)
        .map((m) =>
          [
            `### ${m.month.slice(0, 7)} (${m.basis})`,
            "",
            markdownTable(
              ["Section", "Line", "Amount"],
              [
                ...m.moneyIn.map((r) => ["Money in", r.label, r.amount]),
                ["Money in", "Total", m.moneyInTotal],
                ...m.moneyOut.map((r) => ["Money out", r.label, r.amount]),
                ["Money out", "Total", m.moneyOutTotal],
                ["Result", "Left before dividends", m.left],
                [
                  "Result",
                  "Moved back from the tax reserve, not counted above",
                  m.fromReserve,
                ],
              ]
            ),
          ].join("\n")
        )
        .join("\n\n")
  )

  const reasons = result.months.filter((m) => m.holdBackReason)
  out.push(
    "## Hold-backs\n\n" +
      (reasons.length === 0
        ? "None suggested."
        : markdownTable(
            ["Month", "Amount", "Set by", "Suggested", "Why"],
            reasons.map((m) => [
              m.month.slice(0, 7),
              m.holdBack,
              m.holdBackSource,
              m.suggestedHoldBack,
              holdBackWhy(m, plain),
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

  out.push(
    "## Expected money in\n\nEvery invoice not yet fully paid, whatever its date, overdue first. Amounts are what's still to land, including any VAT. A director can leave one out or move its date as a what-if; those show the `override` source.\n\n" +
      markdownTable(
        [
          "Project",
          "Invoice",
          "Invoice date",
          "Due",
          "Status",
          "Amount",
          "Included",
          "Expected to land",
          "Source",
          "Note",
        ],
        result.expectedMoney.map((m) => [
          m.projectName,
          m.invoiceNumber,
          m.invoiceDate,
          m.dueDate,
          m.status,
          m.amount,
          m.included ? "yes" : "no",
          m.landsOn,
          m.source,
          m.note,
        ])
      )
  )

  const money = payoutBuckets(result, plain)
  const bucketText = (title: string, b: (typeof money.months)[number]) =>
    [
      `### ${title}`,
      "",
      ...(b.takeHome
        ? [`- **Take-home each:** ${b.takeHome} (${b.takeHomeNote})`]
        : []),
      `- **Invoices after tax set-aside:** ${b.each} each (before contractor bills and running costs, so it isn't take-home)`,
      `- **Invoiced in:** ${b.totalIn}, of which ${b.raised} raised and ${b.predicted} predicted${b.received !== "0.00" ? `, including ${b.received} already received` : ""}`,
      `- **Left out:** ${b.leftOut ? `${b.leftOut.count} invoices, worth ${b.leftOut.worth} (${b.leftOut.each} per director)` : "nothing"}`,
      "",
      markdownTable(
        ["Client", "Days", "Amount", "Share %", "Per director"],
        b.segments.map((seg) => [
          seg.label,
          seg.days ?? null,
          seg.amount,
          seg.percentLabel,
          b.clients.find((c) => c.client === seg.label)?.each ?? "",
        ])
      ),
      "",
      markdownTable(
        [
          "Client",
          "Project",
          "Invoice",
          "Status",
          "Counted",
          "Amount",
          "Per director",
          "Due",
          "Raise date",
          "Work from",
          "Basis",
          "Note",
        ],
        b.clients.flatMap((c) =>
          c.invoices.map((i) => [
            c.client,
            i.title,
            i.row.invoiceNumber,
            i.row.custom ? "one-off" : i.row.status,
            i.row.included ? "yes" : "no",
            i.row.amount,
            i.each,
            i.dueOn,
            i.row.custom ? null : i.row.invoiceDate,
            i.row.custom ? null : i.row.periodStart,
            i.detail,
            i.row.note ?? i.row.overrideNote,
          ])
        )
      ),
    ].join("\n")
  out.push(
    "## Money in by payout month\n\nEach invoice sits in the month its money is expected, so an overdue one is in the current month with its real due date.\n\n" +
      [
        ...money.months.map((b) =>
          bucketText(`${b.month!.slice(0, 7)}, paid ${b.payoutDate}`, b)
        ),
        ...(money.later
          ? [bucketText("Due after these months", money.later)]
          : []),
      ].join("\n\n")
  )

  const first = result.months[0].month
  const last = result.timeline.at(-1)?.date ?? result.today
  const leftOutKeys = new Set(
    result.expectedMoney.filter((m) => !m.included).map((m) => m.key)
  )
  out.push(
    "## Invoices\n\nRaised and forecast invoices dated in the months shown. Amounts are before VAT. `Late` is forecast but past its date; `missed` is no longer forecast. `Counted: no` means a director left it out, so it isn't in any figure in this document.\n\n" +
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
          "Counted",
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
            leftOutKeys.has(i.key) ? "no" : "yes",
            i.amount,
            i.contractorCost,
            i.setAside,
            i.outstanding,
            i.source,
            i.overrideNote,
          ])
      )
  )

  const bills = billBuckets(result)
  const billRow = (c: (typeof bills.paid)[number]) => [
    c.bill.personName,
    c.kind,
    c.bill.amount,
    c.payOn,
    c.bill.dueOn,
    c.late ? "yes" : "no",
    c.bill.issuedOn,
    c.bill.periodStart,
    c.bill.periodEnd,
    c.basis,
    c.bill.status,
    c.bill.paidAmount,
  ]
  const billHeaders = [
    "Person",
    "Kind",
    "Amount",
    "Pay date",
    "Due",
    "Late",
    "Issued",
    "Work from",
    "Work to",
    "Basis",
    "Status",
    "Paid amount",
  ]
  out.push(
    "## Contractor bills\n\nBy the month each bill is paid or expected to be paid. `entered` bills are stored; `calculated` ones come from tracked time for finished work; `forecast` ones include time still to come.\n\n" +
      [
        ...bills.months.map((b) =>
          [
            `### ${b.month.slice(0, 7)}: ${b.total} to contractors, ${b.count} bills`,
            "",
            `- **Entered:** ${b.entered}. **Calculated:** ${b.calculated}. **Forecast:** ${b.forecast}. **Already paid:** ${b.alreadyPaid}.`,
            `- **Split:** ${b.parts.map((p) => `${p.label} ${p.amount} (${p.percentLabel}%)`).join(", ") || "none"}`,
            `- **Balance on pay days:** ${b.danger ? `goes to ${b.danger.balance} after ${b.danger.personName} is paid on ${b.danger.date}` : "covered on every pay day"}`,
            "",
            markdownTable(billHeaders, b.cards.map(billRow)),
          ].join("\n")
        ),
        ...(bills.later.length
          ? [
              "### To pay after these months\n\n" +
                markdownTable(billHeaders, bills.later.map(billRow)),
            ]
          : []),
        "### Paid bills, newest first\n\n" +
          markdownTable(billHeaders, bills.paid.map(billRow)),
      ].join("\n\n")
  )

  const timeline = timelineView(result)
  out.push(
    "## Timeline\n\nEvery cash event in date order, with the end-of-day balance. Forecast and tracked events haven't happened yet.\n\n" +
      timeline.months
        .map((m) =>
          [
            `### ${m.month.slice(0, 7)}: in ${m.totalIn}, out ${m.totalOut}, ends ${m.closing}, lowest ${m.lowest} on ${m.lowestOn}`,
            "",
            markdownTable(
              [
                "Date",
                "Event",
                "Category",
                "Direction",
                "Amount",
                "Predicted",
                "End-of-day balance",
              ],
              m.days.flatMap((d) =>
                d.chips.flatMap((c) =>
                  c.events.map((e) => [
                    d.date,
                    e.label,
                    c.category,
                    c.direction,
                    e.amount,
                    c.predicted ? "yes" : "no",
                    d.balance,
                  ])
                )
              )
            ),
          ].join("\n")
        )
        .join("\n\n")
  )

  const costs = result.runningCosts
  const costTable = (groups: typeof costs.recurring) =>
    markdownTable(
      ["Paid to", "Date", "Amount", "Status", "Marked one-off"],
      groups.flatMap((g) =>
        g.charges.map((c) => [
          g.label,
          c.date,
          c.amount,
          c.status,
          c.oneOff ? "yes" : "no",
        ])
      )
    )
  out.push(
    `## Running costs\n\nForecast at ${costs.average} a month (${costs.averageFromBank} before one-offs and fixed amounts). Spent so far: ${costs.spent}. Still to come: ${costs.forecast}. Total: ${costs.total}. Status \`in_average\` means one of the three months behind the average, \`one_off\` is left out of it, \`fixed\` is replaced by the supplier's fixed monthly amount, \`this_month\` isn't in it yet, and \`older\` no longer counts. One-offs still count as money spent.\n\n` +
      markdownTable(
        ["Month", "Total", "Spent", "Forecast", "One-offs", "In the average"],
        costs.months.map((m) => [
          m.month.slice(0, 7),
          m.total,
          m.spent,
          m.forecast,
          m.oneOffs,
          m.inAverage ? "yes" : "no",
        ])
      ) +
      `\n\n### Fixed monthly amounts\n\n${markdownTable(
        ["Paid to", "Amount a month"],
        [...costs.recurring, ...costs.single]
          .filter((g) => g.fixedAmount !== null)
          .map((g) => [g.label, g.fixedAmount])
      )}\n\n### Recurring\n\n${costTable(costs.recurring)}\n\n### Single charges\n\n${costTable(costs.single)}`
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
          "End date",
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
          p.endDate,
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

  const accuracy = accuracySummary(d.accuracy)
  out.push(
    `## Forecast accuracy\n\nEach raised invoice against what was forecast 14 and 7 days before its date. Blank means no forecast was recorded that early. Compared so far: ${accuracy.compared}. Average miss: ${accuracy.averageMiss7 === null ? "none yet" : `${(accuracy.averageMiss7 * 100).toFixed(1)}%`} at 7 days, ${accuracy.averageMiss14 === null ? "none yet" : `${(accuracy.averageMiss14 * 100).toFixed(1)}%`} at 14 days.${accuracy.lean7 && accuracy.lean7 !== "even" ? ` Forecasts tend to run too ${accuracy.lean7 === "over" ? "high" : "low"}.` : ""}\n\n` +
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
