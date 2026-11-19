import { describe, expect, it } from "vitest"

import { ctForYear, ctOnProfit } from "./corporation-tax"

const year = { periodDays: 365, associatedCompanies: 0 }

describe("ctOnProfit", () => {
  it("charges 19% up to £50,000", () => {
    expect(ctOnProfit("50000", year)).toMatchObject({
      ct: "9500.00",
      band: "small",
    })
  })

  it("charges 25% less marginal relief between the limits", () => {
    // 25% of £100,000 less 3/200 of (£250,000 − £100,000).
    expect(ctOnProfit("100000", year)).toMatchObject({
      ct: "22750.00",
      rate: "0.2275",
      band: "marginal",
      mainRateTax: "25000.00",
      relief: "2250.00",
    })
    // The bands meet: no jump at either limit.
    expect(ctOnProfit("50000.01", year).ct).toBe("9500.00")
    expect(ctOnProfit("250000", year).ct).toBe("62500.00")
  })

  it("charges 25% from £250,000, and nothing on a loss", () => {
    expect(ctOnProfit("300000", year).band).toBe("main")
    expect(ctOnProfit("-500", year)).toMatchObject({ ct: "0.00", band: "none" })
  })

  it("shares the limits with associated companies and cuts them for a short period", () => {
    expect(
      ctOnProfit("1", { periodDays: 365, associatedCompanies: 1 }).lowerLimit
    ).toBe("25000.00")
    expect(
      ctOnProfit("1", { periodDays: 73, associatedCompanies: 0 }).upperLimit
    ).toBe("50000.00")
  })
})

describe("ctForYear", () => {
  const base = {
    start: "2025-09-01",
    end: "2026-08-31",
    sales: "110000.00",
    peopleCosts: "20000.00",
    otherCosts: "5000.00",
    equipment: "1000.00",
    associatedCompanies: 0,
  }

  it("taxes a finished year on its profit less equipment", () => {
    const y = ctForYear({ ...base, today: "2026-11-19" })
    expect(y).toMatchObject({
      profit: "85000.00",
      taxableProfit: "84000.00",
      inProgress: false,
      projectedProfit: null,
      band: "marginal",
    })
    // 25% of £84,000 less 3/200 of £166,000.
    expect(y.ct).toBe("18510.00")
  })

  it("taxes a year in progress at the rate a full year at that pace pays", () => {
    // 73 days in (1 Sep to 12 Nov), so a fifth of the year.
    const y = ctForYear({
      ...base,
      start: "2026-09-01",
      end: "2027-08-31",
      today: "2026-11-12",
      sales: "21000.00",
      peopleCosts: "0.00",
      otherCosts: "0.00",
      equipment: "0.00",
    })
    expect(y.inProgress).toBe(true)
    expect(y.projectedProfit).toBe("105000.00")
    expect([y.elapsedDays, y.periodDays]).toEqual([73, 365])
    expect(y.working).toMatchObject({
      profit: "105000.00",
      mainRateTax: "26250.00",
      relief: "2175.00",
      ct: "24075.00",
    })
    // A full year at £105,000 pays £26,250 less 3/200 of £145,000: 22.93%.
    expect(y.rate).toBe("0.2293")
    expect(y.ct).toBe("4815.00")
  })
})
