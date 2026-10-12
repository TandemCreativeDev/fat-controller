import { describe, expect, it } from "vitest"

import {
  buildAnalysisPack,
  csv,
  markdownTable,
  type AnalysisPackInput,
} from "./analysis-pack"

const input: AnalysisPackInput = {
  company: "Demo Ltd",
  generatedAt: new Date("2026-10-12T09:00:00Z"),
  asOf: new Date("2026-10-12T08:30:00Z"),
  period: { from: "2025-10-01", to: "2026-10-31" },
  fyStart: "2026-09-01",
  ctRate: 0.2,
  groups: { sales: ["Sales"], people: ["Salaries"], other: ["Software"] },
  pnl: [
    {
      month: "2026-09-01",
      sales: 1000,
      peopleCosts: 400,
      otherCosts: 100,
      profit: 500,
      margin: 0.5,
      ctSetAside: 200,
    },
  ],
  clientMonths: [
    {
      month: "2026-09-01",
      client: "A | B Ltd",
      invoiced: 1000,
      received: 1200,
    },
  ],
  aged: [],
  costs: [
    {
      month: "2026-09-01",
      account: "Salaries",
      group: "People costs",
      amount: 400,
    },
  ],
  takeHome: [
    {
      director: "Director One",
      salary: 1047.5,
      dividends: 2000,
      total: 3047.5,
    },
  ],
}

describe("buildAnalysisPack", () => {
  const md = buildAnalysisPack(input)

  it("starts with the context header and definitions", () => {
    expect(md.startsWith("# Demo Ltd: finance analysis pack")).toBe(true)
    expect(md).toContain("**Period:** 2025-10 to 2026-10")
    expect(md).toContain("all Sales and cost figures **exclude VAT**")
    expect(md).toContain("**Corporation Tax set-aside:** 20.0% of Sales")
    expect(md).toContain("- **People costs:** Salaries.")
  })

  it("writes the P&L as a right-aligned table with units in the headers", () => {
    expect(md).toContain(
      "| Month (YYYY-MM) | Sales (GBP, ex VAT) | People costs (GBP) | Other costs (GBP) | Profit (GBP) | Margin (%) | CT set-aside (GBP) |"
    )
    expect(md).toContain(
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n| 2026-09 | 1000.00 | 400.00 | 100.00 | 500.00 | 50.0 | 200.00 |"
    )
  })

  it("escapes pipes in cell text", () => {
    expect(md).toContain("| 2026-09 | A \\| B Ltd | 1000.00 | 1200.00 |")
  })

  it("says so when a table has no rows", () => {
    expect(md).toMatch(/## Aged debtors[\s\S]*?_No rows._/)
  })

  it("omits the CSV appendix unless lines are given", () => {
    expect(md).not.toContain("Appendix")
    const withLines = buildAnalysisPack({
      ...input,
      lines: [
        {
          date: "2026-09-10",
          type: "Sales invoice",
          number: "INV-1",
          contact: 'Client "X", Ltd',
          account: "Sales",
          description: "Design\nwork",
          net: 1000,
        },
      ],
    })
    expect(withLines).toContain(
      "```csv\ndate,type,invoice_number,contact,account,description,net_gbp\n"
    )
    expect(withLines).toContain(
      '2026-09-10,Sales invoice,INV-1,"Client ""X"", Ltd",Sales,"Design\nwork",1000.00'
    )
  })
})

describe("helpers", () => {
  it("markdownTable left-aligns text columns", () => {
    expect(markdownTable(["a", "b"], [["x", 1]])).toBe(
      "| a | b |\n| --- | ---: |\n| x | 1 |"
    )
  })
  it("csv quotes only when needed", () => {
    expect(csv(["a"], [["plain"], ["has,comma"]])).toBe('a\nplain\n"has,comma"')
  })
})
