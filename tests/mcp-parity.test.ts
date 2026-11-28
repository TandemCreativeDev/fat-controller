import { readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { settingKeys } from "@/lib/settings"
import { ALLOWED } from "@/lib/mcp/access"
import { PAGES, SETTINGS, TOOLS, isHidden } from "@/lib/mcp/coverage"
import { DICTIONARY } from "@/lib/mcp/glossary"
import { createServer } from "@/lib/mcp/server"

/**
 * The app and the MCP analyst move together: a page, table or setting added to
 * one without the other fails here (fields and settings also fail the
 * typecheck, through src/lib/mcp/coverage.ts).
 */

const APP = join(process.cwd(), "src", "app", "(app)")

function pageRoutes(dir = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return pageRoutes(path)
    if (e.name !== "page.tsx") return []
    const route = relative(APP, dir).split(sep).filter(Boolean).join("/")
    return [`/${route}`]
  })
}

const client = new Client({ name: "parity", version: "1" })

beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const server = createServer({
    userId: "parity",
    name: "Parity",
    clientId: null,
  })
  await Promise.all([server.connect(a), client.connect(b)])
})
afterAll(() => client.close())

describe("MCP parity with the app", () => {
  it("maps every app page to the tools that cover it", () => {
    expect(pageRoutes().sort()).toEqual(Object.keys(PAGES).sort())
  })

  it("only maps pages to tools that exist", () => {
    for (const [route, tools] of Object.entries(PAGES)) {
      if (isHidden(tools)) {
        expect(tools.hidden, route).not.toBe("")
        continue
      }
      expect(tools.length, route).toBeGreaterThan(0)
      for (const t of tools) expect(TOOLS, route).toContain(t)
    }
  })

  it("registers exactly the tools in the registry, all read-only", async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([...TOOLS])
    for (const t of tools)
      expect(t.annotations?.readOnlyHint, t.name).toBe(true)
  })

  it("explains every readable table and view in the data dictionary", () => {
    const missing = ALLOWED.filter((t) => {
      const prefix = `${t.split("_")[0]}_*`
      return !DICTIONARY.includes(t) && !DICTIONARY.includes(prefix)
    })
    expect(missing).toEqual([])
  })

  it("has a decision for every setting, and get_settings returns the shown ones", async () => {
    expect(Object.keys(SETTINGS).sort()).toEqual([...settingKeys].sort())
    const res = await client.callTool({ name: "get_settings", arguments: {} })
    const text = (res.content as { type: string; text: string }[])[0].text
    const shown = Object.entries(SETTINGS)
      .filter(([, v]) => !isHidden(v))
      .map(([k]) => k)
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(shown.sort())
  })
})
