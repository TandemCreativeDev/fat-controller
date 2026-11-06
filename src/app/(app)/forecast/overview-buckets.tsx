import { Dot } from "@/components/split-bar"
import type { InOutMonth, MonthSum, OverviewBucket } from "@/lib/forecast-views"
import {
  formatBalance,
  formatDayName,
  formatDayShort,
  formatMoney,
  formatMonth,
  formatMonthName,
  formatSigned,
} from "@/lib/format"
import { cn } from "@/lib/utils"

const figure = "font-mono tabular-nums"

function SumSection({
  title,
  total,
  rows,
  tone,
}: {
  title: string
  total: string
  rows: MonthSum["moneyIn"]
  tone: "in" | "out"
}) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between gap-2">
        <h4
          className={cn(
            "text-xs font-semibold tracking-[0.08em] uppercase",
            tone === "in" ? "text-success" : "text-muted-foreground"
          )}
        >
          {title}
        </h4>
        <p
          className={cn(
            figure,
            "text-lg font-medium",
            tone === "in" && "text-success"
          )}
        >
          {tone === "in" ? "+" : "−"}
          {formatMoney(total)}
        </p>
      </header>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline gap-2">
              <Dot colour={r.colour} className="self-center" />
              <span className="min-w-0 flex-1">{r.label}</span>
              <span className={figure}>{formatMoney(r.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing this month</p>
      )}
    </section>
  )
}

function MonthCard({
  title,
  note,
  sum,
  children,
}: {
  title: string
  note: string
  sum: MonthSum
  children: React.ReactNode
}) {
  return (
    <article className="flex min-w-0 flex-col gap-5 rounded-lg border border-border bg-muted/40 p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-xl font-semibold">{title}</h3>
        <p className="text-right text-xs text-muted-foreground">{note}</p>
      </header>
      <SumSection
        title="Money in"
        total={sum.moneyInTotal}
        rows={sum.moneyIn}
        tone="in"
      />
      <SumSection
        title="Money out"
        total={sum.moneyOutTotal}
        rows={sum.moneyOut}
        tone="out"
      />
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {children}
      </div>
    </article>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
      <span>{label}</span>
      <span className={cn(figure, "text-foreground")}>{value}</span>
    </p>
  )
}

function Headline({
  label,
  sub,
  value,
  negative = false,
}: {
  label: string
  sub?: string
  value: string
  negative?: boolean
}) {
  return (
    <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3">
      <div>
        <p
          className={cn(
            "text-xs font-semibold tracking-[0.08em] uppercase",
            negative ? "text-destructive" : "text-success"
          )}
        >
          {label}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <p
        className={cn(
          figure,
          "text-3xl font-medium",
          negative ? "text-destructive" : "text-success"
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** One month: what came in, what went out, and what each director takes home. */
export function OverviewBucketCard({ bucket }: { bucket: OverviewBucket }) {
  const fromBank = Number(bucket.fromBank)
  return (
    <MonthCard
      title={formatMonthName(bucket.month)}
      note={`payout ${formatDayName(bucket.payoutDate)}`}
      sum={bucket}
    >
      <Line label="Left from the month" value={formatBalance(bucket.left)} />
      <Line
        label={fromBank < 0 ? "Kept in the bank" : "Plus from the bank"}
        value={formatSigned(bucket.fromBank)}
      />
      <Headline
        label="Take-home each"
        sub={`${formatMoney(bucket.payout)} between directors`}
        value={formatMoney(bucket.takeHome)}
      />
      <p className="text-xs text-foreground tabular-nums">
        {bucket.takeHomeNote}
      </p>
      <p className="text-xs text-muted-foreground">
        Leaves {formatBalance(bucket.closing)} in the bank
        {bucket.holdBack &&
          `, including ${formatMoney(bucket.holdBack.amount)} held${
            bucket.holdBack.personName
              ? ` for ${bucket.holdBack.personName}'s bill due ${formatDayShort(bucket.holdBack.dueOn)}`
              : ""
          }`}
        .
      </p>
      {bucket.shortfall && (
        <p className="text-xs font-medium text-destructive">
          {formatMoney(bucket.shortfall)} short next month
          {bucket.taxReserve &&
            `, with ${formatMoney(bucket.taxReserve)} in the tax reserve`}
          .
        </p>
      )}
      {bucket.vatOwed && (
        <p className="text-xs text-muted-foreground">
          {formatMoney(bucket.vatOwed)} VAT owed is kept out of the payout.
        </p>
      )}
    </MonthCard>
  )
}

const BASIS = {
  actual: "from the bank",
  current: "bank so far + forecast",
  forecast: "forecast",
}

/** One month's money in and out, before dividends. */
export function InOutMonthCard({ month }: { month: InOutMonth }) {
  const negative = Number(month.left) < 0
  return (
    <MonthCard
      title={formatMonth(month.month)}
      note={BASIS[month.basis]}
      sum={month}
    >
      <Headline
        label="Left"
        sub="before dividends"
        value={formatBalance(month.left)}
        negative={negative}
      />
      {Number(month.fromReserve) > 0 && (
        <p className="text-xs text-muted-foreground">
          Also {formatMoney(month.fromReserve)} moved back from the tax reserve,
          which isn&apos;t counted above.
        </p>
      )}
    </MonthCard>
  )
}
