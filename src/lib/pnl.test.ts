import { describe, expect, it } from "vitest"

import {
  defaultGroup,
  fyStartFromYearEnd,
  lastMonths,
  withRolling3,
} from "./pnl"

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

describe("withRolling3", () => {
  const months = [
    { month: "2026-06-01", sales: 100, profit: 10 },
    { month: "2026-07-01", sales: 200, profit: -20 },
    { month: "2026-08-01", sales: 300.01, profit: 30 },
    { month: "2026-09-01", sales: 400, profit: 40.1 },
    { month: "2026-10-01", sales: 5, profit: 5 },
  ]
  const out = withRolling3(months, "2026-10-01")

  it("is null until three complete months are available", () => {
    expect(out[0].salesAvg3).toBeNull()
    expect(out[1].profitAvg3).toBeNull()
  })

  it("averages the month and the two before it, to the penny", () => {
    expect(out[2]).toMatchObject({ salesAvg3: 200, profitAvg3: 6.67 })
    expect(out[3]).toMatchObject({ salesAvg3: 300, profitAvg3: 16.7 })
  })

  it("leaves the current month out", () => {
    expect(out[4]).toMatchObject({ salesAvg3: null, profitAvg3: null })
  })
})
