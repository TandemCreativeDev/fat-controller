import { CT_RULES } from "@/lib/corporation-tax"
import type { CtYearRow } from "@/lib/ct-store"
import { CATEGORY_COLOUR } from "@/lib/forecast-colours"
import {
  formatMoney,
  formatMonth,
  formatPence,
  formatPercent,
} from "@/lib/format"
import { cn } from "@/lib/utils"

const SOURCES = [
  {
    href: "https://www.gov.uk/corporation-tax-rates",
    label: "Corporation Tax rates, expenses and reliefs",
  },
  {
    href: "https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax",
    label: "Corporation Tax rates and allowances",
  },
  {
    href: "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar/annex-a-rates-and-allowances",
    label: "Budget 2026, rates and allowances",
  },
  {
    href: "https://www.gov.uk/guidance/corporation-tax-marginal-relief",
    label: "Marginal relief",
  },
  {
    href: "https://www.gov.uk/capital-allowances/annual-investment-allowance",
    label: "Annual Investment Allowance",
  },
]

const pct = (rate: string | number) => formatPercent(Number(rate))

/** A numbered section: heading on the left on wide screens, content on the right. */
function Part({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-3 border-t border-border pt-6 md:grid-cols-[14rem_1fr] md:gap-8">
      <h3 className="flex items-baseline gap-2 font-heading text-base font-semibold">
        <span className="font-mono text-sm text-muted-foreground">{n}</span>
        {title}
      </h3>
      <div className="flex max-w-2xl min-w-0 flex-col gap-4">{children}</div>
    </section>
  )
}

function Points({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground/85 marker:text-muted-foreground">
      {children}
    </ul>
  )
}

/** The three bands as a strip, so the shape of the rules is visible at a glance. */
function RateBands() {
  const bands = [
    {
      key: "small",
      rate: pct(CT_RULES.smallRate),
      label: "Small profits rate",
      range: `Up to ${formatMoney(CT_RULES.lowerLimit)}`,
      grow: 1,
    },
    {
      key: "marginal",
      rate: `${pct(CT_RULES.smallRate)} → ${pct(CT_RULES.mainRate)}`,
      label: "Marginal relief",
      range: `${formatMoney(CT_RULES.lowerLimit)} to ${formatMoney(CT_RULES.upperLimit)}`,
      grow: 2,
    },
    {
      key: "main",
      rate: pct(CT_RULES.mainRate),
      label: "Main rate",
      range: `From ${formatMoney(CT_RULES.upperLimit)}`,
      grow: 1,
    },
  ]
  return (
    <div className="flex gap-0.5">
      {bands.map((b, i) => (
        <div
          key={b.key}
          className="flex min-w-0 flex-col gap-1.5"
          style={{ flexGrow: b.grow, flexBasis: 0 }}
        >
          <div
            aria-hidden
            className="h-2 rounded-[2px]"
            style={{
              background: CATEGORY_COLOUR.set_asides,
              opacity: 0.45 + i * 0.275,
            }}
          />
          <p className="font-mono text-base font-semibold tabular-nums">
            {b.rate}
          </p>
          <p className="text-xs leading-snug">
            {b.label}
            <span className="block text-muted-foreground">{b.range}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

type Line = { label: string; detail?: string; value: string; strong?: boolean }

/** One year's calculation, as a short column of steps ending in the answer. */
function YearSum({ year }: { year: CtYearRow }) {
  const e = year.estimate
  const w = e.working
  const lines: Line[] = [
    { label: "Taxable profit", value: formatPence(e.taxableProfit) },
  ]
  if (e.inProgress && e.projectedProfit)
    lines.push({
      label: "Full year at this pace",
      detail: `${e.elapsedDays} of ${e.periodDays} days gone, so × ${e.periodDays} ÷ ${e.elapsedDays}`,
      value: formatPence(e.projectedProfit),
    })
  if (w.band === "marginal")
    lines.push(
      {
        label: "25% of that",
        value: formatPence(w.mainRateTax),
      },
      {
        label: "Less marginal relief",
        detail: `3/200 × (${formatPence(w.upperLimit)} − ${formatPence(w.profit)})`,
        value: `− ${formatPence(w.relief)}`,
      }
    )
  lines.push({
    label: e.inProgress ? "CT on the full year" : "Corporation Tax",
    detail:
      w.band === "small"
        ? "19% of it"
        : w.band === "main"
          ? "25% of it"
          : w.band === "none"
            ? "No profit, no tax"
            : undefined,
    value: formatPence(w.ct),
    strong: !e.inProgress,
  })
  lines.push({
    label: "Effective rate",
    detail: `${formatPence(w.ct)} ÷ ${formatPence(w.profit)}`,
    value: pct(e.rate),
  })
  if (e.inProgress)
    lines.push({
      label: "CT so far",
      detail: `${formatPence(e.taxableProfit)} × ${pct(e.rate)}`,
      value: formatPence(e.ct),
      strong: true,
    })

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <h4 className="text-sm font-semibold">
        {formatMonth(year.start)} – {formatMonth(year.end)}
        {e.inProgress && (
          <span className="ml-2 font-normal text-muted-foreground">so far</span>
        )}
      </h4>
      <ol className="flex flex-col">
        {lines.map((l) => (
          <li
            key={l.label}
            className={cn(
              "flex items-start justify-between gap-4 py-1.5",
              l.strong && "mt-1 border-t border-border pt-2.5"
            )}
          >
            <span className="min-w-0 text-sm">
              <span className={cn(l.strong && "font-semibold")}>{l.label}</span>
              {l.detail && (
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {l.detail}
                </span>
              )}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-sm tabular-nums",
                l.strong && "text-base font-semibold"
              )}
            >
              {l.value}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The method, the rules and each year's sum, so every figure can be checked. */
export function Working({
  years,
  setAsideRate,
  associatedCompanies,
}: {
  years: CtYearRow[]
  setAsideRate: number
  associatedCompanies: number
}) {
  return (
    <section className="flex flex-col gap-6 rounded-xl border border-border p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold">
          How this is worked out
        </h2>
        <p className="text-sm text-muted-foreground">
          An estimate to keep the reserve right. Your accountant&apos;s figure
          is the final one.
        </p>
      </header>

      <Part n={1} title="Profit">
        <Points>
          <li>
            Built from everything synced from Xero: invoices, bills, credit
            notes, bank transactions and journals, dated by the document.
          </li>
          <li>
            Sales less people costs and other costs, as grouped in Settings.
          </li>
          <li>
            Dividends and other balance-sheet accounts are left out: dividends
            come out of profit after tax.
          </li>
          <li>
            Equipment is taken off in full the year it&apos;s bought (Annual
            Investment Allowance).
          </li>
        </Points>
      </Part>

      <Part n={2} title="The rates">
        <RateBands />
        <Points>
          <li>
            Between the limits, all the profit is taxed at 25%, then marginal
            relief of 3/200 × (£250k − profit) comes off. The rate climbs
            smoothly, with no jump.
          </li>
          <li>
            The limits are shared with associated companies (
            {associatedCompanies} in Settings) and cut for a period shorter than
            a year.
          </li>
          <li>
            A year still running is taxed at the rate a full year at the same
            pace would pay, so the reserve builds at the right rate.
          </li>
          <li>
            The same rates apply from April 2023 to March 2029, so a year
            spanning two tax years needs no splitting.
          </li>
        </Points>
      </Part>

      <Part n={3} title="Each year's sum">
        <div className="grid gap-4 lg:grid-cols-2">
          {years.map((y) => (
            <YearSum key={y.start} year={y} />
          ))}
        </div>
      </Part>

      <Part n={4} title={`The ${formatPercent(setAsideRate)} rule`}>
        <Points>
          <li>
            Each paid invoice sets aside {formatPercent(setAsideRate)} (the rate
            in Settings) of its amount before VAT less contractor cost.
          </li>
          <li>
            Contractor cost is the time contractors tracked in the
            invoice&apos;s period, at their day rate. Before tracking began
            there were no contractors.
          </li>
          <li>
            It leaves out salaries and running costs, so it won&apos;t match the
            estimate. The gap on each year is what to top up.
          </li>
        </Points>
      </Part>

      <Part n={5} title="What it can't see">
        <Points>
          <li>Costs HMRC disallows, such as client entertaining.</li>
          <li>
            Other capital allowances, losses carried forward and R&amp;D relief.
          </li>
          <li>
            A first accounting period shorter than a year: every year here is
            treated as twelve months.
          </li>
          <li>Anything missing from Xero or coded to the wrong account.</li>
        </Points>
      </Part>

      <Part n={6} title="Sources">
        <ul className="flex flex-col gap-1.5 text-sm">
          {SOURCES.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-muted-foreground underline-offset-4 hover:decoration-foreground"
              >
                {s.label}
              </a>
              <span className="text-muted-foreground"> · GOV.UK</span>
            </li>
          ))}
        </ul>
      </Part>
    </section>
  )
}
