import { describe, expect, it } from "vitest"

import { defaultGroup, fyStartFromYearEnd, lastMonths } from "./pnl"

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
