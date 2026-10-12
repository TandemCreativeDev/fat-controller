import { describe, expect, it } from "vitest"

import { parseDirectorAccounts } from "./directors"

describe("parseDirectorAccounts", () => {
  it("parses names and lowercases emails", () => {
    expect(
      parseDirectorAccounts(
        "Jack <Jack@Example.com>, Max Smith <max@example.com>"
      )
    ).toEqual([
      { name: "Jack", email: "jack@example.com" },
      { name: "Max Smith", email: "max@example.com" },
    ])
  })

  it("rejects an entry without angle brackets", () => {
    expect(() => parseDirectorAccounts("jack@example.com")).toThrow(/entry 1/)
  })

  it("rejects an invalid email without echoing it", () => {
    expect(() => parseDirectorAccounts("Jack <jack>")).toThrow(
      /^DIRECTOR_ACCOUNTS entry 1 is malformed$/
    )
  })

  it("rejects duplicates", () => {
    expect(() => parseDirectorAccounts("A <a@x.com>, B <A@x.com>")).toThrow(
      /duplicate/
    )
  })

  it("rejects empty input", () => {
    expect(() => parseDirectorAccounts(" , ")).toThrow(/empty/)
  })
})
