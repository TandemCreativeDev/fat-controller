import { readFileSync } from "node:fs"

import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  ALLOWED,
  DENIED_ALL,
  SENSITIVE,
  analystRoleSql,
} from "@/lib/mcp/access"
import { explainReadOnly, runReadOnly } from "@/lib/mcp/sql"
import { TEST_DB_URL } from "./global-setup"

const admin = new Client({ connectionString: TEST_DB_URL })
beforeAll(() => admin.connect())
afterAll(() => admin.end())

describe("analyst query guard", () => {
  it("reads, with numerics as strings and dates as written", async () => {
    const r = await runReadOnly(
      "select 12.50::numeric(14,2) as amount, date '2026-11-30' as d, $1::int as n",
      [7]
    )
    expect(r.rows).toEqual([{ amount: "12.50", d: "2026-11-30", n: 7 }])
    expect(r.columns).toEqual(["amount", "d", "n"])
  })

  it.each([
    "insert into bank_holiday (date, name) values ('2030-01-01', 'x')",
    "update project set name = 'x'",
    "delete from hold_back",
    "create table nope (id int)",
    "set role fat",
  ])("refuses to change anything: %s", async (sql) => {
    await expect(runReadOnly(sql)).rejects.toThrow()
  })

  it("runs one statement only, even with no parameters", async () => {
    await expect(
      runReadOnly("select 1; delete from hold_back")
    ).rejects.toThrow(/multiple commands|cannot insert multiple/i)
  })

  it("stops slow queries", { timeout: 30_000 }, async () => {
    await expect(runReadOnly("select pg_sleep(20)")).rejects.toThrow(
      /15 seconds/
    )
  })

  it("caps rows and says so", async () => {
    const r = await runReadOnly("select g from generate_series(1, 250) g")
    expect(r.rows).toHaveLength(100)
    expect(r).toMatchObject({ rowCount: 250, truncated: true })
    expect(r.note).toMatch(/100 of 250/)
  })

  it("explains without running, and refuses EXPLAIN in the text", async () => {
    expect(await explainReadOnly("select * from project")).toMatch(/Scan/)
    await expect(
      explainReadOnly("explain analyze select * from project")
    ).rejects.toThrow(/without EXPLAIN/)
    await expect(
      explainReadOnly("analyze select * from project")
    ).rejects.toThrow()
  })
})

describe("analyst access", () => {
  const relations = async () =>
    (
      await admin.query<{ name: string }>(
        `select table_name as name from information_schema.tables
         where table_schema = 'public'`
      )
    ).rows.map((r) => r.name)

  it("has a decision for every table and view", async () => {
    const decided = new Set<string>([...ALLOWED, ...DENIED_ALL])
    const missing = (await relations()).filter((t) => !decided.has(t))
    expect(missing).toEqual([])
    const both = ALLOWED.filter((t) => DENIED_ALL.includes(t))
    expect(both).toEqual([])
  })

  it.each([...ALLOWED])("can read %s", async (t) => {
    await expect(
      runReadOnly(`select * from "${t}" limit 1`)
    ).resolves.toBeTruthy()
  })

  it.each([...DENIED_ALL])("can't read %s", async (t) => {
    await expect(runReadOnly(`select * from "${t}" limit 1`)).rejects.toThrow(
      /permission denied/
    )
  })

  it("has no allowed view that reads a sensitive table", async () => {
    // Views run with their owner's rights, so follow each one's dependencies.
    const { rows } = await admin.query<{ view: string; dep: string }>(`
      with recursive deps(view, dep) as (
        select view_name, table_name from information_schema.view_table_usage
        where view_schema = 'public'
        union
        select d.view, u.table_name from deps d
        join information_schema.view_table_usage u on u.view_name = d.dep
      )
      select view, dep from deps`)
    const leaks = rows.filter(
      (r) =>
        (ALLOWED as readonly string[]).includes(r.view) &&
        SENSITIVE.includes(r.dep)
    )
    expect(leaks).toEqual([])
  })

  it("matches the checked-in role script", () => {
    const file = readFileSync(
      new URL("../scripts/analyst-role.sql", import.meta.url),
      "utf8"
    )
    expect(file).toBe(analystRoleSql())
  })
})
