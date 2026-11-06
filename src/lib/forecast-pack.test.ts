import { describe, expect, it } from "vitest"

import { runForecast, type ForecastInput } from "./forecast"
import { buildForecastPack, type ForecastPackInput } from "./forecast-pack"

// All names and figures here are made up.
const input: ForecastInput = {
  today: "2026-06-01",
  settings: {
    ctSetAsideRate: 0.2,
    hoursPerDay: 7.5,
    invoiceDayRounding: 0.25,
    lookbackDays: 42,
    months: 1,
    bufferGbp: 100,
    startDate: "2026-04-21",
    vatRegisteredFrom: null,
    vatRate: 0.2,
  },
  holidays: [],
  lastXeroSync: "2026-06-01",
  projects: [
    {
      id: "pa",
      kind: "client",
      code: "AAA",
      name: "Project Alpha",
      solidtimeProjectIds: ["st-a"],
      chargeRateGbp: "500.00",
      invoiceAnchorDate: "2026-06-12",
      invoiceIntervalDays: 14,
      extraInvoiceDates: [],
      skippedInvoiceDates: [
        "2026-04-24",
        "2026-05-08",
        "2026-05-22",
        "2026-05-29",
      ],
      paymentTermsDays: 7,
      active: true,
    },
  ],
  people: [],
  payRates: [],
  entries: [],
  invoices: [],
  overrides: [
    { projectId: "pa", periodEnd: "2026-06-12", days: "2", amountGbp: null },
  ],
  cash: [
    {
      sourceId: "c",
      source: "bank_transaction",
      direction: "out",
      date: "2026-05-10",
      amount: "300.00",
      transactionType: "SPEND",
      contactId: null,
      accountId: null,
      accountGroup: "other",
      accountClass: "EXPENSE",
      salesInvoiceId: null,
      transferOtherRole: null,
      description: null,
      kind: "running_cost",
      personId: null,
    },
  ],
  bills: [],
  adjustments: [],
  holdBacks: [],
  balance: { opening: "1000.00", closing: "1000.00" },
  manualBalance: null,
  taxReserveBalance: "5000.00",
  expectations: [],
}

function pack(extra: Partial<ForecastPackInput> = {}) {
  const result = runForecast(input)
  if (result.blocked) throw new Error("blocked")
  return buildForecastPack({
    company: "Demo Ltd",
    generatedAt: new Date("2026-06-01T09:00:00Z"),
    asOf: new Date("2026-06-01T08:30:00Z"),
    settings: input.settings,
    result,
    warnings: [{ kind: "x", message: "Check this thing." }],
    accuracy: [],
    xeroClosing: "1000.00",
    manualBalance: null,
    projects: [
      {
        code: "AAA",
        name: "Project Alpha",
        kind: "client",
        chargeRate: "500.00",
        intervalDays: 14,
        termsDays: 7,
        active: true,
        solidtimeProjects: ["Alpha web", "Alpha app"],
      },
    ],
    people: [
      {
        name: "Casey Contractor",
        kind: "contractor",
        defaultRate: "300.00",
        termsDays: 30,
        cutoffDays: 7,
      },
    ],
    adjustments: [],
    ...extra,
  })
}

describe("buildForecastPack", () => {
  it("explains the rules and gives the engine's figures exactly", () => {
    const md = pack()
    expect(md).toContain("# Demo Ltd: cash and take-home forecast")
    expect(md).toContain("**Today:** 2026-06-01")
    expect(md).toContain("not statutory accounts or tax advice")
    expect(md).toContain("20% × (invoice before VAT")
    expect(md).toContain("| Opening balance | 1000.00 |")
    expect(md).toContain("| Take-home per director |")
    expect(md).toContain("- Check this thing.")
    expect(md).toContain("Alpha web, Alpha app")
    expect(md).toContain("**Tax reserve")
  })

  it("lists a forecast invoice with its override", () => {
    const row = pack()
      .split("\n")
      .find((l) => l.includes("| Project Alpha |") && l.includes("2026-06-12"))
    expect(row).toContain("| 1000.00 |")
    expect(row).toContain("| override |")
  })

  it("lists money expected in, with whether it's included", () => {
    const md = pack()
    const section = md.slice(
      md.indexOf("## Expected money in"),
      md.indexOf("## Invoices")
    )
    expect(section).toContain("| Project Alpha |")
    expect(section).toContain("| forecast |")
    expect(section).toContain("| yes |")
  })

  it("leaves forecast daily running costs out of the timeline", () => {
    const md = pack()
    const timeline = md.slice(
      md.indexOf("## Timeline"),
      md.indexOf("## Projects")
    )
    expect(timeline).not.toContain("Running costs (monthly average)")
    expect(timeline).toContain("Month-end payout to directors")
  })

  it("only includes adjustments when there are some", () => {
    expect(pack()).not.toContain("## One-off adjustments")
    expect(
      pack({
        adjustments: [
          {
            date: "2026-06-10",
            label: "One-off",
            amount: "-50.00",
            note: null,
          },
        ],
      })
    ).toContain("| 2026-06-10 | One-off | -50.00 |")
  })

  it("doesn't print a blank field as null", () => {
    expect(pack()).not.toMatch(/\bnull\b/)
  })
})
