import "server-only"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { randomUUID } from "node:crypto"
import { z } from "zod"

import { db } from "@/db"
import { mcpCall } from "@/db/schema"
import { buildAnalysisPack } from "@/lib/analysis-pack"
import { getAnalysisPackInput } from "@/lib/analysis-pack-store"
import { getClientMonthGrid, getClientTable } from "@/lib/clients-store"
import { getCorporationTaxPage, getSetAsidesPage } from "@/lib/ct-store"
import { buildForecastPack } from "@/lib/forecast-pack"
import { getForecastPackInput, getForecastPage } from "@/lib/forecast-store"
import { getPeriod } from "@/lib/period-store"
import { getCostsByAccount, getPnlMonthly } from "@/lib/pnl-store"
import { getSettings } from "@/lib/settings-store"
import { getStaffPay } from "@/lib/staff-store"
import { ALLOWED, SAFE_SETTINGS } from "./access"
import { DICTIONARY, INSTRUCTIONS } from "./glossary"
import {
  DEFAULT_ROWS,
  MAX_ROWS,
  QueryError,
  explainReadOnly,
  runReadOnly,
} from "./sql"

export type Caller = { userId: string; name: string; clientId: string | null }

const FIGURES_BYTES = 50_000
const PACK_BYTES = 150_000

class ToolError extends Error {}

/** JSON text for the model, refusing rather than silently truncating when too big. */
function asText(value: unknown, limit: number): string {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  if (text.length > limit)
    throw new ToolError(
      `That's ${Math.round(text.length / 1000)} KB, over the ${limit / 1000} KB limit. Narrow the period or sections, or use run_query to aggregate.`
    )
  return text
}

const period = z
  .enum(["fy", "last-fy", "lifetime"])
  .default("fy")
  .describe(
    "fy = this financial year, last-fy = the previous one, lifetime = everything"
  )

const sqlArgs = {
  sql: z
    .string()
    .min(1)
    .describe("One SQL statement (Postgres 17). Use $1, $2… for params."),
  params: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default([])
    .describe("Values for $1, $2…"),
}

const SECTIONS = [
  "months",
  "timeline",
  "expected_money",
  "bills",
  "running_costs",
  "accuracy",
  "reserve_loan",
  "warnings",
] as const

/** Every tool is read-only. Each call is logged; errors go back to the model as text. */
export function createServer(caller: Caller): McpServer {
  const server = new McpServer(
    { name: "fat-controller", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  )

  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (
      args: z.infer<z.ZodObject<S>>
    ) => Promise<{ text: string; rows?: number }>
  ) =>
    server.registerTool(
      name,
      { description, inputSchema, annotations: { readOnlyHint: true } },
      (async (args: z.infer<z.ZodObject<S>>) => {
        const started = Date.now()
        let rows: number | undefined
        let error: string | undefined
        try {
          const out = await handler(args)
          rows = out.rows
          return { content: [{ type: "text", text: out.text }] }
        } catch (e) {
          error =
            e instanceof ToolError || e instanceof QueryError
              ? e.message
              : "Something went wrong running that tool."
          if (!(e instanceof ToolError || e instanceof QueryError))
            console.error(`mcp tool ${name} failed`, e)
          return { content: [{ type: "text", text: error }], isError: true }
        } finally {
          await db
            .insert(mcpCall)
            .values({
              id: randomUUID(),
              userId: caller.userId,
              clientId: caller.clientId,
              tool: name,
              arguments: args as Record<string, unknown>,
              durationMs: Date.now() - started,
              rows: rows ?? null,
              error: error ?? null,
            })
            .catch((e: unknown) => console.error("mcp_call log failed", e))
        }
      }) as never
    )

  const json = (value: unknown, limit = FIGURES_BYTES) => ({
    text: asText(value, limit),
  })

  // ---------------------------------------------------------------- explore

  tool(
    "data_dictionary",
    "What the data means: directors, the operating account and tax reserve, set-asides, the reserve loan, buffer, hold-backs, payout day, and which table or view holds what. Read this first.",
    {},
    async () => ({ text: DICTIONARY })
  )

  tool(
    "describe_schema",
    "Tables and views you can query, with their columns and types. Pass a filter (part of a table name) to narrow it.",
    {
      filter: z
        .string()
        .optional()
        .describe("Part of a table or view name, e.g. 'xero_' or 'pnl'"),
    },
    async ({ filter }) => {
      const r = await runReadOnly(
        `select c.table_name, t.table_type, c.column_name, c.data_type
         from information_schema.columns c
         join information_schema.tables t
           on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema = 'public'
           and c.table_name = any($1::text[])
           and ($2::text is null or c.table_name ilike '%' || $2 || '%')
         order by c.table_name, c.ordinal_position`,
        [ALLOWED as unknown as string[], filter ?? null],
        { maxRows: MAX_ROWS }
      )
      const tables = new Map<string, { type: string; columns: string[] }>()
      for (const row of r.rows) {
        const name = String(row.table_name)
        const entry = tables.get(name) ?? {
          type: row.table_type === "VIEW" ? "view" : "table",
          columns: [],
        }
        entry.columns.push(`${row.column_name} ${row.data_type}`)
        tables.set(name, entry)
      }
      return json(Object.fromEntries(tables), PACK_BYTES)
    }
  )

  tool(
    "run_query",
    `Run one read-only SQL statement and get rows back as JSON. This is how to answer anything the get_* tools don't cover. Results are capped at ${DEFAULT_ROWS} rows by default (maxRows up to ${MAX_ROWS}) and about 50 KB, so aggregate in SQL (group by, sum, count) rather than pulling raw rows. Queries time out after 15 seconds. Money columns come back as strings: cast to numeric to add them up.`,
    {
      ...sqlArgs,
      maxRows: z.number().int().min(1).max(MAX_ROWS).default(DEFAULT_ROWS),
    },
    async ({ sql, params, maxRows }) => {
      const r = await runReadOnly(sql, params, { maxRows })
      return { text: JSON.stringify(r), rows: r.rowCount }
    }
  )

  tool(
    "explain_query",
    "Show Postgres's plan for a query without running it, to check a big query will be cheap. Pass the query itself, without EXPLAIN.",
    sqlArgs,
    async ({ sql, params }) => ({ text: await explainReadOnly(sql, params) })
  )

  tool(
    "sample_table",
    "The first rows of a table or view, to see real values and shapes quickly.",
    {
      table: z.enum(ALLOWED as unknown as [string, ...string[]]),
      limit: z.number().int().min(1).max(50).default(5),
    },
    async ({ table, limit }) => {
      const r = await runReadOnly(
        `select * from "${table}" limit $1`,
        [limit],
        {
          maxRows: limit,
        }
      )
      return { text: JSON.stringify(r), rows: r.rowCount }
    }
  )

  // ---------------------------------------------------------------- the app's figures

  tool(
    "get_balances",
    "Today's balances from the last Xero sync: the operating (current) account, the tax reserve, and how much is borrowed from the reserve and not paid back.",
    {},
    async () => {
      const page = await getForecastPage()
      return json({
        currentAccount: page.xeroClosing,
        taxReserve: page.taxReserveBalance,
        borrowedFromReserve: page.reserveOwed,
        manualBalanceToday: page.manualBalance,
        lastXeroSync: page.lastXeroSync,
      })
    }
  )

  tool(
    "get_pnl",
    "The monthly P&L exactly as the dashboard shows it: sales, people costs, other costs, profit, margin, CT set-aside and 3-month averages, plus costs by account for the period.",
    { period },
    async ({ period: key }) => {
      const p = await getPeriod(key)
      const [months, costs] = await Promise.all([
        getPnlMonthly(),
        getCostsByAccount(p.from, p.to),
      ])
      return json({
        period: { key: p.key, title: p.title, from: p.from, to: p.to },
        months: months
          .filter((m) => m.month >= p.from && m.month <= p.to)
          .map(({ asOf: _asOf, ...m }) => m),
        costsByAccount: costs,
      })
    }
  )

  tool(
    "get_clients",
    "Revenue by client for a period, with the same span a year earlier, and each client's revenue by month.",
    { period },
    async ({ period: key }) => {
      const p = await getPeriod(key)
      const [table, grid] = await Promise.all([
        getClientTable(p),
        getClientMonthGrid(p),
      ])
      return json({
        period: { key: p.key, from: p.from, to: p.to },
        clients: table,
        byMonth: grid,
      })
    }
  )

  tool(
    "get_aged_debtors",
    "Who owes money on sales invoices, and how overdue it is.",
    {},
    async () => {
      const r = await runReadOnly("select * from v_aged_debtors", [], {
        maxRows: MAX_ROWS,
      })
      return { text: JSON.stringify(r), rows: r.rowCount }
    }
  )

  tool(
    "get_staff_pay",
    "Staff and contractor pay by month for a period, as on the Staff page.",
    { period },
    async ({ period: key }) => json(await getStaffPay(await getPeriod(key)))
  )

  tool(
    "get_take_home",
    "Each director's salary and dividends by month, and year to date.",
    {},
    async () => {
      const [monthly, ytd] = await Promise.all([
        runReadOnly(
          "select * from v_take_home_monthly order by month, director",
          [],
          { maxRows: MAX_ROWS }
        ),
        runReadOnly("select * from v_take_home_ytd", [], { maxRows: MAX_ROWS }),
      ])
      return json({ monthly: monthly.rows, yearToDate: ytd.rows })
    }
  )

  tool(
    "get_forecast",
    `The cash and take-home forecast, as on the Forecast page. Choose sections: months (money in and out, take-home each, hold-backs, buffer, reserve repayments, shortfalls), timeline (day-by-day balance and events; use from/to), expected_money (invoices expected to land), bills (contractor bills and expected pay dates), running_costs, accuracy (forecast vs actual per invoice), reserve_loan (borrowed from the tax reserve and planned repayments), warnings. Defaults to months and warnings.`,
    {
      sections: z.array(z.enum(SECTIONS)).default(["months", "warnings"]),
      from: z.iso.date().optional().describe("Timeline start, YYYY-MM-DD"),
      to: z.iso.date().optional().describe("Timeline end, YYYY-MM-DD"),
    },
    async ({ sections, from, to }) => {
      const page = await getForecastPage()
      const r = page.result
      if (!r) throw new ToolError("The forecast isn't set up yet.")
      if (r.blocked)
        throw new ToolError(
          `The forecast can't run: set a default pay rate for ${r.missingDefaultRate.join(", ")}.`
        )
      const want = new Set(sections)
      const out: Record<string, unknown> = { today: r.today, buffer: r.buffer }
      if (want.has("months")) out.months = r.months
      if (want.has("timeline"))
        out.timeline = r.timeline.filter(
          (e) => (!from || e.date >= from) && (!to || e.date <= to)
        )
      if (want.has("expected_money")) out.expectedMoney = r.expectedMoney
      if (want.has("bills")) out.bills = r.bills
      if (want.has("running_costs"))
        out.runningCosts = {
          monthlyAverage: r.runningCostAverage,
          ...r.runningCosts,
        }
      if (want.has("accuracy")) out.accuracy = page.accuracy
      if (want.has("reserve_loan"))
        out.reserveLoan = {
          owedNow: r.reserveOwed,
          byMonth: r.months.map((m) => ({
            month: m.month,
            payoutDate: m.payoutDate,
            owedBefore: m.reserveOwedBefore,
            repaying: m.reserveRepaid,
            owedAfter: m.reserveOwedAfter,
            directorChose: m.reserveRepayChosen,
          })),
        }
      if (want.has("warnings")) out.warnings = page.warnings
      return json(out, PACK_BYTES)
    }
  )

  tool(
    "get_corporation_tax",
    "Each financial year's Corporation Tax estimate with its working, whether it's paid, and the estimate, tax reserve and set-aside rule compared (including what's borrowed from the reserve).",
    {},
    async () => {
      const ct = await getCorporationTaxPage()
      if (!ct)
        throw new ToolError(
          "The forecast isn't set up, so CT can't be worked out yet."
        )
      return json(ct, PACK_BYTES)
    }
  )

  tool(
    "get_set_asides",
    "The set-aside owed on each paid invoice, as on the Set-asides page.",
    {},
    async () => {
      const page = await getSetAsidesPage()
      if (!page) throw new ToolError("The forecast isn't set up yet.")
      return json(page, PACK_BYTES)
    }
  )

  tool(
    "get_settings",
    "The app's settings that shape the figures: financial year start, set-aside rate, buffer, bank account roles, VAT, CT years paid and so on.",
    {},
    async () => {
      const s = await getSettings()
      return json(Object.fromEntries(SAFE_SETTINGS.map((k) => [k, s[k]])))
    }
  )

  tool(
    "sync_status",
    "When each Xero and Solidtime resource last synced, and recent errors. Use it to say how fresh the numbers are.",
    {},
    async () => {
      const [cursors, runs] = await Promise.all([
        runReadOnly("select * from sync_cursor order by resource", [], {
          maxRows: MAX_ROWS,
        }),
        runReadOnly(
          "select trigger, resource, started_at, finished_at, rows_changed, error from sync_run order by started_at desc limit 20",
          []
        ),
      ])
      return json({ cursors: cursors.rows, recentRuns: runs.rows })
    }
  )

  // ---------------------------------------------------------------- whole-picture packs

  tool(
    "get_analysis_pack",
    "The Markdown finance analysis pack for a period: P&L, clients, costs and staff in one document. Large: use it for a full review, not a single figure.",
    {
      period,
      includeLines: z
        .boolean()
        .default(false)
        .describe("Include every ledger line (much bigger)"),
    },
    async ({ period: key, includeLines }) => ({
      text: asText(
        buildAnalysisPack(
          await getAnalysisPackInput(await getPeriod(key), includeLines)
        ),
        PACK_BYTES
      ),
    })
  )

  tool(
    "get_forecast_pack",
    "The Markdown forecast pack: settings, projects, people, and the full forecast in one document.",
    {},
    async () => {
      const input = await getForecastPackInput()
      if (!input) throw new ToolError("The forecast isn't set up yet.")
      return { text: asText(buildForecastPack(input), PACK_BYTES) }
    }
  )

  // ---------------------------------------------------------------- prompts

  const prompt = (name: string, description: string, text: string) =>
    server.registerPrompt(name, { description }, () => ({
      messages: [{ role: "user", content: { type: "text", text } }],
    }))

  prompt(
    "month-so-far",
    "How this month is going",
    "How is this month looking? Compare the P&L so far with the last few months, check cash and balances, the forecast take-home, and anything unusual. Say how fresh the data is."
  )
  prompt(
    "dividend-check",
    "Can we take a dividend?",
    "Can we take a dividend now, and how much? Work from cash after the buffer, any hold-back, what's borrowed from the tax reserve, and the Corporation Tax position. Show the working."
  )
  prompt(
    "ct-check",
    "Corporation Tax position",
    "Check our Corporation Tax position: the estimate for each unpaid year, what's in the reserve, what's borrowed from it, the gap, and when it's due."
  )
  prompt(
    "client-concentration",
    "Client concentration and debt",
    "How concentrated is our revenue by client this financial year and how is it trending? Include aged debt and anyone paying slowly."
  )
  prompt(
    "forecast-review",
    "Forecast review",
    "Review the next three months of the forecast: take-home each month, any shortfalls, risks, and how accurate the forecast has been lately."
  )

  return server
}
