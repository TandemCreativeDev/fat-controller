"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatGbp, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Categorical slots in fixed order (validated against the dark card surface). */
export const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
const OTHER_COLOR = "rgb(255 255 255 / 0.28)"

export type Series = { key: string; label: string }
type Format = "gbp" | "percent"
const fmt = (f: Format, v: number) =>
  f === "gbp" ? formatGbp(v) : formatPercent(v)

function configFor(series: Series[]): ChartConfig {
  return Object.fromEntries(
    series.map((s, i) => [
      s.key,
      {
        label: s.label,
        color: s.key === "other" ? OTHER_COLOR : SERIES_COLORS[i % 5],
      },
    ])
  )
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
} as const

function Tooltip({ format, config }: { format: Format; config: ChartConfig }) {
  return (
    <ChartTooltip
      cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
      content={
        <ChartTooltipContent
          formatter={(value, name, item) => (
            <div className="flex w-full items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 rounded-[2px]"
                  style={{ background: item.color }}
                />
                {config[String(name)]?.label ?? name}
              </span>
              <span className="font-medium text-foreground tabular-nums">
                {fmt(format, Number(value))}
              </span>
            </div>
          )}
        />
      }
    />
  )
}

/** Monthly bars per series, side by side or stacked. One y-axis. */
export function MonthlyBars({
  data,
  series,
  stacked = false,
  format = "gbp",
  className,
}: {
  data: Record<string, string | number>[]
  series: Series[]
  stacked?: boolean
  format?: Format
  className?: string
}) {
  const config = configFor(series)
  return (
    <ChartContainer config={config} className={cn("h-64 w-full", className)}>
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis
          {...axisProps}
          width={64}
          tickFormatter={(v: number) => fmt(format, v)}
        />
        <Tooltip format={format} config={config} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? "a" : undefined}
            fill={`var(--color-${s.key})`}
            // 2px surface gap between stacked segments; rounded only at the top.
            stroke={stacked ? "var(--background)" : undefined}
            strokeWidth={stacked ? 2 : 0}
            radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/** A single trend line (e.g. margin %), optional zero baseline. */
export function TrendLine({
  data,
  series,
  format = "percent",
  className,
  area = false,
}: {
  data: Record<string, string | number | null>[]
  series: Series[]
  format?: Format
  className?: string
  area?: boolean
}) {
  const config = configFor(series)
  const Chart = area ? AreaChart : LineChart
  return (
    <ChartContainer config={config} className={cn("h-48 w-full", className)}>
      <Chart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`fill-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={`var(--color-${s.key})`}
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor={`var(--color-${s.key})`}
                stopOpacity={0}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis
          {...axisProps}
          width={64}
          tickFormatter={(v: number) => fmt(format, v)}
        />
        <ReferenceLine y={0} stroke="rgb(255 255 255 / 0.2)" />
        <Tooltip format={format} config={config} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) =>
          area ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              fill={`url(#fill-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
              connectNulls
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2, stroke: "var(--background)" }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }}
              connectNulls
            />
          )
        )}
      </Chart>
    </ChartContainer>
  )
}

/**
 * Share-of-total donut with a direct-labelled legend (name, amount, share), so
 * identity never relies on colour alone. Pass slices in a stable order.
 */
export function ShareDonut({
  slices,
  centerLabel,
}: {
  slices: { key: string; label: string; value: number }[]
  centerLabel: string
}) {
  // Colours come from the full slice list so they match the other charts.
  const config = configFor(slices)
  const positive = slices.filter((s) => s.value > 0)
  const total = positive.reduce((t, s) => t + s.value, 0)
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <ChartContainer config={config} className="aspect-square h-48 shrink-0">
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">
                      {config[String(name)]?.label ?? name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatGbp(Number(value))} ·{" "}
                      {formatPercent(total ? Number(value) / total : null)}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Pie
            data={positive}
            dataKey="value"
            nameKey="key"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={positive.length > 1 ? 2 : 0}
            stroke="var(--background)"
            strokeWidth={2}
            cornerRadius={4}
            isAnimationActive={false}
          >
            {positive.map((s) => (
              <Cell key={s.key} fill={`var(--color-${s.key})`} />
            ))}
          </Pie>
          <text
            x="50%"
            y="47%"
            textAnchor="middle"
            className="fill-foreground font-heading text-lg font-semibold"
          >
            {formatGbp(total)}
          </text>
          <text
            x="50%"
            y="59%"
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {centerLabel}
          </text>
        </PieChart>
      </ChartContainer>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {positive.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: config[s.key]?.color }}
            />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="tabular-nums">{formatGbp(s.value)}</span>
            <span className="w-14 text-right text-muted-foreground tabular-nums">
              {formatPercent(total ? s.value / total : null)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
