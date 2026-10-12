import { describe, expect, it } from "vitest"

import { parseXeroDate, parseXeroTimestamp, toIfModifiedSince } from "./dates"

describe("parseXeroTimestamp", () => {
  it("parses Microsoft JSON dates with offset", () => {
    expect(parseXeroTimestamp("/Date(1518685950940+0000)/").toISOString()).toBe(
      "2018-02-15T09:12:30.940Z"
    )
  })
  it("parses Microsoft JSON dates without offset", () => {
    expect(parseXeroTimestamp("/Date(0)/").toISOString()).toBe(
      "1970-01-01T00:00:00.000Z"
    )
  })
  it("treats offset-less ISO strings as UTC", () => {
    expect(parseXeroTimestamp("2024-03-01T10:00:00").toISOString()).toBe(
      "2024-03-01T10:00:00.000Z"
    )
  })
  it("throws on garbage", () => {
    expect(() => parseXeroTimestamp("nope")).toThrow(/Unparseable/)
  })
})

describe("parseXeroDate", () => {
  it("takes the date part of an ISO DateString", () => {
    expect(parseXeroDate("2024-03-31T00:00:00")).toBe("2024-03-31")
  })
  it("converts a UTC-midnight Microsoft date", () => {
    expect(parseXeroDate("/Date(1711843200000+0000)/")).toBe("2024-03-31")
  })
})

describe("toIfModifiedSince", () => {
  it("drops milliseconds", () => {
    expect(toIfModifiedSince(new Date("2024-03-01T10:00:00.123Z"))).toBe(
      "2024-03-01T10:00:00"
    )
  })
})
