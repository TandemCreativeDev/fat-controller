import { describe, expect, it } from "vitest"

import { topWithOther } from "./series"

const item = (label: string, total: number) => ({ key: label, label, total })

describe("topWithOther", () => {
  it("keeps everything, sorted by label, when within the limit", () => {
    const { kept, other } = topWithOther([item("b", 1), item("a", 9)], 5)
    expect(kept.map((k) => k.label)).toEqual(["a", "b"])
    expect(other).toEqual([])
  })

  it("keeps the biggest max-1 by total and folds the rest", () => {
    const items = [
      item("e", 5),
      item("a", 1),
      item("d", 4),
      item("c", 3),
      item("b", 2),
      item("f", 6),
    ]
    const { kept, other } = topWithOther(items, 4)
    expect(kept.map((k) => k.label)).toEqual(["d", "e", "f"])
    expect(other.map((o) => o.label).sort()).toEqual(["a", "b", "c"])
  })
})
