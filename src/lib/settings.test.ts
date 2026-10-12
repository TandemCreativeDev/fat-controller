import { describe, expect, it } from "vitest"

import { resolveSettings, settingDefinitions } from "./settings"

describe("resolveSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(resolveSettings([])).toEqual({
      ct_set_aside_rate: 0.2,
      financial_year_start: { month: 4, day: 1 },
    })
  })

  it("uses stored values that pass their schema", () => {
    const s = resolveSettings([{ key: "ct_set_aside_rate", value: 0.25 }])
    expect(s.ct_set_aside_rate).toBe(0.25)
  })

  it("falls back to the default for an invalid stored value", () => {
    const s = resolveSettings([
      { key: "ct_set_aside_rate", value: 1.5 },
      { key: "financial_year_start", value: { month: 2, day: 30 } },
    ])
    expect(s.ct_set_aside_rate).toBe(0.2)
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
