import { describe, expect, it } from "vitest"

import {
  defaultGroup,
  fyStartFromYearEnd,
  lastMonths,
  parsePnlReport,
} from "./pnl"

const acct = (id: string, name: string, value: string) => ({
  RowType: "Row",
  Cells: [
    { Value: name, Attributes: [{ Value: id, Id: "account" }] },
    { Value: value, Attributes: [{ Value: id, Id: "account" }] },
  ],
})

// Mirrors the structure of a real single-month Xero ProfitAndLoss response.
const report = {
  Reports: [
    {
      ReportID: "ProfitAndLoss",
      Rows: [
        { RowType: "Header", Cells: [{ Value: "" }, { Value: "30 Sep 26" }] },
        {
          RowType: "Section",
          Title: "Income",
          Rows: [
            acct("a1", "Sales", "12000.00"),
            acct("a2", "Interest Income", "1.23"),
            {
              RowType: "SummaryRow",
              Cells: [{ Value: "Total Income" }, { Value: "12001.23" }],
            },
          ],
        },
        {
          RowType: "Section",
          Title: "",
          Rows: [
            {
              RowType: "Row",
              Cells: [{ Value: "Gross Profit" }, { Value: "12001.23" }],
            },
          ],
        },
        {
          RowType: "Section",
          Title: "Less Operating Expenses",
          Rows: [
            acct("e1", "Salaries", "5000"),
            acct("e2", "Subscriptions", "-15.5"),
            acct("e3", "Weird", ""),
            {
              RowType: "SummaryRow",
              Cells: [
                { Value: "Total Operating Expenses" },
                { Value: "4984.50" },
              ],
            },
          ],
        },
        {
          RowType: "Section",
          Title: "",
          Rows: [
            {
              RowType: "Row",
              Cells: [{ Value: "Net Profit" }, { Value: "7016.73" }],
            },
          ],
        },
      ],
    },
  ],
}

describe("parsePnlReport", () => {
  it("returns one line per account with section and 2dp amount", () => {
    expect(parsePnlReport(report)).toEqual([
      {
        accountId: "a1",
        accountName: "Sales",
        section: "Income",
        amount: "12000.00",
      },
      {
        accountId: "a2",
        accountName: "Interest Income",
        section: "Income",
        amount: "1.23",
      },
      {
        accountId: "e1",
        accountName: "Salaries",
        section: "Less Operating Expenses",
        amount: "5000.00",
      },
      {
        accountId: "e2",
        accountName: "Subscriptions",
        section: "Less Operating Expenses",
        amount: "-15.50",
      },
    ])
  })

  it("rejects a response without reports", () => {
    expect(() => parsePnlReport({ Reports: [] })).toThrow()
  })
})

describe("defaultGroup", () => {
  it.each([
    [{ class: "REVENUE", name: "Sales" }, "sales"],
    [{ class: "REVENUE", name: "Interest Income" }, "sales"],
    [{ class: "EXPENSE", name: "Salaries" }, "people"],
    [{ class: "EXPENSE", name: "Directors' Remuneration" }, "people"],
    [{ class: "EXPENSE", name: "Employer's National Insurance" }, "people"],
    [{ class: "EXPENSE", name: "Pension Costs" }, "people"],
    [{ class: "EXPENSE", name: "Subcontractors" }, "people"],
    [{ class: "EXPENSE", name: "Subscriptions" }, "other"],
    [{ class: "EXPENSE", name: "IT Software and Consumables" }, "other"],
    [{ class: "ASSET", name: "Business Bank Account" }, "exclude"],
    [{ class: null, name: "Unknown" }, "exclude"],
  ] as const)("%o → %s", (account, group) => {
    expect(defaultGroup(account)).toBe(group)
  })
})

describe("lastMonths", () => {
  it("returns oldest-first month ranges ending this month", () => {
    expect(lastMonths(new Date("2026-03-15T12:00:00Z"), 3)).toEqual([
      { start: "2026-01-01", end: "2026-01-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-03-01", end: "2026-03-31" },
    ])
  })
  it("crosses year boundaries", () => {
    expect(lastMonths(new Date("2026-01-05T00:00:00Z"), 2)[0]).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    })
  })
})

describe("fyStartFromYearEnd", () => {
  it("31 August → 1 September", () => {
    expect(fyStartFromYearEnd(31, 8)).toEqual({ month: 9, day: 1 })
  })
  it("31 March → 1 April", () => {
    expect(fyStartFromYearEnd(31, 3)).toEqual({ month: 4, day: 1 })
  })
  it("31 December → 1 January", () => {
    expect(fyStartFromYearEnd(31, 12)).toEqual({ month: 1, day: 1 })
  })
})
