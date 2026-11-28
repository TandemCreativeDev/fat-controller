import "server-only"

import { attachDatabasePool } from "@vercel/functions"
import { Pool, types, type QueryConfig } from "pg"

import { normaliseConnectionString } from "@/db/connection"
import { env } from "@/env"
import { ANALYST_ROLE } from "./access"

/**
 * Model-written SQL runs only here: on the read-only `fc_analyst` role, inside a
 * READ ONLY transaction with a timeout, through the extended protocol (one
 * statement per call), with row and size caps. Never on the app's own pool.
 */

export const DEFAULT_ROWS = 100
export const MAX_ROWS = 1000
export const MAX_BYTES = 50_000
const TIMEOUT = "15s"

function analystUrl(): string {
  if (env.ANALYST_DATABASE_URL) return env.ANALYST_DATABASE_URL
  if (env.VERCEL) throw new Error("ANALYST_DATABASE_URL is not set")
  // Local only: the throwaway role `pnpm db:analyst` creates.
  const url = new URL(env.DATABASE_URL)
  url.username = ANALYST_ROLE
  url.password = ANALYST_ROLE
  return url.toString()
}

let pool: Pool | null = null
function analystPool(): Pool {
  if (pool) return pool
  pool = new Pool({
    connectionString: normaliseConnectionString(analystUrl()),
    max: 3,
    idleTimeoutMillis: 5_000,
  })
  if (env.VERCEL) attachDatabasePool(pool)
  return pool
}

// Dates and timestamps stay as Postgres wrote them (no time-zone shifts);
// numeric and bigint are already strings in pg, so money never becomes a float.
const RAW = new Set([
  types.builtins.DATE,
  types.builtins.TIMESTAMP,
  types.builtins.TIMESTAMPTZ,
])
const parsers = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    RAW.has(oid)
      ? (v: string) => v
      : types.getTypeParser(oid, format)) as typeof types.getTypeParser,
}

export type QueryResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  /** Rows the query produced, before any cap. */
  rowCount: number
  truncated: boolean
  /** Why it was cut short, for the model. */
  note?: string
}

export class QueryError extends Error {}

/** Postgres error text is fine to show; connection details never are. */
function describe(error: unknown): string {
  const e = error as { code?: string; message?: string }
  if (
    !e?.code ||
    e.code.startsWith("08") ||
    /ECONN|ENOTFOUND|timeout expired/i.test(e.message ?? "")
  )
    return "The database is unavailable right now. Try again shortly."
  if (e.code === "57014")
    return "The query took longer than 15 seconds and was stopped. Narrow it or aggregate."
  if (e.code === "25006") return "Read-only: this connection can't change data."
  if (e.code === "42501")
    return `${e.message}. That table isn't available to the analyst.`
  return e.message ?? "Query failed."
}

/** Run one read-only statement for the analyst. */
export async function runReadOnly(
  sql: string,
  params: unknown[] = [],
  { maxRows = DEFAULT_ROWS }: { maxRows?: number } = {}
): Promise<QueryResult> {
  const cap = Math.min(Math.max(1, Math.floor(maxRows)), MAX_ROWS)
  const client = await analystPool()
    .connect()
    .catch((e: unknown) => {
      throw new QueryError(describe(e))
    })
  try {
    await client.query("begin read only")
    await client.query(`set local statement_timeout = '${TIMEOUT}'`)
    const config: QueryConfig & { queryMode: "extended" } = {
      text: sql,
      values: params,
      // Extended protocol: one statement only, so `select 1; drop …` fails.
      queryMode: "extended",
      types: parsers,
    }
    const result = await client.query(config)
    const all = result.rows as Record<string, unknown>[]
    let rows = all.slice(0, cap)
    let note: string | undefined =
      all.length > cap
        ? `Showing ${cap} of ${all.length} rows. Aggregate in SQL, or raise maxRows (up to ${MAX_ROWS}).`
        : undefined
    while (rows.length > 1 && JSON.stringify(rows).length > MAX_BYTES) {
      rows = rows.slice(0, Math.floor(rows.length / 2))
      note = `Showing ${rows.length} of ${all.length} rows: the result was over ${MAX_BYTES / 1000} KB. Select fewer columns or aggregate.`
    }
    return {
      columns: result.fields.map((f) => f.name),
      rows,
      rowCount: all.length,
      truncated: rows.length < all.length,
      ...(note ? { note } : {}),
    }
  } catch (e) {
    throw new QueryError(describe(e))
  } finally {
    await client.query("rollback").catch(() => {})
    client.release()
  }
}

/** `EXPLAIN` without ANALYZE (which would run the query). */
export async function explainReadOnly(
  sql: string,
  params: unknown[] = []
): Promise<string> {
  if (/^\s*explain\b/i.test(sql))
    throw new QueryError("Pass the query itself, without EXPLAIN.")
  const result = await runReadOnly(`explain (format text) ${sql}`, params, {
    maxRows: MAX_ROWS,
  })
  return result.rows.map((r) => String(r["QUERY PLAN"])).join("\n")
}
