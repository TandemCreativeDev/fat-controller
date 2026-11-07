import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { Dot } from "@/components/split-bar"
import type { InOutMonth, MonthSum, OverviewBucket } from "@/lib/forecast-views"
import {
  formatBalance,
  formatDayName,
  formatMoney,
  formatMonth,
  formatMonthName,
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
        <h3
          className={cn(
            "text-xs font-semibold tracking-[0.08em] uppercase",
            tone === "in" ? "text-success" : "text-muted-foreground"
          )}
        >
          {title}
        </h3>
        <p
          className={cn(
            figure,
            "text-lg font-medium",
            tone === "in" && "text-success"
          )}
        >
          {formatMoney(total)}
        </p>
      </header>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.key}>
              {(r.mobileHref ?? r.href) && (
                <Link
                  href={(r.mobileHref ?? r.href)!}
                  className="flex min-h-11 items-center gap-2 md:hidden"
                >
                  <Dot colour={r.colour} />
                  <span className="min-w-0 flex-1">{r.label}</span>
                  <span className={figure}>{formatMoney(r.amount)}</span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </Link>
              )}
              <div
                className={cn(
                  "items-baseline gap-2",
                  r.mobileHref || r.href ? "hidden md:flex" : "flex"
                )}
              >
                <Dot colour={r.colour} className="self-center" />
                {r.href ? (
                  <Link
                    href={r.href}
                    className="min-w-0 flex-1 underline decoration-muted-foreground underline-offset-4 hover:decoration-foreground"
                  >
                    {r.label}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1">{r.label}</span>
                )}
                <span className={figure}>{formatMoney(r.amount)}</span>
              </div>
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
  top,
  children,
}: {
  title: string
  note: string
  sum: MonthSum
  /** Shown straight under the title on mobile. */
  top?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <article className="flex min-w-0 flex-col gap-5 rounded-lg border border-border bg-muted/40 p-3 md:p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl font-semibold">{title}</h2>
        <p className="text-right text-xs text-muted-foreground">{note}</p>
      </header>
      {top && <div className="flex flex-col gap-1 md:hidden">{top}</div>}
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

/** Money moved back from the tax reserve helped pay the bills, but it isn't income. */
function ReserveNote({ fromReserve }: { fromReserve: string }) {
  if (Number(fromReserve) <= 0) return null
  return (
    <p className="text-xs text-muted-foreground">
      Left before dividends doesn&apos;t count the {formatMoney(fromReserve)}{" "}
      moved back from the tax reserve.
    </p>
  )
}

function Headline({
  label,
  sub,
  value,
}: {
  label: string
  sub?: string
  value: string
}) {
  return (
    <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.08em] text-success uppercase">
          {label}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <p className={cn(figure, "text-3xl font-medium text-success")}>{value}</p>
    </div>
  )
}

/** One month: what came in, what went out, and what each director takes home. */
export function OverviewBucketCard({ bucket }: { bucket: OverviewBucket }) {
  const bankLabel =
    Number(bucket.fromBank) < 0 ? "Kept in the bank" : "Plus from the bank"
  const bankAmount = formatBalance(bucket.fromBank.replace("-", ""))
  const headline = (
    <>
      <Headline
        label="Take-home each"
        sub={`${formatMoney(bucket.payout)} between directors`}
        value={formatMoney(bucket.takeHome)}
      />
      <p className="text-xs text-foreground tabular-nums">
        {bucket.takeHomeNote}
      </p>
    </>
  )
  return (
    <MonthCard
      title={formatMonthName(bucket.month)}
      note={`take-home ${formatDayName(bucket.payoutDate)}`}
      sum={bucket}
      top={headline}
    >
      <Line label="Left from the month" value={formatBalance(bucket.left)} />
      <div className="hidden md:block">
        <Line label={bankLabel} value={bankAmount} />
      </div>
      <details className="md:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{bankLabel}</span>
          <span className={cn(figure, "text-foreground")}>{bankAmount}</span>
        </summary>
        <p className="pb-2 text-xs text-muted-foreground tabular-nums">
          Starts with {formatBalance(bucket.opening)},{" "}
          {formatBalance(bucket.afterPayout)} left after take-home
        </p>
      </details>
      <div className="hidden flex-col gap-2 md:flex">{headline}</div>
      <section
        aria-label={`Left in the bank, ${formatMonthName(bucket.month)}`}
        className={cn(
          "flex flex-col gap-2 rounded-md border p-3",
          bucket.holdBack
            ? "border-amber-400/60 bg-amber-400/10"
            : "border-border"
        )}
      >
        <p className="flex items-baseline justify-between gap-2 text-sm font-semibold">
          <span>Left in the bank after take-home</span>
          <span className={figure}>{formatBalance(bucket.afterPayout)}</span>
        </p>
        {bucket.leftInBank.map((r) => (
          <div key={r.key} className="flex flex-col gap-0.5 text-xs">
            <p className="flex items-baseline justify-between gap-2 font-medium">
              <span>{r.label}</span>
              <span className={figure}>{formatMoney(r.amount)}</span>
            </p>
            {r.reason && <p className="text-muted-foreground">{r.reason}</p>}
          </div>
        ))}
        {bucket.afterPayout !== bucket.closing && (
          <p className="text-xs text-muted-foreground">
            Ends the month at {formatBalance(bucket.closing)}, after costs in
            the last days of the month.
          </p>
        )}
      </section>
      {bucket.shortfall && (
        <p className="text-xs font-medium text-destructive">
          {formatMoney(bucket.shortfall)} short next month
          {bucket.taxReserve &&
            `, with ${formatMoney(bucket.taxReserve)} in the tax reserve`}
          .
        </p>
      )}
    </MonthCard>
  )
}

/** A past month from the bank: just what came in, went out and was left. */
export function EarlierMonthCard({ month }: { month: InOutMonth }) {
  return (
    <article className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
      <h3 className="text-sm font-semibold">{formatMonth(month.month)}</h3>
      <Line label="Money in" value={formatMoney(month.moneyInTotal)} />
      <Line label="Money out" value={formatMoney(month.moneyOutTotal)} />
      <Line label="Left before dividends" value={formatBalance(month.left)} />
      <ReserveNote fromReserve={month.fromReserve} />
    </article>
  )
}
