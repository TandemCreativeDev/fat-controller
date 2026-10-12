import { describe, expect, it } from "vitest"

import { resolveSettings, settingDefinitions } from "./settings"

describe("resolveSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(resolveSettings([])).toEqual({
      financial_year_start: { month: 4, day: 1 },
    })
  })

  it("uses stored values that pass their schema", () => {
    const s = resolveSettings([
      { key: "financial_year_start", value: { month: 9, day: 1 } },
    ])
    expect(s.financial_year_start).toEqual({ month: 9, day: 1 })
  })

  it("falls back to the default for an invalid stored value", () => {
    const s = resolveSettings([
      { key: "financial_year_start", value: { month: 2, day: 30 } },
    ])
    expect(s.financial_year_start).toEqual({ month: 4, day: 1 })
  })

  it("ignores unknown keys", () => {
    expect(resolveSettings([{ key: "nope", value: 1 }])).not.toHaveProperty(
      "nope"
    )
  })
})

describe("financial_year_start schema", () => {
  const schema = settingDefinitions.financial_year_start.schema
  it("accepts 29 February", () => {
    expect(schema.safeParse({ month: 2, day: 29 }).success).toBe(true)
  })
  it("rejects 31 April", () => {
    expect(schema.safeParse({ month: 4, day: 31 }).success).toBe(false)
  })
})
