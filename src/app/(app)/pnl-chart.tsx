"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatGbp } from "@/lib/format"

const config = {
  sales: { label: "Sales", color: "var(--chart-1)" },
  peopleCosts: { label: "People costs", color: "var(--chart-2)" },
} satisfies ChartConfig

export function PnlChart({
  data,
}: {
  data: { label: string; sales: number; peopleCosts: number }[]
}) {
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v: number) => formatGbp(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="tabular-nums">
                    {formatGbp(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="sales" fill="var(--color-sales)" radius={3} />
        <Bar dataKey="peopleCosts" fill="var(--color-peopleCosts)" radius={3} />
      </BarChart>
    </ChartContainer>
  )
}
