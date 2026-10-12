import { describe, expect, it } from "vitest"

import { monthStarts, parsePeriod, resolvePeriod } from "./period"

const ctx = {
  fyStart: "2026-09-01",
  firstMonth: "2025-10-01",
  today: new Date("2026-10-12T00:00:00Z"),
}

describe("parsePeriod", () => {
  it("accepts known keys and defaults to lifetime", () => {
    expect(parsePeriod("fy")).toBe("fy")
    expect(parsePeriod("last-fy")).toBe("last-fy")
    expect(parsePeriod(undefined)).toBe("lifetime")
    expect(parsePeriod("nonsense")).toBe("lifetime")
  })
})

describe("monthStarts", () => {
  it("lists every month in the span, inclusive", () => {
    expect(monthStarts("2025-11-15", "2026-01-31")).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
    ])
  })
})

describe("resolvePeriod", () => {
  it("this FY runs from the FY start to the end of this month", () => {
    const p = resolvePeriod("fy", ctx)
    expect(p).toMatchObject({
      title: "This FY",
      from: "2026-09-01",
      to: "2026-10-31",
      label: "Sept 2026 – Oct 2026",
      months: ["2026-09-01", "2026-10-01"],
    })
    expect(p.previous).toMatchObject({ from: "2025-09-01", to: "2026-08-31" })
  })

  it("last FY is the full year before, compared with the one before that", () => {
    const p = resolvePeriod("last-fy", ctx)
    expect(p).toMatchObject({
      from: "2025-09-01",
      to: "2026-08-31",
      label: "Sept 2025 – Aug 2026",
    })
    expect(p.months).toHaveLength(12)
    expect(p.previous).toMatchObject({ from: "2024-09-01", to: "2025-08-31" })
  })

  it("lifetime starts at the first month with activity and has no comparison", () => {
    const p = resolvePeriod("lifetime", ctx)
    expect(p).toMatchObject({ from: "2025-10-01", to: "2026-10-31" })
    expect(p.months).toHaveLength(13)
    expect(p.previous).toBeNull()
  })

  it("lifetime with no data is just this month", () => {
    const p = resolvePeriod("lifetime", { ...ctx, firstMonth: null })
    expect(p.months).toEqual(["2026-10-01"])
  })
})
