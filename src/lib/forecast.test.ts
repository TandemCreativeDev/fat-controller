import { describe, expect, it } from "vitest"

import {
  billBuckets,
  contractorColour,
  inOutMonths,
  mergeDay,
  overviewBuckets,
  timelineView,
} from "./forecast-views"
import {
  invoiceDetail,
  invoiceShare,
  payoutBuckets,
  takeHomeNote,
  projectTitle,
} from "./forecast-buckets"
import { formatMoney } from "./format"
import {
  accuracyRows,
  accuracySummary,
  bankTransactionCashLines,
  breakdownText,
  classifyCashLine,
  contractorPayments,
  forecastCharts,
  invoiceDates,
  lastFriday,
  lastWorkingDay,
  londonDate,
  matchContractorPayments,
  moneyInTable,
  paymentCashLine,
  runForecast,
  timelineMonths,
  type CashLine,
  type ForecastInput,
  type ForecastResult,
  type RawCashLine,
  type TimelineRow,
  type TimeEntryInput,
} from "./forecast"

// All names and figures here are made up. Solidtime IDs: u-* users, st-* projects.
const CONTRACTOR = {
  id: "c1",
  name: "Casey Contractor",
  kind: "contractor" as const,
  solidtimeUserId: "u-c1",
  billTermsDays: 30,
  billCutoffDays: 7,
}
const DIRECTOR_A = {
  id: "d1",
  name: "Dana Director",
  kind: "director" as const,
  solidtimeUserId: "u-d1",
  billTermsDays: 30,
  billCutoffDays: 7,
}
const DIRECTOR_B = {
  id: "d2",
  name: "Drew Director",
  kind: "director" as const,
  solidtimeUserId: "u-d2",
  billTermsDays: 30,
  billCutoffDays: 7,
}

const PROJECT_A = {
  xeroContactId: "client-a",
  id: "pa",
  kind: "client" as const,
  code: "AAA",
  name: "Project Alpha",
  solidtimeProjectIds: ["st-a"],
  chargeRateGbp: "500.00",
  invoiceAnchorDate: "2026-05-29",
  invoiceIntervalDays: 14,
  extraInvoiceDates: [],
  skippedInvoiceDates: [],
  paymentTermsDays: 7,
  active: true,
}
const PROJECT_B = {
  xeroContactId: "client-b",
  id: "pb",
  kind: "client" as const,
  code: "BBB",
  name: "Project Beta",
  solidtimeProjectIds: ["st-b"],
  chargeRateGbp: "400.00",
  invoiceAnchorDate: "2026-06-15",
  invoiceIntervalDays: 28,
  extraInvoiceDates: [],
  skippedInvoiceDates: ["2026-05-18"],
  paymentTermsDays: 5,
  active: true,
}

function entry(
  userId: string,
  projectId: string | null,
  date: string,
  hours: number,
  extra: Partial<TimeEntryInput> = {}
): TimeEntryInput {
  return {
    id: `${userId}-${projectId}-${date}-${hours}`,
    userId,
    projectId,
    date,
    seconds: hours * 3600,
    billable: true,
    running: false,
    ...extra,
  }
}

function raw(partial: Partial<RawCashLine>): RawCashLine {
  return {
    sourceId: "tx",
    source: "bank_transaction",
    direction: "out",
    date: "2026-05-01",
    amount: "0.00",
    transactionType: "SPEND",
    contactId: null,
    accountId: null,
    accountGroup: "other",
    accountClass: "EXPENSE",
    salesInvoiceId: null,
    transferOtherRole: null,
    description: null,
    ...partial,
  }
}

const cost = (date: string, amount: string): CashLine => ({
  ...raw({ date, amount, sourceId: `cost-${date}` }),
  kind: "running_cost",
  personId: null,
})

/** The base month. Today is 1 June 2026, a Monday; 30 working days of lookback. */
function baseInput(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    today: "2026-06-01",
    settings: {
      ctSetAsideRate: 0.2,
      hoursPerDay: 7.5,
      invoiceDayRounding: 0.25,
      lookbackDays: 42,
      months: 1,
      bufferGbp: 100,
      directorSalaryGbp: 1000,
      startDate: "2026-04-21",
      vatRegisteredFrom: null,
      vatRate: 0.2,
    },
    holidays: [],
    lastXeroSync: "2026-06-01",
    projects: [PROJECT_A, PROJECT_B],
    people: [CONTRACTOR, DIRECTOR_A, DIRECTOR_B],
    payRates: [{ personId: "c1", projectId: null, dayRateGbp: "300.00" }],
    entries: [
      // 225 hours = 30 days, so the contractor's daily rate on Alpha is exactly 1.
      entry("u-c1", "st-a", "2026-05-01", 225),
      // 112.5 hours = 15 days, so the director's daily rate on Beta is exactly 0.5.
      entry("u-d1", "st-b", "2026-05-01", 112.5),
    ],
    invoices: [
      {
        invoiceId: "inv1",
        invoiceNumber: "AAA-I1",
        invoiceDate: "2026-05-29",
        dueDate: "2026-05-31",
        subTotal: "15000.00",
        totalTax: "0.00",
        total: "15000.00",
        outstanding: "15000.00",
      },
    ],
    overrides: [
      { projectId: "pb", periodEnd: "2026-06-15", days: "5", amountGbp: null },
    ],
    cash: [
      cost("2026-03-10", "300.00"),
      cost("2026-04-10", "300.00"),
      cost("2026-05-10", "300.00"),
    ],
    bills: [],
    adjustments: [
      { date: "2026-06-10", label: "One-off payment", amountGbp: "-500.00" },
    ],
    holdBacks: [],
    balance: { opening: "1000.00", closing: "1000.00" },
    manualBalance: null,
    taxReserveBalance: "5000.00",
    expectations: [],
    customInvoices: [],
    oneOffCosts: [],
    contacts: [
      { id: "client-a", name: "ALPHA HOLDINGS LTD" },
      { id: "client-b", name: "Beta Partners" },
    ],
    ...overrides,
  }
}

function run(input: ForecastInput) {
  const result: ForecastResult = runForecast(input)
  if (result.blocked) throw new Error("blocked")
  return result
}

describe("dates", () => {
  it("finds the last Friday and last working day", () => {
    expect(lastFriday("2026-11-06")).toBe("2026-11-27")
    expect(lastFriday("2026-05-01")).toBe("2026-05-29")
    expect(lastWorkingDay("2026-05-15", new Set())).toBe("2026-05-29")
    expect(lastWorkingDay("2026-05-15", new Set(["2026-05-29"]))).toBe(
      "2026-05-28"
    )
  })

  it("files a 23:30 London entry under the London date during British Summer Time", () => {
    // 23:30 on 30 June in London is 22:30 UTC, on the same date.
    expect(londonDate(new Date("2026-06-30T22:30:00Z"))).toBe("2026-06-30")
    // 00:30 on 1 July in London is still 30 June in UTC.
    expect(londonDate(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01")
    // In winter London and UTC agree.
    expect(londonDate(new Date("2026-01-31T23:30:00Z"))).toBe("2026-01-31")
  })

  it("applies extra and skipped invoice dates", () => {
    expect(
      invoiceDates(
        {
          invoiceAnchorDate: "2026-06-05",
          invoiceIntervalDays: 14,
          extraInvoiceDates: ["2026-06-10"],
          skippedInvoiceDates: ["2026-06-19"],
        },
        "2026-05-30",
        "2026-07-03"
      )
    ).toEqual(["2026-06-05", "2026-06-10", "2026-07-03"])
  })
})

describe("one full month worked by hand", () => {
  it("reproduces the hand calculation exactly", () => {
    const r = run(baseInput())
    expect(r.months).toHaveLength(1)
    const june = r.months[0]

    // Overdue invoice 15,000 + Alpha 12 June (9 days × £500) 4,500 + Beta override (5 × £400) 2,000.
    expect(june.invoicesLanding).toBe("21500.00")
    // May's bill: 30 days × £300, paid when the overdue invoice lands.
    expect(june.contractorBills).toBe("-9000.00")
    // 20% × (15,000 − 9,000) + 20% × (4,500 − 2,700) + 20% × 2,000.
    expect(june.setAsides).toBe("-1960.00")
    // £300 a month ÷ 30 days × the 29 days after today.
    expect(june.runningCosts).toBe("-290.00")
    expect(june.adjustments).toBe("-500.00")
    // 1,000 + 21,500 − 9,000 − 1,960 − 290 − 500 = 10,750, less the £100 buffer.
    expect(june.payout).toBe("10650.00")
    expect(june.directorPay).toBe("-10650.00")
    expect(june.takeHomePerDirector).toBe("5325.00")
    expect(june.closing).toBe("100.00")
    expect(june.addsUp).toBe(true)
    expect(june.holdBack).toBe("0.00")
  })

  it("lands the overdue invoice today and the override's amount on its due date", () => {
    const r = run(baseInput())
    const landed = r.timeline.filter((e) => e.type === "expected_invoice")
    expect(landed.map((e) => [e.date, e.amount])).toEqual([
      ["2026-06-01", "15000.00"],
      ["2026-06-19", "4500.00"],
      ["2026-06-20", "2000.00"],
    ])
    const beta = r.invoices.find((i) => i.invoiceDate === "2026-06-15")!
    expect(beta.source).toBe("override")
    expect(beta.setAside).toBe("400.00")
  })

  it("copies as lined-up plain text", () => {
    const text = breakdownText(run(baseInput()).months)
    const lines = text.split("\n")
    expect(lines[0]).toContain("2026-06")
    expect(text).toContain("Take-home per director")
    expect(text).toContain("5325.00")
    expect(new Set(lines.slice(1).map((l) => l.length)).size).toBe(1)
  })
})

describe("a run from the middle of a month", () => {
  it("combines actual and forecast events, and still reconciles", () => {
    const payment: CashLine = {
      ...raw({
        sourceId: "pay1",
        source: "payment",
        direction: "in",
        date: "2026-06-03",
        amount: "15000.00",
        salesInvoiceId: "inv1",
      }),
      kind: "client_payment",
      personId: null,
    }
    const dividend: CashLine = {
      ...raw({ sourceId: "div1", date: "2026-06-05", amount: "1000.00" }),
      kind: "dividend",
      personId: "d1",
    }
    const input = baseInput({
      today: "2026-06-10",
      cash: [...baseInput().cash, payment, dividend],
      invoices: [{ ...baseInput().invoices[0], outstanding: "0.00" }],
      balance: { opening: "1000.00", closing: "15000.00" },
    })
    const r = run(input)
    const june = r.months[0]
    expect(r.warnings.filter((w) => w.kind === "reconciliation")).toEqual([])
    expect(r.timeline[0]).toMatchObject({
      date: "2026-06-03",
      type: "client_payment",
      actual: true,
      source: "actual",
    })
    // The actual dividend counts towards take-home alongside the forecast payout.
    expect(Number(june.directorPay)).toBeLessThan(-1000)
    expect(june.takeHomePerDirector).toBe(
      (Number(-june.directorPay) / 2).toFixed(2)
    )
    // The set-aside owed on the 3 June payment hasn't moved, so it goes today.
    const setAside = r.timeline.find((e) => e.type === "set_aside")!
    expect(setAside.date).toBe("2026-06-10")
    expect(setAside.amount).toBe("-1200.00")
  })

  it("warns when the timeline and Xero's balance disagree", () => {
    const r = run(
      baseInput({ balance: { opening: "1000.00", closing: "1500.00" } })
    )
    expect(r.warnings.map((w) => w.kind)).toContain("reconciliation")
  })

  it("adds a manual event for a balance entered by hand", () => {
    const r = run(baseInput({ manualBalance: "1250.00" }))
    const manual = r.timeline.find((e) => e.type === "manual_balance")!
    expect(manual).toMatchObject({
      amount: "250.00",
      label: "Not yet in Xero",
      source: "manual",
    })
    expect(r.warnings.map((w) => w.kind)).not.toContain("reconciliation")
  })
})

describe("hold-back and shortfall", () => {
  // 2 June, no invoices until August, one big bill due in July.
  function tightInput(extra: Partial<ForecastInput> = {}): ForecastInput {
    return baseInput({
      today: "2026-06-02",
      settings: { ...baseInput().settings, months: 1 },
      projects: [],
      invoices: [],
      overrides: [],
      adjustments: [],
      cash: [],
      entries: [],
      balance: { opening: "5000.00", closing: "5000.00" },
      bills: [
        {
          id: "b1",
          personId: "c1",
          issuedOn: "2026-06-26",
          periodStart: "2026-05-30",
          periodEnd: "2026-06-26",
          amountGbp: "3000.00",
          dueOn: "2026-07-26",
          payOrder: null,
          plannedPayOn: null,
          paidOn: null,
          paidAmountGbp: null,
          paidByBankTransactionId: null,
          paidSource: null,
        },
      ],
      ...extra,
    })
  }

  it("suggests keeping back what next month's bills would need, and says why", () => {
    const june = run(tightInput()).months[0]
    // Opening next month with just the buffer, the £3,000 bill would leave −£2,900.
    expect(june.suggestedHoldBack).toBe("2900.00")
    expect(june.holdBack).toBe("2900.00")
    expect(june.holdBackSource).toBe("suggested")
    expect(june.payout).toBe("2000.00")
    expect(june.holdBackReason).toEqual({
      personName: "Casey Contractor",
      dueOn: "2026-07-26",
    })
    expect(june.shortfall).toBe("0.00")
  })

  it("lets a director's choice replace the suggestion", () => {
    const june = run(
      tightInput({ holdBacks: [{ month: "2026-06-01", amountGbp: "500.00" }] })
    ).months[0]
    expect(june.holdBack).toBe("500.00")
    expect(june.holdBackSource).toBe("director")
    expect(june.suggestedHoldBack).toBe("2900.00")
    expect(june.payout).toBe("4400.00")
    // The hold-back doesn't cover it, so the shortfall shows.
    expect(june.shortfall).toBe("2400.00")
  })

  it("suggests a hold-back for the last displayed month", () => {
    const input = tightInput()
    input.settings = { ...input.settings, months: 1 }
    const r = run(input)
    expect(r.months.map((m) => m.month)).toEqual(["2026-06-01"])
    expect(r.months[0].suggestedHoldBack).toBe("2900.00")
    // The hidden month stays hidden.
    expect(r.timeline.every((e) => e.date <= "2026-06-30")).toBe(true)
  })

  it("carries a month that ends short into the next", () => {
    const r = run(
      tightInput({
        today: "2026-06-30",
        settings: { ...baseInput().settings, months: 2 },
        balance: { opening: "50.00", closing: "50.00" },
        holdBacks: [{ month: "2026-06-01", amountGbp: "0.00" }],
      })
    )
    const [june, july] = r.months
    expect(june.payout).toBe("0.00")
    expect(june.closing).toBe("50.00")
    expect(july.opening).toBe("50.00")
    // The bill is forced on its due date, so July ends negative rather than resetting.
    expect(july.closing).toBe("-2950.00")
    expect(july.payout).toBe("0.00")
  })
})

describe("overrides", () => {
  const override = (o: Partial<ForecastInput["overrides"][number]>) =>
    baseInput({
      overrides: [
        {
          projectId: "pa",
          periodEnd: "2026-06-12",
          days: null,
          amountGbp: null,
          ...o,
        },
        ...baseInput().overrides,
      ],
    })
  const alpha = (r: ReturnType<typeof run>) =>
    r.invoices.find((i) => i.invoiceDate === "2026-06-12")!

  it("scales contractor days by the same factor", () => {
    // 9 forecast days overridden to 4.5: half the invoice and half the cost.
    const r = run(override({ days: "4.5" }))
    expect(alpha(r).amount).toBe("2250.00")
    expect(alpha(r).contractorCost).toBe("1350.00")
    expect(alpha(r).setAside).toBe("180.00")
    // June's bill covers 23 May to 19 June, 14 days; 4.5 of them are gone.
    const bill = r.bills.find((b) => b.issuedOn === "2026-06-26")!
    expect(bill.amount).toBe("2850.00")
  })

  it("treats zero as no work: no invoice, cost or set-aside", () => {
    const r = run(override({ days: "0" }))
    expect(alpha(r).amount).toBe("0.00")
    expect(alpha(r).contractorCost).toBe("0.00")
    expect(alpha(r).setAside).toBe("0.00")
    expect(
      r.timeline.filter(
        (e) => e.type === "expected_invoice" && e.date === "2026-06-19"
      )
    ).toEqual([])
    expect(r.bills.find((b) => b.issuedOn === "2026-06-26")!.amount).toBe(
      "1500.00"
    )
  })

  it("keeps an amount override exactly as entered", () => {
    const input = baseInput({
      projects: [{ ...PROJECT_A, chargeRateGbp: "400.00" }, PROJECT_B],
      overrides: [
        ...baseInput().overrides,
        {
          projectId: "pa",
          periodEnd: "2026-06-12",
          days: null,
          amountGbp: "1010.00",
        },
      ],
    })
    expect(alpha(run(input)).amount).toBe("1010.00")
  })

  it("counts an override on an empty period as director time", () => {
    const input = baseInput({
      entries: [],
      overrides: [
        {
          projectId: "pa",
          periodEnd: "2026-06-12",
          days: "2",
          amountGbp: null,
        },
      ],
    })
    const inv = alpha(run(input))
    expect(inv.amount).toBe("1000.00")
    expect(inv.contractorCost).toBe("0.00")
    expect(inv.setAside).toBe("200.00")
  })
})

describe("invoices", () => {
  it("rounds forecast days to the nearest quarter, half up", () => {
    const input = baseInput({
      overrides: [
        {
          projectId: "pa",
          periodEnd: "2026-06-12",
          days: "1.13",
          amountGbp: null,
        },
      ],
    })
    expect(
      run(input).invoices.find((i) => i.invoiceDate === "2026-06-12")!.amount
    ).toBe("625.00")
  })

  it("uses tracked hours and the real amount for a raised invoice", () => {
    const inv = run(baseInput()).invoices.find(
      (i) => i.invoiceNumber === "AAA-I1"
    )!
    expect(inv).toMatchObject({
      amount: "15000.00",
      contractorCost: "9000.00",
      setAside: "1200.00",
      periodStart: "2026-04-21",
      source: "actual",
    })
  })

  it("forecasts a late cycle date, then stops once it's missed", () => {
    const project = { ...PROJECT_A, invoiceAnchorDate: "2026-05-29" }
    const late = run(
      baseInput({
        today: "2026-06-16",
        projects: [project],
        invoices: [],
        overrides: [],
        lastXeroSync: "2026-06-16",
      })
    )
    const june12 = (r: typeof late) =>
      r.invoices.find((i) => i.invoiceDate === "2026-06-12")!
    expect(june12(late).status).toBe("late")
    expect(Number(june12(late).amount)).toBeGreaterThan(0)

    // Three working days on, but no sync since: still late.
    const noSync = run(
      baseInput({
        today: "2026-06-18",
        projects: [project],
        invoices: [],
        overrides: [],
        lastXeroSync: "2026-06-16",
      })
    )
    expect(june12(noSync).status).toBe("late")

    const missed = run(
      baseInput({
        today: "2026-06-18",
        projects: [project],
        invoices: [],
        overrides: [],
        lastXeroSync: "2026-06-18",
      })
    )
    expect(june12(missed).status).toBe("missed")
    expect(june12(missed).amount).toBe("0.00")
    expect(missed.warnings.map((w) => w.kind)).toContain("invoice_missed")
  })

  it("counts an entry marked non-billable like any other, with no warning", () => {
    const input = baseInput({
      overrides: [],
      entries: [entry("u-c1", "st-a", "2026-05-28", 7.5, { billable: false })],
    })
    const r = run(input)
    const inv = r.invoices.find((i) => i.invoiceNumber === "AAA-I1")!
    expect(inv.trackedDays).toBe("1.0000")
    expect(inv.contractorCost).toBe("300.00")
    expect(r.warnings.map((w) => w.kind)).not.toContain("non_billable_entry")
  })

  it("gives an unlinked invoice the full set-aside, with a warning", () => {
    const r = run(
      baseInput({
        invoices: [
          {
            invoiceId: "old",
            invoiceNumber: "AAA-I0",
            invoiceDate: "2026-03-01",
            dueDate: "2026-03-08",
            subTotal: "1000.00",
            totalTax: "0.00",
            total: "1000.00",
            outstanding: "1000.00",
          },
        ],
        overrides: [],
        projects: [],
        entries: [],
      })
    )
    const inv = r.invoices.find((i) => i.invoiceId === "old")!
    expect(inv.linked).toBe(false)
    expect(inv.setAside).toBe("200.00")
    expect(r.warnings.map((w) => w.kind)).toContain("invoice_not_linked")
  })
})

describe("one code across several Solidtime projects", () => {
  it("counts every mapped Solidtime project towards the invoice", () => {
    const r = run(
      baseInput({
        projects: [{ ...PROJECT_A, solidtimeProjectIds: ["st-a", "st-a2"] }],
        overrides: [],
        invoices: [
          { ...baseInput().invoices[0], subTotal: "1000.00", total: "1000.00" },
        ],
        entries: [
          entry("u-c1", "st-a", "2026-05-20", 7.5),
          entry("u-c1", "st-a2", "2026-05-21", 7.5),
        ],
      })
    )
    const inv = r.invoices.find((i) => i.invoiceNumber === "AAA-I1")!
    expect(inv.trackedDays).toBe("2.0000")
    expect(inv.contractorCost).toBe("600.00")
  })

  it("covers a real invoice's whole period, even from before the forecast began", () => {
    const r = run(
      baseInput({
        projects: [PROJECT_A],
        overrides: [],
        settings: { ...baseInput().settings, startDate: "2026-05-25" },
        invoices: [
          { ...baseInput().invoices[0], invoiceNumber: "AAA-I2" },
          {
            ...baseInput().invoices[0],
            invoiceId: "inv0",
            invoiceNumber: "AAA-I1",
            invoiceDate: "2026-05-15",
            outstanding: "0.00",
          },
        ],
        entries: [entry("u-c1", "st-a", "2026-05-20", 7.5)],
      })
    )
    const inv = r.invoices.find((i) => i.invoiceNumber === "AAA-I2")!
    expect(inv.periodStart).toBe("2026-05-16")
    expect(inv.contractorCost).toBe("300.00")
  })
})

describe("work from before the forecast began", () => {
  const contractorLine = (date: string): CashLine => ({
    ...raw({ sourceId: `t-${date}`, date, amount: "100.00" }),
    kind: "contractor_payment",
    personId: "c1",
  })
  const noBill = (input: ForecastInput) =>
    run(input).warnings.filter((w) => w.kind === "contractor_paid_no_bill")

  it("links an older invoice paid inside the forecast, using its tracked hours", () => {
    const r = run(
      baseInput({
        settings: { ...baseInput().settings, startDate: "2026-05-01" },
        projects: [PROJECT_A],
        overrides: [],
        entries: [entry("u-c1", "st-a", "2026-04-20", 7.5)],
        invoices: [
          {
            invoiceId: "old",
            invoiceNumber: "AAA-I1",
            invoiceDate: "2026-04-24",
            dueDate: "2026-05-08",
            subTotal: "500.00",
            totalTax: "0.00",
            total: "500.00",
            outstanding: "0.00",
          },
        ],
        cash: [
          {
            ...raw({
              sourceId: "p",
              source: "payment",
              direction: "in",
              date: "2026-05-08",
              amount: "500.00",
              salesInvoiceId: "old",
            }),
            kind: "client_payment",
            personId: null,
          },
        ],
      })
    )
    const inv = r.invoices.find((i) => i.invoiceId === "old")!
    expect(inv.linked).toBe(true)
    expect(inv.contractorCost).toBe("300.00")
    expect(inv.setAside).toBe("40.00")
    expect(r.warnings.map((w) => w.kind)).not.toContain("invoice_not_linked")
  })

  it("doesn't warn about a payment before the first bill date, but does after it", () => {
    const start = { ...baseInput().settings, startDate: "2026-05-01" }
    const base = { settings: start, projects: [], overrides: [], invoices: [] }
    // The first bill date after 1 May is 29 May.
    expect(
      noBill(baseInput({ ...base, cash: [contractorLine("2026-05-05")] }))
    ).toEqual([])
    expect(
      noBill(baseInput({ ...base, cash: [contractorLine("2026-05-30")] }))
    ).toHaveLength(1)
  })
})

describe("contractor and director time", () => {
  it("bills a contractor's internal and no-project time, but invoices none of it", () => {
    const internal = {
      ...PROJECT_B,
      id: "pi",
      kind: "internal" as const,
      code: null,
      solidtimeProjectIds: ["st-i"],
      chargeRateGbp: null,
      invoiceAnchorDate: null,
    }
    const r = run(
      baseInput({
        projects: [PROJECT_A, internal],
        invoices: [],
        overrides: [],
        // 7.5 hours each: one internal day and one with no project.
        entries: [
          entry("u-c1", "st-i", "2026-05-20", 7.5),
          entry("u-c1", null, "2026-05-21", 7.5),
        ],
      })
    )
    expect(r.bills.find((b) => b.issuedOn === "2026-05-29")!.amount).toBe(
      "600.00"
    )
    expect(r.invoices.filter((i) => i.projectId === "pi")).toEqual([])
    // No client time, so Alpha's forecast invoices are empty.
    expect(
      r.invoices.every((i) => i.projectId !== "pa" || i.amount === "0.00")
    ).toBe(true)
  })

  it("ignores a director's internal time", () => {
    const withTime = run(
      baseInput({
        entries: [
          ...baseInput().entries,
          entry("u-d1", null, "2026-05-20", 7.5),
        ],
      })
    ).months[0]
    expect(withTime.takeHomePerDirector).toBe(
      run(baseInput()).months[0].takeHomePerDirector
    )
  })

  it("won't run while a contractor has no default rate", () => {
    const result = runForecast(baseInput({ payRates: [] }))
    expect(result).toEqual({
      blocked: true,
      missingDefaultRate: ["Casey Contractor"],
    })
  })
})

describe("contractor bills", () => {
  it("pays a last-Friday bill no earlier than the 1st of the next month", () => {
    // Plenty of money on the 29th, but the bill still waits for June.
    const r = run(
      baseInput({
        today: "2026-05-29",
        overrides: [],
        invoices: [],
        balance: { opening: "50000.00", closing: "50000.00" },
        holdBacks: [{ month: "2026-05-01", amountGbp: "20000.00" }],
      })
    )
    const bill = r.bills.find((b) => b.issuedOn === "2026-05-29")!
    expect(bill.expectedPayOn).toBe("2026-06-01")
  })

  it("ends each period a week before the bill, and follows the cycle from the start", () => {
    const r = run(
      baseInput({
        today: "2026-10-01",
        settings: { ...baseInput().settings, startDate: "2026-09-01" },
        projects: [],
        overrides: [],
        invoices: [],
        adjustments: [],
        cash: [],
        // Inside the 25 September bill: 24 August, before the forecast began, and 18 September.
        // Not in it: 21 August (the bill before) and 19 September (the bill after).
        entries: [
          entry("u-c1", null, "2026-08-21", 7.5),
          entry("u-c1", null, "2026-08-24", 7.5),
          entry("u-c1", null, "2026-09-18", 7.5),
          entry("u-c1", null, "2026-09-19", 7.5),
        ],
      })
    )
    const bill = r.bills.find((b) => b.issuedOn === "2026-09-25")!
    expect(bill.periodStart).toBe("2026-08-22")
    expect(bill.periodEnd).toBe("2026-09-18")
    expect(bill.amount).toBe("600.00")
    expect(r.bills.find((b) => b.issuedOn === "2026-10-30")!.periodStart).toBe(
      "2026-09-19"
    )
  })

  it("starts the next period after a stored bill's own end", () => {
    const r = run(
      baseInput({
        today: "2026-10-01",
        settings: { ...baseInput().settings, startDate: "2026-09-01" },
        projects: [],
        overrides: [],
        invoices: [],
        cash: [],
        entries: [entry("u-c1", null, "2026-09-22", 7.5)],
        bills: [
          {
            id: "b1",
            personId: "c1",
            issuedOn: "2026-09-25",
            periodStart: "2026-08-24",
            periodEnd: "2026-09-20",
            amountGbp: "100.00",
            dueOn: "2026-10-25",
            payOrder: null,
            plannedPayOn: null,
            paidOn: null,
            paidAmountGbp: null,
            paidByBankTransactionId: null,
            paidSource: null,
          },
        ],
      })
    )
    expect(r.bills.find((b) => b.issuedOn === "2026-10-30")?.periodStart).toBe(
      "2026-09-21"
    )
  })

  it("lets a planned date win over the default", () => {
    const stored = {
      id: "b1",
      personId: "c1",
      issuedOn: "2026-05-29",
      periodStart: "2026-04-25",
      periodEnd: "2026-05-29",
      amountGbp: "9000.00",
      dueOn: "2026-06-28",
      payOrder: null,
      plannedPayOn: "2026-06-15",
      paidOn: null,
      paidAmountGbp: null,
      paidByBankTransactionId: null,
      paidSource: null,
    }
    const r = run(baseInput({ bills: [stored] }))
    expect(r.bills.find((b) => b.id === "b1")!.expectedPayOn).toBe("2026-06-15")
  })

  it("never forecasts a payment for a paid bill", () => {
    const stored = {
      id: "b1",
      personId: "c1",
      issuedOn: "2026-05-29",
      periodStart: "2026-04-25",
      periodEnd: "2026-05-29",
      amountGbp: "9000.00",
      dueOn: "2026-06-28",
      payOrder: null,
      plannedPayOn: null,
      paidOn: "2026-05-30",
      paidAmountGbp: "9000.00",
      paidByBankTransactionId: "tx9",
      paidSource: "auto" as const,
    }
    const r = run(baseInput({ bills: [stored] }))
    expect(r.months[0].contractorBills).toBe("0.00")
    expect(r.bills.find((b) => b.id === "b1")!.status).toBe("paid")
  })
})

describe("matching contractor payments", () => {
  const payment = (id: string, date: string, amount: string) => ({
    bankTransactionId: id,
    personId: "c1",
    date,
    amount,
  })
  const open = (id: string | null, issuedOn: string, amount: string) => ({
    id,
    personId: "c1",
    issuedOn,
    periodStart: "2026-01-01",
    periodEnd: issuedOn,
    amount,
    dueOn: "2026-12-31",
  })
  const match = (
    args: Partial<Parameters<typeof matchContractorPayments>[0]>
  ) =>
    matchContractorPayments({
      payments: [],
      openBills: [],
      linkedTransactionIds: new Set(),
      excludedTransactionIds: new Set(),
      ...args,
    })

  it("prefers an exact match, to the penny", () => {
    const { closures } = match({
      payments: [payment("t1", "2026-06-10", "200.00")],
      openBills: [
        open("old", "2026-04-24", "100.00"),
        open("new", "2026-05-29", "200.00"),
      ],
    })
    expect(closures).toHaveLength(1)
    expect(closures[0].bill.id).toBe("new")
    expect(closures[0].paidSource).toBe("auto")
  })

  it("closes the oldest open bill when a contractor is paid a different amount", () => {
    const { closures } = match({
      payments: [payment("t1", "2026-06-10", "150.00")],
      openBills: [
        open(null, "2026-04-24", "100.00"),
        open(null, "2026-05-29", "200.00"),
      ],
    })
    expect(closures[0].bill.issuedOn).toBe("2026-04-24")
    expect(closures[0].paidSource).toBe("unmatched")
    // A forecast bill has no ID: the store has to save it.
    expect(closures[0].bill.id).toBeNull()
  })

  it("doesn't close a future bill with an advance", () => {
    const { closures, noBill } = match({
      payments: [payment("t1", "2026-05-01", "200.00")],
      openBills: [open(null, "2026-05-29", "200.00")],
    })
    expect(closures).toEqual([])
    expect(noBill).toHaveLength(1)
  })

  it("doesn't link a payment a director has unmatched", () => {
    const { closures, noBill } = match({
      payments: [payment("t1", "2026-06-10", "200.00")],
      openBills: [open("b1", "2026-05-29", "200.00")],
      excludedTransactionIds: new Set(["t1"]),
    })
    expect(closures).toEqual([])
    expect(noBill).toEqual([])
  })

  it("groups a split payment's contractor lines into one", () => {
    const line = (amount: string): CashLine => ({
      ...raw({ sourceId: "t1", date: "2026-06-10", amount }),
      kind: "contractor_payment",
      personId: "c1",
    })
    expect(contractorPayments([line("100.00"), line("50.50")])).toEqual([
      payment("t1", "2026-06-10", "150.50"),
    ])
  })
})

describe("set-asides", () => {
  const clientPayment = (date: string, amount: string): CashLine => ({
    ...raw({
      sourceId: `pay-${date}`,
      source: "payment",
      direction: "in",
      date,
      amount,
      salesInvoiceId: "inv1",
    }),
    kind: "client_payment",
    personId: null,
  })
  const invoice = {
    invoiceId: "inv1",
    invoiceNumber: "AAA-I1",
    invoiceDate: "2026-05-29",
    dueDate: "2026-06-05",
    subTotal: "1000.00",
    totalTax: "0.00",
    total: "1000.00",
    outstanding: "666.67",
  }

  it("rounds a part-payment's share to the penny", () => {
    const r = run(
      baseInput({
        today: "2026-06-05",
        projects: [{ ...PROJECT_A, invoiceAnchorDate: null }],
        invoices: [invoice],
        overrides: [],
        entries: [],
        adjustments: [],
        cash: [clientPayment("2026-06-04", "333.33")],
        balance: { opening: "0.00", closing: "333.33" },
      })
    )
    const moves = r.timeline.filter((e) => e.type === "set_aside")
    // 333.33 ÷ 1,000 × £200 = 66.666, then the rest of it on the remaining 666.67.
    expect(moves.map((m) => m.amount)).toEqual(["-66.67", "-133.33"])
  })

  it("carries a set-aside owed from last month's payment into the 1st", () => {
    const r = run(
      baseInput({
        projects: [{ ...PROJECT_A, invoiceAnchorDate: null }],
        invoices: [{ ...invoice, outstanding: "0.00" }],
        overrides: [],
        entries: [],
        adjustments: [],
        cash: [clientPayment("2026-05-30", "1000.00")],
      })
    )
    expect(r.timeline.find((e) => e.type === "set_aside")).toMatchObject({
      date: "2026-06-01",
      amount: "-200.00",
    })
  })

  it("settles what's owed with actual transfers, oldest first", () => {
    const transfer: CashLine = {
      ...raw({
        sourceId: "t",
        date: "2026-05-31",
        amount: "200.00",
        transactionType: "SPEND-TRANSFER",
      }),
      kind: "set_aside",
      personId: null,
    }
    const r = run(
      baseInput({
        projects: [{ ...PROJECT_A, invoiceAnchorDate: null }],
        invoices: [{ ...invoice, outstanding: "0.00" }],
        overrides: [],
        entries: [],
        adjustments: [],
        cash: [clientPayment("2026-05-30", "1000.00"), transfer],
      })
    )
    expect(r.timeline.filter((e) => e.type === "set_aside")).toEqual([])
  })

  it("keeps a client payment landing on payout day out of the payout", () => {
    const r = run(
      baseInput({
        today: "2026-06-30",
        projects: [{ ...PROJECT_A, invoiceAnchorDate: null }],
        invoices: [
          { ...invoice, dueDate: "2026-06-30", outstanding: "1000.00" },
        ],
        people: [DIRECTOR_A, DIRECTOR_B],
        overrides: [],
        entries: [],
        adjustments: [],
        cash: [],
        balance: { opening: "100.00", closing: "100.00" },
      })
    )
    // 1,100 − 100 buffer − 200 set-aside, which moves tomorrow.
    expect(r.months[0].payout).toBe("800.00")
    expect(r.months[0].takeHomePerDirector).toBe("400.00")
  })

  const back = (date: string, amount: string): CashLine => ({
    ...raw({ sourceId: `back-${date}`, direction: "in", date, amount }),
    kind: "backstop_in",
    personId: null,
  })
  const noWork = {
    projects: [{ ...PROJECT_A, invoiceAnchorDate: null }],
    invoices: [{ ...invoice, outstanding: "0.00" }],
    overrides: [],
    entries: [],
    adjustments: [],
    people: [DIRECTOR_A, DIRECTOR_B],
    payRates: [],
  }

  it("repays money taken from the reserve on payout day, out of the payout", () => {
    const r = run(
      baseInput({
        ...noWork,
        cash: [back("2026-06-01", "500.00")],
        balance: { opening: "1000.00", closing: "1500.00" },
      })
    )
    const june = r.months[0]
    expect(june.backstopIn).toBe("500.00")
    const repay = r.timeline.find((e) => e.type === "reserve_repayment")!
    expect(repay).toMatchObject({
      date: "2026-06-30",
      amount: "-500.00",
      label: "Repay tax reserve",
    })
    // 1,500 less the 500 going back, less the buffer. The loan adds nothing.
    expect(june.setAsides).toBe("-500.00")
    expect(june.payout).toBe("900.00")
  })

  it("doesn't repay again once transfers have covered it", () => {
    const transfer: CashLine = {
      ...raw({ sourceId: "t", date: "2026-05-20", amount: "500.00" }),
      kind: "set_aside",
      personId: null,
    }
    const r = run(
      baseInput({
        ...noWork,
        cash: [back("2026-05-10", "500.00"), transfer],
      })
    )
    expect(r.timeline.filter((e) => e.type === "reserve_repayment")).toEqual([])
  })

  it("stays out of the payout while waiting to go back", () => {
    // Taken on payout day itself: it's repaid that day, before the payout.
    const r = run(
      baseInput({
        ...noWork,
        today: "2026-06-30",
        cash: [back("2026-06-30", "300.00")],
        balance: { opening: "100.00", closing: "400.00" },
      })
    )
    expect(r.months[0].payout).toBe("0.00")
    expect(r.months[0].closing).toBe("100.00")
  })
})

describe("VAT", () => {
  it("holds VAT owed back from the payout", () => {
    const vatInput = baseInput({
      today: "2026-06-30",
      settings: { ...baseInput().settings, vatRegisteredFrom: "2026-05-01" },
      projects: [],
      overrides: [],
      entries: [],
      adjustments: [],
      cash: [
        {
          ...raw({
            sourceId: "p",
            source: "payment",
            direction: "in",
            date: "2026-06-10",
            amount: "1200.00",
            salesInvoiceId: "v1",
          }),
          kind: "client_payment",
          personId: null,
        },
      ],
      invoices: [
        {
          invoiceId: "v1",
          invoiceNumber: "ZZZ-I1",
          invoiceDate: "2026-06-01",
          dueDate: "2026-06-08",
          subTotal: "1000.00",
          totalTax: "200.00",
          total: "1200.00",
          outstanding: "0.00",
        },
      ],
      balance: { opening: "100.00", closing: "1300.00" },
    })
    const june = run(vatInput).months[0]
    // Set-aside on the amount before VAT only: 20% × 1,000.
    expect(june.setAsides).toBe("-200.00")
    expect(june.vatOwed).toBe("200.00")
    // 1,300 − 200 set-aside − 100 buffer − 200 VAT.
    expect(june.payout).toBe("800.00")
  })
})

describe("classifying", () => {
  const ctx = {
    people: [
      { id: "c1", kind: "contractor" as const },
      { id: "d1", kind: "director" as const },
    ],
    contactToPerson: new Map([
      ["contact-c1", "c1"],
      ["contact-d1", "d1"],
    ]),
    vatLiabilityAccountId: "vat",
  }
  const kind = (l: Partial<RawCashLine>) => classifyCashLine(raw(l), ctx).kind

  it("applies the spend rules in order", () => {
    expect(
      kind({
        transactionType: "SPEND-TRANSFER",
        transferOtherRole: "tax_reserve",
      })
    ).toBe("set_aside")
    expect(kind({ transactionType: "SPEND-TRANSFER" })).toBe(
      "other_transfer_out"
    )
    expect(kind({ accountId: "vat" })).toBe("vat_payment")
    expect(kind({ contactId: "contact-c1", accountGroup: "people" })).toBe(
      "contractor_payment"
    )
    expect(kind({ contactId: "contact-d1", accountGroup: "people" })).toBe(
      "director_salary"
    )
    expect(
      kind({
        contactId: "contact-d1",
        accountGroup: "exclude",
        accountClass: "EQUITY",
      })
    ).toBe("dividend")
    expect(kind({ contactId: "contact-d1", accountGroup: "other" })).toBe(
      "running_cost"
    )
  })

  it("applies the money-in rules in order", () => {
    expect(kind({ direction: "in", salesInvoiceId: "i" })).toBe(
      "client_payment"
    )
    expect(
      kind({
        direction: "in",
        transactionType: "RECEIVE-TRANSFER",
        transferOtherRole: "tax_reserve",
      })
    ).toBe("backstop_in")
    expect(kind({ direction: "in", transactionType: "RECEIVE-TRANSFER" })).toBe(
      "other_transfer_in"
    )
    expect(kind({ direction: "in", transactionType: "RECEIVE" })).toBe(
      "other_in"
    )
  })

  it("treats interest as other money in, with no set-aside", () => {
    const interest = classifyCashLine(
      raw({ direction: "in", date: "2026-06-01", amount: "12.34" }),
      ctx
    )
    const r = run(
      baseInput({
        projects: [],
        overrides: [],
        invoices: [],
        entries: [],
        adjustments: [],
        cash: [interest],
        balance: { opening: "0.00", closing: "12.34" },
      })
    )
    expect(r.months[0].otherIn).toBe("12.34")
    expect(r.timeline.filter((e) => e.type === "set_aside")).toEqual([])
  })

  it("keeps a transfer to another account out of the running-cost average", () => {
    const transfer = classifyCashLine(
      raw({
        date: "2026-05-15",
        amount: "9000.00",
        transactionType: "SPEND-TRANSFER",
      }),
      ctx
    )
    const r = run(baseInput({ cash: [...baseInput().cash, transfer] }))
    expect(r.runningCostAverage).toBe("300.00")
  })

  it("splits a spend payment across its coded accounts, each classified alone", () => {
    const lines = bankTransactionCashLines({
      bankTransactionId: "t1",
      type: "SPEND",
      date: "2026-06-01",
      total: "120.01",
      contactId: "contact-c1",
      reference: null,
      transferOtherRole: null,
      lineAmountTypes: "Inclusive",
      lines: [
        {
          accountId: "a",
          accountGroup: "people",
          accountClass: "EXPENSE",
          lineAmount: "100.00",
          taxAmount: "0",
          description: "Work",
        },
        {
          accountId: "b",
          accountGroup: "other",
          accountClass: "EXPENSE",
          lineAmount: "20.00",
          taxAmount: "0",
          description: "Train",
        },
      ],
    })
    expect(lines.map((l) => l.amount)).toEqual(["100.00", "20.01"])
    expect(lines.map((l) => classifyCashLine(l, ctx).kind)).toEqual([
      "contractor_payment",
      "running_cost",
    ])
  })

  it("counts each payment in a batch once, and never a batch total", () => {
    const lines = ["400.00", "600.00"].map((amount, i) =>
      paymentCashLine({
        paymentId: `p${i}`,
        paymentType: "ACCRECPAYMENT",
        date: "2026-06-01",
        amount,
        contactId: null,
        salesInvoiceId: "inv1",
        accountId: null,
        accountGroup: null,
        accountClass: null,
        description: null,
      })
    )
    expect(lines.map((l) => [l.direction, l.amount])).toEqual([
      ["in", "400.00"],
      ["in", "600.00"],
    ])
  })

  it("works out a payment's direction from its type and sign", () => {
    const line = (paymentType: string, amount: string) =>
      paymentCashLine({
        paymentId: "p",
        paymentType,
        date: "2026-06-01",
        amount,
        contactId: null,
        salesInvoiceId: null,
        accountId: null,
        accountGroup: null,
        accountClass: null,
        description: null,
      }).direction
    expect(line("ACCPAYPAYMENT", "10")).toBe("out")
    expect(line("ACCRECPAYMENT", "10")).toBe("in")
    expect(line("ACCRECPAYMENT", "-10")).toBe("out")
    expect(line("APCREDITPAYMENT", "10")).toBe("in")
  })
})

describe("the breakdown", () => {
  it("adds up with interest, money back from the reserve and a transfer out", () => {
    const line = (
      l: Partial<RawCashLine>,
      kind: CashLine["kind"]
    ): CashLine => ({
      ...raw({ date: "2026-06-01", ...l }),
      kind,
      personId: null,
    })
    const r = run(
      baseInput({
        cash: [
          ...baseInput().cash,
          line({ amount: "10.00", direction: "in", sourceId: "i" }, "other_in"),
          line(
            { amount: "500.00", direction: "in", sourceId: "b" },
            "backstop_in"
          ),
          line({ amount: "75.00", sourceId: "o" }, "other_transfer_out"),
        ],
        balance: { opening: "1000.00", closing: "1435.00" },
      })
    )
    const june = r.months[0]
    expect(june.addsUp).toBe(true)
    expect(june.otherIn).toBe("10.00")
    expect(june.backstopIn).toBe("500.00")
    expect(june.otherTransfersOut).toBe("-75.00")
    expect(r.warnings.map((w) => w.kind)).not.toContain("breakdown")
    expect(r.warnings.map((w) => w.kind)).not.toContain("reconciliation")
  })
})

describe("expected money in", () => {
  // The overdue invoice is £15,000, with a £1,200 set-aside.
  const withExpectation = (e: Partial<ForecastInput["expectations"][number]>) =>
    run(
      baseInput({
        expectations: [
          { invoiceKey: "inv1", excluded: false, expectedOn: null, ...e },
        ],
      })
    )
  const row = (r: ReturnType<typeof run>) =>
    r.expectedMoney.find((m) => m.key === "inv1")!

  it("lists every unpaid invoice, however old, and how it's expected", () => {
    const r = run(baseInput())
    expect(row(r)).toMatchObject({
      status: "overdue",
      amount: "15000.00",
      landsOn: "2026-06-01",
      included: true,
      source: "actual",
    })
    expect(r.expectedMoney.map((m) => m.status)).toContain("forecast")
  })

  it("leaves an invoice out: no money, no set-aside, and the bill still has to be paid", () => {
    const base = run(baseInput()).months[0]
    const r = withExpectation({ excluded: true })
    const june = r.months[0]
    expect(row(r)).toMatchObject({
      included: false,
      landsOn: null,
      source: "override",
    })
    expect(june.invoicesLanding).toBe("6500.00")
    expect(Number(june.setAsides)).toBe(Number(base.setAsides) + 1200)
    expect(
      r.timeline.some(
        (e) => e.date === "2026-06-01" && e.type === "expected_invoice"
      )
    ).toBe(false)
    expect(Number(june.takeHomePerDirector)).toBeLessThan(
      Number(base.takeHomePerDirector)
    )
  })

  it("moves when an invoice lands, taking its set-aside with it", () => {
    const r = withExpectation({ expectedOn: "2026-07-10" })
    expect(row(r).landsOn).toBe("2026-07-10")
    expect(
      r.timeline.filter((e) => e.date === "2026-07-10").map((e) => e.type)
    ).toEqual([])
    expect(r.months[0].invoicesLanding).toBe("6500.00")
  })

  it("treats a date in the past as today", () => {
    expect(row(withExpectation({ expectedOn: "2026-05-01" })).landsOn).toBe(
      "2026-06-01"
    )
  })

  it("keeps forecast invoices that land after the window, once dated inside it", () => {
    const r = run(baseInput())
    const late = r.expectedMoney.find((m) => m.invoiceDate === "2026-06-26")!
    expect(late.landsOn).toBe("2026-07-03")
  })
})

describe("the money in table", () => {
  const payment: CashLine = {
    ...raw({
      sourceId: "pay",
      source: "payment",
      direction: "in",
      date: "2026-06-03",
      amount: "700.00",
      salesInvoiceId: "paid",
    }),
    kind: "client_payment",
    personId: null,
  }
  const paidInvoice = {
    invoiceId: "paid",
    invoiceNumber: "AAA-I0",
    invoiceDate: "2026-05-15",
    dueDate: "2026-05-22",
    subTotal: "700.00",
    totalTax: "0.00",
    total: "700.00",
    outstanding: "0.00",
  }

  it("matches the breakdown's invoices landing, including money already received", () => {
    const base = baseInput({
      today: "2026-06-05",
      settings: { ...baseInput().settings, months: 2 },
      cash: [...baseInput().cash, payment],
      invoices: [...baseInput().invoices, paidInvoice],
      balance: { opening: "1000.00", closing: "1700.00" },
    })
    const r = run(base)
    const groups = moneyInTable(r)
    const june = groups.find((g) => g.month === "2026-06-01")!
    const july = groups.find((g) => g.month === "2026-07-01")!
    expect(june.received).toBe("700.00")
    expect(june.totalAmount).toBe(r.months[0].invoicesLanding)
    expect(july.totalAmount).toBe(r.months[1].invoicesLanding)
    expect(june.rows.some((x) => x.invoiceNumber === "AAA-I0")).toBe(false)
  })

  it("groups by when the money lands, sorted, with overdue invoices first", () => {
    const groups = moneyInTable(run(baseInput()))
    const june = groups.find((g) => g.month === "2026-06-01")!
    expect(june.rows.map((x) => [x.status, x.landsOn])).toEqual([
      ["overdue", "2026-06-01"],
      ["forecast", "2026-06-19"],
      ["forecast", "2026-06-20"],
    ])
    expect(june.received).toBe("0.00")
    // Beyond June: the 26 June invoice lands in July.
    const later = groups.find((g) => g.kind === "later")!
    expect(later.rows[0].landsOn).toBe("2026-07-03")
    expect(later.received).toBeNull()
  })

  it("keeps a left-out invoice in its month's rows, out of the month's total", () => {
    const r = run(
      baseInput({
        expectations: [
          { invoiceKey: "inv1", excluded: true, expectedOn: null },
        ],
      })
    )
    const groups = moneyInTable(r)
    const june = groups.find((g) => g.month === "2026-06-01")!
    const row = june.rows.find((x) => x.key === "inv1")!
    expect(row.included).toBe(false)
    expect(row.amount).toBe("15000.00")
    expect(row.landsOn).toBe("2026-06-01")
    expect(june.totalAmount).toBe(r.months[0].invoicesLanding)
    expect(june.totalAmount).toBe("6500.00")
    expect(groups.map((g) => g.kind)).not.toContain("left_out")
  })

  it("keeps a £0 override listed, so it can be changed back", () => {
    const r = run(
      baseInput({
        overrides: [
          ...baseInput().overrides,
          {
            projectId: "pa",
            periodEnd: "2026-06-12",
            days: "0",
            amountGbp: null,
          },
        ],
      })
    )
    const row = moneyInTable(r)
      .flatMap((g) => g.rows)
      .find((x) => x.invoiceDate === "2026-06-12")!
    expect(row).toMatchObject({
      amount: "0.00",
      hasOverride: true,
      overrideDays: "0",
      canOverride: true,
    })
  })

  it("only lets forecast invoices have their days changed", () => {
    const rows = moneyInTable(run(baseInput())).flatMap((g) => g.rows)
    expect(rows.find((x) => x.key === "inv1")!.canOverride).toBe(false)
    expect(rows.find((x) => x.status === "forecast")!.canOverride).toBe(true)
  })
})

describe("project end dates", () => {
  const ending = (endDate: string) =>
    run(
      baseInput({
        projects: [{ ...PROJECT_A, endDate }],
        overrides: [],
        settings: { ...baseInput().settings, months: 2 },
      })
    )
  const forecast = (r: ReturnType<typeof run>) =>
    r.invoices.filter((i) => i.status === "forecast")

  it("stops predicted invoices after one last one covering the end", () => {
    // Cycle dates are 12 and 26 June; the end falls in the period up to the 26th.
    const r = ending("2026-06-17")
    expect(forecast(r).map((i) => i.invoiceDate)).toEqual([
      "2026-06-12",
      "2026-06-26",
    ])
    const last = forecast(r).at(-1)!
    // 15, 16 and 17 June only: three working days at one day each.
    expect(last.forecastDays).toBe("3.0000")
    expect(last.amount).toBe("1500.00")
  })

  it("drops the last invoice when no work is left to bill", () => {
    // Ends on Saturday 13 June: nothing tracked, and no working days after the 12th.
    const r = ending("2026-06-13")
    expect(forecast(r).map((i) => i.invoiceDate)).toEqual(["2026-06-12"])
  })

  it("keeps that invoice if time turns up, or a director overrides it", () => {
    const tracked = run(
      baseInput({
        today: "2026-06-16",
        projects: [{ ...PROJECT_A, endDate: "2026-06-13" }],
        overrides: [],
        entries: [
          ...baseInput().entries,
          entry("u-c1", "st-a", "2026-06-15", 7.5),
        ],
      })
    )
    expect(tracked.invoices.some((i) => i.invoiceDate === "2026-06-26")).toBe(
      true
    )
    const overridden = run(
      baseInput({
        projects: [{ ...PROJECT_A, endDate: "2026-06-13" }],
        overrides: [
          {
            projectId: "pa",
            periodEnd: "2026-06-26",
            days: "1",
            amountGbp: null,
          },
        ],
      })
    )
    expect(
      overridden.invoices.find((i) => i.invoiceDate === "2026-06-26")!.amount
    ).toBe("500.00")
  })

  it("stops contractor bills too", () => {
    const r = ending("2026-06-17")
    const after = r.bills.filter((b) => b.issuedOn > "2026-06-26")
    expect(after).toEqual([])
    // 2 to 17 June: 12 working days at £300.
    expect(r.bills.find((b) => b.issuedOn === "2026-06-26")!.amount).toBe(
      "3600.00"
    )
  })

  it("forecasts on and on with no end date", () => {
    const r = run(
      baseInput({
        overrides: [],
        settings: { ...baseInput().settings, months: 2 },
      })
    )
    expect(
      r.invoices.filter(
        (i) => i.projectId === "pa" && i.invoiceDate > "2026-06-26"
      ).length
    ).toBeGreaterThan(1)
  })

  it("still shows a real invoice raised after the end", () => {
    const r = run(
      baseInput({
        projects: [{ ...PROJECT_A, endDate: "2026-05-01" }],
        overrides: [],
      })
    )
    expect(r.invoices.some((i) => i.invoiceNumber === "AAA-I1")).toBe(true)
    expect(forecast(r).filter((i) => i.projectId === "pa").length).toBeLessThan(
      2
    )
  })
})

describe("one-off invoices", () => {
  const oneOff = {
    id: "11111111-1111-4111-8111-111111111111",
    label: "Workshop for a friend",
    amountGbp: "1000.00",
    contractorCostGbp: "200.00",
    landsOn: "2026-06-16",
    note: "Only we know about this",
  }
  const key = `custom:${oneOff.id}`
  const withOneOff = (extra: Partial<ForecastInput> = {}) =>
    run(baseInput({ customInvoices: [oneOff], ...extra }))

  it("lands its money and sets aside 20% of its margin", () => {
    const base = run(baseInput()).months[0]
    const r = withOneOff()
    expect(Number(r.months[0].invoicesLanding)).toBe(
      Number(base.invoicesLanding) + 1000
    )
    expect(Number(r.months[0].setAsides)).toBe(Number(base.setAsides) - 160)
    expect(
      r.timeline.find(
        (e) => e.label === "One-off invoice: Workshop for a friend"
      )
    ).toMatchObject({
      date: "2026-06-16",
      amount: "1000.00",
      source: "manual",
      actual: false,
    })
    // 800 more for the directors between them.
    expect(Number(r.months[0].payout)).toBe(Number(base.payout) + 840)
  })

  it("appears in the money in table, adding up with the breakdown", () => {
    const r = withOneOff()
    const june = moneyInTable(r).find((g) => g.month === "2026-06-01")!
    const row = june.rows.find((x) => x.key === key)!
    expect(row.status).toBe("one-off")
    expect(row.canOverride).toBe(false)
    expect(row.custom).toEqual({
      id: oneOff.id,
      amount: "1000.00",
      cost: "200.00",
      landsOn: "2026-06-16",
    })
    expect(june.totalAmount).toBe(r.months[0].invoicesLanding)
  })

  it("can be left out with the eye, staying in its row", () => {
    const base = run(baseInput()).months[0]
    const r = withOneOff({
      expectations: [{ invoiceKey: key, excluded: true, expectedOn: null }],
    })
    expect(r.months[0].invoicesLanding).toBe(base.invoicesLanding)
    const june = moneyInTable(r).find((g) => g.month === "2026-06-01")!
    expect(june.rows.find((x) => x.key === key)!.included).toBe(false)
  })

  it("stays listed when it lands after the months shown", () => {
    const r = withOneOff({
      customInvoices: [{ ...oneOff, landsOn: "2027-03-01" }],
    })
    const later = moneyInTable(r).find((g) => g.kind === "later")!
    expect(later.rows.some((x) => x.key === key)).toBe(true)
  })

  it("lands today if its date has passed", () => {
    const r = withOneOff({
      customInvoices: [{ ...oneOff, landsOn: "2026-05-01" }],
    })
    expect(r.expectedMoney.find((m) => m.key === key)!.landsOn).toBe(
      "2026-06-01"
    )
  })

  it("adds VAT once registered, with the set-aside before VAT", () => {
    const r = withOneOff({
      settings: { ...baseInput().settings, vatRegisteredFrom: "2026-01-01" },
    })
    expect(r.expectedMoney.find((m) => m.key === key)!.amount).toBe("1200.00")
    expect(r.invoices.find((i) => i.key === key)!.setAside).toBe("160.00")
  })
})

describe("payout buckets", () => {
  const buckets = (extra: Partial<ForecastInput> = {}) =>
    payoutBuckets(
      run(
        baseInput({
          settings: { ...baseInput().settings, months: 2 },
          ...extra,
        })
      ),
      formatMoney
    )
  const find = (b: ReturnType<typeof buckets>["months"][number], key: string) =>
    b.clients.flatMap((c) => c.invoices).find((i) => i.row.key === key)!

  it("says what the take-home is made of", () => {
    const ready = (salary: number) => ({
      ...run(baseInput()),
      directorCount: 2,
      salaryPerMonth: String(salary * 2),
    })
    const plain = (v: string) => v
    expect(takeHomeNote(ready(100), "150.00", plain)).toBe(
      "100.00 salary + 50.00 dividend"
    )
    expect(takeHomeNote(ready(100), "100.00", plain)).toBe(
      "100.00 salary, no dividend"
    )
    expect(takeHomeNote(ready(100), "60.00", plain)).toBe(
      "60.00 salary, 40.00 short of the full salary, no dividend"
    )
    expect(takeHomeNote(ready(0), "60.00", plain)).toBe(
      "Salary and dividend together"
    )
  })

  it("heads each month with its take-home, not the invoice share", () => {
    const input = baseInput({
      settings: { ...baseInput().settings, months: 2 },
    })
    const result = run(input)
    const { months, later } = payoutBuckets(result, formatMoney)
    expect(months.map((b) => b.takeHome)).toEqual(
      result.months.map((m) => m.takeHomePerDirector)
    )
    expect(later?.takeHome ?? null).toBeNull()
  })

  it("puts an invoice in the month of its due date, including one due on payout day", () => {
    const { months } = buckets({
      invoices: [
        {
          invoiceId: "payday",
          contactId: "client-a",
          invoiceNumber: "AAA-I9",
          invoiceDate: "2026-06-16",
          dueDate: "2026-06-30",
          subTotal: "1000.00",
          totalTax: "0.00",
          total: "1000.00",
          outstanding: "1000.00",
        },
      ],
      overrides: [],
    })
    const june = months[0]
    expect(june.payoutDate).toBe("2026-06-30")
    expect(find(june, "payday").dueOn).toBe("2026-06-30")
    // Alpha's 26 June invoice is due 3 July, so it's July's.
    expect(
      months[1].clients.flatMap((c) => c.invoices).map((i) => i.row.invoiceDate)
    ).toContain("2026-06-26")
  })

  it("keeps an overdue invoice in the month it's now expected, with its real due date", () => {
    const june = buckets().months[0]
    const overdue = find(june, "inv1")
    expect(overdue.kind).toBe("overdue")
    expect(overdue.dueOn).toBe("2026-05-31")
    expect(overdue.row.landsOn).toBe("2026-06-01")
  })

  it("works out each director's share with and without contractor cost", () => {
    const june = buckets().months[0]
    // £15,000 less a £1,200 set-aside, between two directors. Cost is paid either way.
    expect(find(june, "inv1").each).toBe("6900.00")
    expect(invoiceShare(find(june, "inv1").row, 2)).toBe("6900.00")
    // Beta: £2,000, no contractor cost: 20% set-aside, between two.
    const beta = june.clients
      .flatMap((c) => c.invoices)
      .find((i) => i.row.projectId === "pb")!
    expect(beta.row.contractorCost).toBe("0.00")
    expect(beta.each).toBe("800.00")
    expect(beta.detail).toContain("no cost")
  })

  it("reads the rate and director count, rather than assuming them", () => {
    const three = buckets({
      people: [
        ...baseInput().people,
        { ...DIRECTOR_A, id: "d3", name: "Third", solidtimeUserId: null },
      ],
      settings: {
        ...baseInput().settings,
        months: 2,
        ctSetAsideRate: 0.1,
      },
    }).months[0]
    // £15,000 less 10% × £6,000, between three.
    expect(find(three, "inv1").each).toBe("4800.00")
  })

  it("matches the engine's invoices landing, including money already received", () => {
    const paid: CashLine = {
      ...raw({
        sourceId: "pay",
        source: "payment",
        direction: "in",
        date: "2026-06-03",
        amount: "700.00",
        salesInvoiceId: "paid",
      }),
      kind: "client_payment",
      personId: null,
    }
    const input = baseInput({
      today: "2026-06-05",
      settings: { ...baseInput().settings, months: 2 },
      cash: [...baseInput().cash, paid],
      invoices: [
        ...baseInput().invoices,
        {
          invoiceId: "paid",
          invoiceNumber: "AAA-I0",
          invoiceDate: "2026-05-15",
          dueDate: "2026-05-22",
          subTotal: "700.00",
          totalTax: "0.00",
          total: "700.00",
          outstanding: "0.00",
        },
      ],
      balance: { opening: "1000.00", closing: "1700.00" },
    })
    const r = run(input)
    const { months } = payoutBuckets(r, formatMoney)
    months.forEach((b, i) => {
      expect(b.totalIn).toBe(r.months[i].invoicesLanding)
    })
    expect(months[0].received).toBe("700.00")
    expect(Number(months[0].raised) + Number(months[0].predicted)).toBe(
      Number(months[0].totalIn)
    )
  })

  it("leaving an invoice out changes the totals, not its contractor cost", () => {
    const before = buckets().months[0]
    const after = buckets({
      expectations: [{ invoiceKey: "inv1", excluded: true, expectedOn: null }],
    }).months[0]
    expect(Number(after.totalIn)).toBe(Number(before.totalIn) - 15000)
    expect(Number(after.each)).toBe(Number(before.each) - 6900)
    expect(after.leftOut).toEqual({
      count: 1,
      worth: "15000.00",
      each: "6900.00",
    })
    const clientTotal = (b: typeof before) =>
      b.clients.find((c) => c.client === "ALPHA HOLDINGS LTD")!
    expect(Number(clientTotal(after).total)).toBe(
      Number(clientTotal(before).total) - 15000
    )
    const row = find(after, "inv1").row
    expect(row.included).toBe(false)
    expect(row.contractorCost).toBe(find(before, "inv1").row.contractorCost)
    // Still in its month, for putting back.
    expect(find(after, "inv1").each).toBe("6900.00")
  })

  it("groups by the Xero client, with the most invoices first", () => {
    const june = buckets().months[0]
    expect(june.clients.map((c) => c.client)).toEqual([
      "ALPHA HOLDINGS LTD",
      "Beta Partners",
    ])
    expect(june.clients[0].invoices.length).toBeGreaterThan(
      june.clients[1].invoices.length
    )
  })

  it("splits each month by client, adding up to its total", () => {
    const { months } = buckets()
    const june = months[0]
    expect(june.segments.map((x) => x.label)).toEqual([
      "ALPHA HOLDINGS LTD",
      "Beta Partners",
    ])
    expect(june.segments[0].amount).toBe("19500.00")
    expect(june.segments[1].amount).toBe("2000.00")
    expect(june.segments[0].percentLabel).toBe(91)
    expect(june.segments.reduce((t, x) => t + x.percent, 0)).toBeCloseTo(100, 1)
    // The same client keeps its colour from month to month.
    const slot = (m: (typeof months)[number], label: string) =>
      m.segments.find((x) => x.label === label)?.colorSlot
    expect(slot(months[1], "ALPHA HOLDINGS LTD")).toBe(
      slot(june, "ALPHA HOLDINGS LTD")
    )
  })

  it("leaves a left-out invoice out of the split", () => {
    const june = buckets({
      expectations: [{ invoiceKey: "inv1", excluded: true, expectedOn: null }],
    }).months[0]
    expect(june.segments.find((x) => x.label.startsWith("ALPHA"))!.amount).toBe(
      "4500.00"
    )
  })

  it("keeps every client and the same order, whatever's ticked", () => {
    const shape = (b: ReturnType<typeof buckets>["months"][number]) => ({
      clients: b.clients.map((c) => [
        c.client,
        c.invoices.map((i) => i.row.key),
      ]),
      legend: b.segments.map((x) => [x.key, x.colorSlot]),
    })
    const before = buckets().months[0]
    const alphaKeys = before.clients[0].invoices.map((i) => i.row.key)
    const after = buckets({
      expectations: alphaKeys.map((invoiceKey) => ({
        invoiceKey,
        excluded: true,
        expectedOn: null,
      })),
    }).months[0]
    expect(shape(after)).toEqual(shape(before))
    expect(after.segments.map((x) => x.label)).toEqual(
      after.clients.map((c) => c.client)
    )
    // Alpha is all left out: still listed, at nothing.
    expect(after.segments[0]).toMatchObject({
      label: "ALPHA HOLDINGS LTD",
      amount: "0.00",
      percent: 0,
      percentLabel: 0,
    })
  })

  it("shows an empty bar and 0% with everything left out, not an error", () => {
    const keys = buckets()
      .months[0].clients.flatMap((c) => c.invoices)
      .map((i) => i.row.key)
    const june = buckets({
      expectations: keys.map((invoiceKey) => ({
        invoiceKey,
        excluded: true,
        expectedOn: null,
      })),
    }).months[0]
    expect(june.totalIn).toBe("0.00")
    expect(june.segments.length).toBeGreaterThan(0)
    expect(june.segments.every((x) => x.percent === 0)).toBe(true)
    expect(june.segments.every((x) => x.percentLabel === 0)).toBe(true)
  })

  it("shows money already received as its own part of the split", () => {
    const paid: CashLine = {
      ...raw({
        sourceId: "pay",
        source: "payment",
        direction: "in",
        date: "2026-06-01",
        amount: "500.00",
        salesInvoiceId: "paid",
      }),
      kind: "client_payment",
      personId: null,
    }
    const june = buckets({
      cash: [...baseInput().cash, paid],
      invoices: [
        ...baseInput().invoices,
        {
          invoiceId: "paid",
          invoiceNumber: "AAA-I0",
          invoiceDate: "2026-05-01",
          dueDate: "2026-05-22",
          subTotal: "500.00",
          totalTax: "0.00",
          total: "500.00",
          outstanding: "0.00",
        },
      ],
    }).months[0]
    expect(june.segments.at(-1)).toMatchObject({
      label: "Already received",
      amount: "500.00",
      colorSlot: null,
    })
  })

  it("folds clients beyond the colours into Other", () => {
    const projects = ["A", "B", "C", "D", "E", "F"].map((x, i) => ({
      ...PROJECT_A,
      id: `p${x}`,
      code: x,
      name: `Project ${x}`,
      xeroContactId: `c${x}`,
      solidtimeProjectIds: [],
      invoiceAnchorDate: null,
      chargeRateGbp: `${100 * (i + 1)}.00`,
    }))
    const june = buckets({
      projects,
      overrides: [],
      entries: [],
      contacts: projects.map((p) => ({ id: p.xeroContactId, name: p.name })),
      invoices: projects.map((p, i) => ({
        invoiceId: `i${i}`,
        contactId: p.xeroContactId,
        invoiceNumber: `${p.code}-I1`,
        invoiceDate: "2026-05-20",
        dueDate: "2026-06-10",
        subTotal: `${(i + 1) * 100}.00`,
        totalTax: "0.00",
        total: `${(i + 1) * 100}.00`,
        outstanding: `${(i + 1) * 100}.00`,
      })),
    }).months[0]
    expect(june.segments).toHaveLength(6)
    expect(june.segments.at(-1)).toMatchObject({
      label: "Other clients",
      amount: "100.00",
      colorSlot: null,
    })
  })

  it("shows an empty month as empty", () => {
    const { months } = buckets({
      invoices: [],
      projects: [],
      overrides: [],
    })
    expect(months[0]).toMatchObject({
      totalIn: "0.00",
      segments: [],
      clients: [],
      leftOut: null,
    })
    const june = buckets().months[0]
    expect(Number(june.raised)).toBe(15000)
    expect(Number(june.predicted)).toBe(6500)
  })

  it("drops a client prefix only when it repeats the client", () => {
    expect(projectTitle("Alpha Portal", "ALPHA HOLDINGS LTD")).toBe("Portal")
    expect(projectTitle("Beta", "BETA PARTNERS")).toBe("Beta")
    expect(projectTitle("Gamma Site", "Beta Partners")).toBe("Gamma Site")
  })

  it("hides the zero parts of where a figure came from", () => {
    const base = find(buckets().months[0], "inv1").row
    const predicted = {
      ...base,
      status: "forecast" as const,
      contractorCost: "2700.00",
    }
    const detail = (over: Partial<typeof predicted>) =>
      invoiceDetail({ ...predicted, ...over }, formatMoney)
    expect(detail({ trackedDays: "0.0000", forecastDays: "4.7300" })).toBe(
      "4.73 days forecast, none tracked yet · cost £2,700"
    )
    expect(detail({ trackedDays: "3.7300", forecastDays: "2.3600" })).toBe(
      "From 3.73 tracked + 2.36 forecast days · cost £2,700"
    )
    expect(invoiceDetail(base, formatMoney)).toBe("Contractor cost £9,000")
    expect(
      invoiceDetail({ ...base, contractorCost: "0.00" }, formatMoney)
    ).toBe("No contractor cost")
  })
})

describe("in and out", () => {
  const line = (
    kind: CashLine["kind"],
    date: string,
    amount: string,
    direction: "in" | "out" = "out"
  ): CashLine => ({
    ...raw({ sourceId: `${kind}-${date}`, date, amount, direction }),
    kind,
    personId: null,
  })
  const months = (r: ReturnType<typeof run>) => inOutMonths(r, formatMoney)

  it("leaves dividends and transfers out of a past month", () => {
    const [may] = months(
      run(
        baseInput({
          cash: [
            line("client_payment", "2026-05-10", "5000.00", "in"),
            line("other_in", "2026-05-11", "10.00", "in"),
            line("backstop_in", "2026-05-12", "999.00", "in"),
            line("contractor_payment", "2026-05-13", "1000.00"),
            line("running_cost", "2026-05-14", "200.00"),
            line("director_salary", "2026-05-15", "2000.00"),
            line("dividend", "2026-05-16", "1500.00"),
            line("set_aside", "2026-05-17", "400.00"),
            line("other_transfer_out", "2026-05-18", "77.00"),
          ],
        })
      )
    )
    expect(may).toMatchObject({
      month: "2026-05-01",
      basis: "actual",
      moneyInTotal: "5010.00",
      // The 400 set aside and the 999 back cancel out, leaving 599 taken out.
      moneyOutTotal: "3200.00",
      left: "1810.00",
      fromReserve: "599.00",
    })
    expect(may.moneyOut.map((r) => r.label)).toEqual([
      "Contractors",
      "Running costs",
      "Director salaries",
    ])
  })

  it("treats money moved out and straight back as a correction", () => {
    const [may] = months(
      run(
        baseInput({
          cash: [
            line("client_payment", "2026-05-10", "5000.00", "in"),
            line("set_aside", "2026-05-11", "1000.00"),
            line("backstop_in", "2026-05-12", "450.00", "in"),
          ],
        })
      )
    )
    expect(may.fromReserve).toBe("0.00")
    expect(may.moneyOut.find((r) => r.key === "set_asides")!.amount).toBe(
      "550.00"
    )
  })

  it("names past money in by Xero client", () => {
    const paid = {
      ...line("client_payment", "2026-05-10", "500.00", "in"),
      salesInvoiceId: "inv1",
    }
    const [may] = months(
      run(
        baseInput({
          cash: [paid],
          invoices: baseInput().invoices.map((i) => ({
            ...i,
            contactId: "client-a",
          })),
        })
      )
    )
    expect(may.moneyIn.map((r) => [r.label, r.amount])).toEqual([
      ["ALPHA HOLDINGS LTD", "500.00"],
    ])
  })

  it("uses the salary setting in future months, for every director", () => {
    const rows = months(
      run(baseInput({ settings: { ...baseInput().settings, months: 2 } }))
    )
    const july = rows.find((m) => m.month === "2026-07-01")!
    expect(july.basis).toBe("forecast")
    expect(july.moneyOut.find((r) => r.key === "salaries")!.amount).toBe(
      "2000.00"
    )
    expect(rows.find((m) => m.month === "2026-06-01")!.basis).toBe("current")
  })

  it("doesn't count the month-end payout as money out", () => {
    const june = months(run(baseInput())).find((m) => m.month === "2026-06-01")!
    // 21,500 in; 9,000 bills, 1,960 set-asides, 290 running, 2,000 salaries, 500 one-off.
    expect(june).toMatchObject({
      moneyInTotal: "21500.00",
      moneyOutTotal: "13750.00",
      left: "7750.00",
    })
  })

  it("shows money back from the tax reserve, without calling it income", () => {
    const june = months(
      run(
        baseInput({
          cash: [
            ...baseInput().cash,
            line("backstop_in", "2026-06-01", "4000.00", "in"),
          ],
          balance: { opening: "1000.00", closing: "5000.00" },
        })
      )
    ).find((m) => m.month === "2026-06-01")!
    expect(june.fromReserve).toBe("4000.00")
    expect(june.moneyInTotal).toBe("21500.00")
  })

  it("counts salary already paid this month, not the setting on top", () => {
    const june = months(
      run(
        baseInput({
          cash: [
            ...baseInput().cash,
            line("director_salary", "2026-06-01", "2500.00"),
          ],
          balance: { opening: "1000.00", closing: "-1500.00" },
        })
      )
    ).find((m) => m.month === "2026-06-01")!
    expect(june.moneyOut.find((r) => r.key === "salaries")!.amount).toBe(
      "2500.00"
    )
  })
})

describe("the overview", () => {
  const view = (extra: Partial<ForecastInput> = {}) => {
    const r = run(baseInput(extra))
    return { r, buckets: overviewBuckets(r, formatMoney) }
  }

  it("adds up to the payout: left from the month, plus from the bank", () => {
    const { r, buckets } = view()
    const b = buckets[0]
    const m = r.months[0]
    expect(b.moneyInTotal).toBe(m.invoicesLanding)
    expect(b.takeHome).toBe(m.takeHomePerDirector)
    expect(b.closing).toBe(m.closing)
    expect(b.payout).toBe("10650.00")
    expect(b.fromBank).toBe("900.00")
    expect(Number(b.left) + Number(b.fromBank)).toBe(Number(b.payout))
  })

  it("only lists rows that have an amount", () => {
    const b = view().buckets[0]
    expect(b.moneyOut.map((r) => r.label)).toEqual([
      "Contractors",
      "Tax set-asides",
      "Running costs",
      "Adjustments",
    ])
    expect(
      view({ adjustments: [] }).buckets[0].moneyOut.map((r) => r.key)
    ).toEqual(["contractors", "set_asides", "running"])
  })

  it("shows money back from the tax reserve as money in, and still adds up", () => {
    const back: CashLine = {
      ...raw({
        sourceId: "b",
        date: "2026-06-01",
        amount: "600.00",
        direction: "in",
      }),
      kind: "backstop_in",
      personId: null,
    }
    const b = view({
      cash: [...baseInput().cash, back],
      balance: { opening: "1000.00", closing: "1600.00" },
    }).buckets[0]
    expect(b.moneyIn.find((r) => r.key === "backstop")!.amount).toBe("600.00")
    expect(Number(b.left) + Number(b.fromBank)).toBe(Number(b.payout))
  })

  it("copes with a month where nothing moves", () => {
    const b = view({
      projects: [],
      invoices: [],
      overrides: [],
      adjustments: [],
      cash: [],
      people: [DIRECTOR_A, DIRECTOR_B],
      balance: { opening: "0.00", closing: "0.00" },
    }).buckets[0]
    expect(b.moneyOutTotal).toBe("0.00")
    expect(b.moneyIn).toEqual([])
    expect(b.left).toBe("0.00")
  })
})

describe("the bills view", () => {
  const stored = (over: Partial<ForecastInput["bills"][number]> = {}) => ({
    id: "b1",
    personId: "c1",
    issuedOn: "2026-05-29",
    periodStart: "2026-04-25",
    periodEnd: "2026-05-29",
    amountGbp: "9000.00",
    dueOn: "2026-06-28",
    payOrder: null,
    plannedPayOn: null,
    paidOn: null,
    paidAmountGbp: null,
    paidByBankTransactionId: null,
    paidSource: null,
    ...over,
  })
  const months2 = { settings: { ...baseInput().settings, months: 2 } }

  it("buckets a bill by the month it's paid, and matches the engine's total", () => {
    const r = run(baseInput(months2))
    const { months } = billBuckets(r)
    expect(months[0].total).toBe("9000.00")
    expect(months[0].cards.map((c) => c.bill.issuedOn)).toEqual(["2026-05-29"])
    r.months.forEach((m, i) => {
      expect(Number(months[i].total)).toBe(-Number(m.contractorBills))
    })
  })

  it("counts a bill planned for payout day in that month", () => {
    const { months } = billBuckets(
      run(baseInput({ bills: [stored({ plannedPayOn: "2026-06-30" })] }))
    )
    expect(months[0].cards[0].payOn).toBe("2026-06-30")
  })

  it("flags a bill paid after its due date as late", () => {
    const late = billBuckets(
      run(
        baseInput({
          bills: [stored({ plannedPayOn: "2026-06-30", dueOn: "2026-06-10" })],
        })
      )
    ).months[0].cards[0]
    expect(late.late).toBe(true)
    const onTime = billBuckets(run(baseInput())).months[0].cards[0]
    expect(onTime.late).toBe(false)
  })

  it("splits entered from forecast, and reports money already paid", () => {
    const paidLine: CashLine = {
      ...raw({ sourceId: "t9", date: "2026-06-01", amount: "400.00" }),
      kind: "contractor_payment",
      personId: "c1",
    }
    const { months } = billBuckets(
      run(
        baseInput({
          bills: [stored()],
          cash: [...baseInput().cash, paidLine],
          balance: { opening: "1000.00", closing: "600.00" },
        })
      )
    )
    expect(months[0]).toMatchObject({
      entered: "9000.00",
      forecast: "0.00",
      alreadyPaid: "400.00",
      total: "9400.00",
    })
    expect(months[0].parts.at(-1)).toMatchObject({ label: "Already paid" })
  })

  it("warns about the worst pay day, using the engine's balance", () => {
    const { months } = billBuckets(
      run(
        baseInput({
          projects: [],
          invoices: [],
          overrides: [],
          adjustments: [],
          cash: [],
          entries: [],
          balance: { opening: "100.00", closing: "100.00" },
          bills: [stored({ dueOn: "2026-06-10" })],
        })
      )
    )
    expect(months[0].danger).toEqual({
      balance: "-8900.00",
      personName: "Casey Contractor",
      date: "2026-06-10",
    })
    expect(billBuckets(run(baseInput())).months[0].danger).toBeNull()
  })

  it("lists paid bills newest first, and gives contractors fixed colours in name order", () => {
    const r = run(
      baseInput({
        people: [
          { ...CONTRACTOR, id: "c2", name: "Zed", solidtimeUserId: null },
          CONTRACTOR,
          DIRECTOR_A,
          DIRECTOR_B,
        ],
        payRates: [
          { personId: "c1", projectId: null, dayRateGbp: "300.00" },
          { personId: "c2", projectId: null, dayRateGbp: "300.00" },
        ],
        bills: [
          stored({
            id: "old",
            issuedOn: "2026-04-24",
            paidOn: "2026-05-01",
            paidAmountGbp: "1.00",
            paidSource: "manual",
          }),
          stored({
            paidOn: "2026-05-30",
            paidAmountGbp: "1.00",
            paidSource: "manual",
          }),
        ],
      })
    )
    expect(billBuckets(r).paid.map((c) => c.payOn)).toEqual([
      "2026-05-30",
      "2026-05-01",
    ])
    expect(r.contractors).toEqual(["Casey Contractor", "Zed"])
    expect(contractorColour(r, "Casey Contractor")).toBe("var(--chart-1)")
    expect(contractorColour(r, "Zed")).toBe("var(--chart-2)")
  })
})

describe("merging a timeline day", () => {
  const row = (over: Partial<TimelineRow>): TimelineRow => ({
    date: "2026-06-01",
    label: "x",
    category: "money_in",
    source: "forecast",
    actual: false,
    moneyIn: null,
    moneyOut: null,
    balance: "0.00",
    ...over,
  })

  it("merges the same category, direction and basis into one chip", () => {
    const chips = mergeDay([
      row({ label: "Forecast invoice: A", moneyIn: "100.00" }),
      row({ label: "Forecast invoice: B", moneyIn: "50.50" }),
      row({ label: "Set-aside: A", category: "set_asides", moneyOut: "20.00" }),
      row({ label: "Set-aside: B", category: "set_asides", moneyOut: "10.00" }),
    ])
    expect(chips.map((c) => [c.label, c.amount, c.direction])).toEqual([
      ["2 predicted invoices", "150.50", "in"],
      ["2 set-asides", "30.00", "out"],
    ])
    expect(chips[0].events).toEqual([
      { label: "Forecast invoice: A", amount: "100.00" },
      { label: "Forecast invoice: B", amount: "50.50" },
    ])
  })

  it("keeps actual and forecast apart, and a lone event keeps its own label", () => {
    const chips = mergeDay([
      row({
        label: "Invoice due: AAA-I1",
        source: "actual",
        moneyIn: "100.00",
      }),
      row({ label: "Forecast invoice: B", moneyIn: "50.00" }),
      row({
        label: "Contractor bill: Casey",
        category: "contractors",
        source: "tracked",
        moneyOut: "5.00",
      }),
    ])
    expect(chips.map((c) => [c.label, c.predicted])).toEqual([
      ["Invoice AAA-I1", false],
      ["Invoice B", true],
      ["Bill: Casey", true],
    ])
  })

  it("places the balance bar around a zero tick", () => {
    const v = timelineView(run(baseInput()))
    const day = v.months[0].days[0]
    expect(day.bar.negative).toBe(false)
    expect(day.bar.left).toBe(v.zeroAt)
    expect(day.bar.width).toBeGreaterThan(0)
  })

  it("shows nothing going wrong with an empty month", () => {
    const v = timelineView(
      run(
        baseInput({
          projects: [],
          invoices: [],
          overrides: [],
          adjustments: [],
          cash: [],
          people: [],
          payRates: [],
          balance: { opening: "0.00", closing: "0.00" },
        })
      )
    )
    expect(v.zeroAt).toBe(0)
    expect(v.months[0].days).toEqual([])
  })
})

describe("the timeline view", () => {
  it("splits money in and out, and finds the month's lowest balance", () => {
    const [june] = timelineMonths(run(baseInput()))
    expect(june.closing).toBe("100.00")
    const first = june.rows[0]
    expect(first.category).toBe("money_in")
    expect(first.moneyIn).toBe("15000.00")
    expect(first.moneyOut).toBeNull()
    expect(june.rows.find((r) => r.category === "contractors")!.moneyOut).toBe(
      "9000.00"
    )
    // 1,000 + 21,500 in; everything else out, down to the buffer.
    expect(june.totalIn).toBe("21500.00")
    expect(june.totalOut).toBe("22400.00")
    expect(june.lowest).toBe("100.00")
    expect(june.lowestOn).toBe("2026-06-30")
  })
})

describe("the accuracy view", () => {
  const row = (
    n: string,
    actual: string,
    f14: string | null,
    f7: string | null
  ) => ({
    invoiceId: n,
    invoiceNumber: n,
    projectName: "P",
    invoiceDate: "2026-06-01",
    actual,
    forecast14: f14,
    forecast7: f7,
    difference14: null,
    difference7: null,
  })

  it("averages the miss over invoices that have a forecast, and drops the rest", () => {
    const s = accuracySummary([
      row("a", "1000.00", "900.00", "1100.00"),
      row("b", "1000.00", null, "1300.00"),
      row("c", "1000.00", null, null),
    ])
    expect(s.compared).toBe(2)
    expect(s.rows.map((r) => r.invoiceNumber)).toEqual(["a", "b"])
    expect(s.averageMiss14).toBe(0.1)
    expect(s.averageMiss7).toBe(0.2)
    expect(s.lean7).toBe("over")
  })

  it("says nothing with nothing to compare", () => {
    expect(accuracySummary([row("c", "1.00", null, null)])).toMatchObject({
      compared: 0,
      averageMiss14: null,
      averageMiss7: null,
      lean7: null,
    })
  })
})

describe("charts", () => {
  const charts = () => {
    const r = run(baseInput())
    return { r, c: forecastCharts(r) }
  }
  const total = (row: Record<string, number | string>) =>
    Object.entries(row)
      .filter(([k]) => k !== "month")
      .reduce((t, [, v]) => t + Number(v), 0)

  it("draws one balance per day, joining actual and forecast on today", () => {
    const { c } = charts()
    expect(c.balance).toHaveLength(30)
    expect(c.balance[0]).toMatchObject({ date: "2026-06-01" })
    expect(c.balance[0].actual).toBe(c.balance[0].forecast)
    expect(c.balance[1].actual).toBeNull()
    expect(c.balance.at(-1)!.forecast).toBe(100)
  })

  it("adds up to the breakdown's figures", () => {
    const { c } = charts()
    expect(total(c.moneyOut.months[0])).toBe(10650 + 9000 + 1960 + 290 + 500)
    expect(c.moneyOut.months[0].directors).toBe(10650)
    // The adjustment has no group of its own.
    expect(c.moneyOut.months[0].other).toBe(500)
  })
})

describe("accuracy", () => {
  it("compares each raised invoice with the forecast 14 and 7 days before", () => {
    const invoices = run(baseInput()).invoices
    const rows = accuracyRows(invoices, [
      {
        projectId: "pa",
        invoiceDate: "2026-05-29",
        snapshotDate: "2026-05-15",
        amountGbp: "14000.00",
      },
      {
        projectId: "pa",
        invoiceDate: "2026-05-29",
        snapshotDate: "2026-05-22",
        amountGbp: "15500.00",
      },
    ])
    expect(rows[0]).toMatchObject({
      invoiceNumber: "AAA-I1",
      actual: "15000.00",
      forecast14: "14000.00",
      forecast7: "15500.00",
      difference14: "1000.00",
      difference7: "-500.00",
    })
  })
})

describe("running cost tally", () => {
  const paid = (
    date: string,
    amount: string,
    id: string,
    contactId: string | null
  ) => ({
    ...cost(date, amount),
    sourceId: id,
    contactId,
  })
  const cash = [
    paid("2026-03-10", "30.00", "s-mar", "ct-sub"),
    paid("2026-04-10", "30.00", "s-apr", "ct-sub"),
    paid("2026-05-10", "30.00", "s-may", "ct-sub"),
    paid("2026-04-20", "900.00", "laptop", "ct-shop"),
    paid("2026-02-10", "50.00", "old", "ct-old"),
  ]
  const contacts = [
    { id: "ct-sub", name: "Subscription" },
    { id: "ct-shop", name: "Shop" },
    { id: "ct-old", name: "Old" },
  ]
  const tally = (oneOffCosts: string[] = []) =>
    run(baseInput({ cash, contacts, oneOffCosts }))

  it("leaves a one-off out of the average but not out of what was spent", () => {
    expect(tally().runningCostAverage).toBe("330.00")
    const r = tally(["laptop"])
    expect(r.runningCostAverage).toBe("30.00")
    expect(r.runningCosts.average).toBe("30.00")
    expect(r.runningCosts.averageWithOneOffs).toBe("330.00")
    const april = r.runningCosts.months.find((m) => m.month === "2026-04-01")!
    expect(april.total).toBe("930.00")
    expect(april.oneOffs).toBe("900.00")
    expect(april.inAverage).toBe(true)
  })

  it("groups a payee charged in several months and lists each date", () => {
    const { recurring, single } = tally().runningCosts
    expect(recurring.map((g) => g.label)).toEqual(["Subscription"])
    expect(recurring[0].charges.map((c) => c.date)).toEqual([
      "2026-05-10",
      "2026-04-10",
      "2026-03-10",
    ])
    expect(recurring[0].perMonth).toBe("30.00")
    expect(single.map((g) => g.label)).toEqual(["Shop", "Old"])
  })

  it("keeps groups in the same order when one is marked", () => {
    const order = (ids: string[]) =>
      tally(ids).runningCosts.single.map((g) => g.label)
    expect(order(["laptop"])).toEqual(order([]))
  })

  it("only lets a director mark charges the average uses now or later", () => {
    const { single } = tally().runningCosts
    const old = single.find((g) => g.label === "Old")!.charges[0]
    expect(old.status).toBe("older")
    expect(old.canMark).toBe(false)
    const laptop = single.find((g) => g.label === "Shop")!.charges[0]
    expect(laptop.status).toBe("in_average")
    expect(laptop.canMark).toBe(true)
    expect(
      tally(["laptop"]).runningCosts.single.find((g) => g.label === "Shop")!
        .charges[0].status
    ).toBe("one_off")
  })

  it("adds the forecast to the bank spend for the months ahead", () => {
    const { spent, forecast, total, months } = tally().runningCosts
    expect(spent).toBe("1040.00")
    expect(months.at(-1)!.spent).toBe("0.00")
    expect(Number(forecast)).toBeGreaterThan(0)
    expect(Number(total)).toBeCloseTo(Number(spent) + Number(forecast), 2)
  })

  it("nets a refund and adds up the lines of one bank movement", () => {
    const split = [
      paid("2026-05-02", "10.00", "split", "ct-shop"),
      paid("2026-05-02", "5.00", "split", "ct-shop"),
      {
        ...paid("2026-05-09", "4.00", "back", "ct-shop"),
        direction: "in" as const,
      },
    ]
    const r = run(baseInput({ cash: split, contacts }))
    const charges = r.runningCosts.single[0].charges
    expect(charges.map((c) => c.amount)).toEqual(["-4.00", "15.00"])
  })
})
