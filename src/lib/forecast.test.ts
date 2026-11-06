import { describe, expect, it } from "vitest"

import {
  accuracyRows,
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
  paymentCashLine,
  runForecast,
  type CashLine,
  type ForecastInput,
  type ForecastResult,
  type RawCashLine,
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

  it("counts money back from the reserve as cash in, leaving what's owed alone", () => {
    const back: CashLine = {
      ...raw({
        sourceId: "back",
        direction: "in",
        date: "2026-06-01",
        amount: "500.00",
        transactionType: "RECEIVE-TRANSFER",
      }),
      kind: "backstop_in",
      personId: null,
    }
    const r = run(
      baseInput({
        projects: [{ ...PROJECT_A, invoiceAnchorDate: null }],
        invoices: [{ ...invoice, outstanding: "0.00" }],
        overrides: [],
        entries: [],
        adjustments: [],
        cash: [clientPayment("2026-05-30", "1000.00"), back],
        balance: { opening: "1000.00", closing: "1500.00" },
      })
    )
    expect(r.months[0].backstopIn).toBe("500.00")
    expect(r.timeline.find((e) => e.type === "set_aside")!.amount).toBe(
      "-200.00"
    )
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
    const { c, r } = charts()
    const june = r.months[0]
    expect(total(c.moneyIn.months[0])).toBe(Number(june.invoicesLanding))
    expect(total(c.moneyOut.months[0])).toBe(10650 + 9000 + 1960 + 290 + 500)
    expect(c.moneyOut.months[0].directors).toBe(10650)
    // The adjustment has no group of its own.
    expect(c.moneyOut.months[0].other).toBe(500)
  })

  it("names projects in a fixed order, and folds the rest into Other", () => {
    const extra = ["pc", "pd", "pe"].map((id, i) => ({
      ...PROJECT_A,
      id,
      code: `C${i}`,
      name: `Project ${"XYZ"[i]}`,
      solidtimeProjectIds: [],
    }))
    const inv = (id: string, number: string, amount: string) => ({
      invoiceId: id,
      invoiceNumber: number,
      invoiceDate: "2026-05-20",
      dueDate: "2026-06-10",
      subTotal: amount,
      totalTax: "0.00",
      total: amount,
      outstanding: amount,
    })
    const c = forecastCharts(
      run(
        baseInput({
          projects: [PROJECT_A, PROJECT_B, ...extra],
          overrides: [],
          entries: [],
          invoices: [
            inv("1", "AAA-I1", "500.00"),
            inv("2", "BBB-I1", "400.00"),
            inv("3", "C0-I1", "300.00"),
            inv("4", "C1-I1", "200.00"),
            inv("5", "C2-I1", "100.00"),
          ],
        })
      )
    )
    expect(c.moneyIn.series.map((s) => s.label)).toEqual([
      "Project Alpha",
      "Project Beta",
      "Project X",
      "Project Y",
      "Other",
    ])
    expect(c.moneyIn.months[0].other).toBe(100)
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
