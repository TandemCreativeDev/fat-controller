import { StatTile } from "@/components/stat-tile"
import { Badge } from "@/components/ui/badge"
import type { PaidInvoice, PaidView, PaidYear } from "@/lib/forecast-views"
import { formatDayName, formatMonth, formatPence } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CtPaidBox } from "./ct-paid-box"

function InvoiceCard({ invoice: i }: { invoice: PaidInvoice }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background p-3 text-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium max-md:line-clamp-2">{i.title}</p>
          {i.clientName && i.clientName !== i.title && (
            <p className="text-xs text-muted-foreground">{i.clientName}</p>
          )}
        </div>
        <p className="font-mono text-base font-semibold tabular-nums">
          {formatPence(i.setAside)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-success text-background">
          Paid {formatDayName(i.paidOn)}
          {i.invoiceNumber && ` · ${i.invoiceNumber}`}
        </Badge>
        {i.partPaid && (
          <Badge variant="outline" className="tabular-nums">
            Part paid: {formatPence(i.paid)}
          </Badge>
        )}
        {i.noCostMatched && (
          <Badge
            variant="outline"
            className="border-destructive text-destructive"
          >
            No contractor cost matched
          </Badge>
        )}
      </div>
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatPence(i.netAmount)} − {formatPence(i.contractorCost)} contractors
        = {formatPence(i.profit)} profit
      </p>
    </li>
  )
}

const yearLabel = (y: PaidYear) =>
  `${formatMonth(y.start)} – ${formatMonth(y.end)}`

function YearBucket({ year }: { year: PaidYear }) {
  const label = yearLabel(year)
  const n = year.invoices.length
  return (
    <section
      className={cn(
        "flex w-full min-w-0 flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3 md:p-4",
        year.ctPaid && "opacity-60"
      )}
    >
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">
            Financial year {label}
          </h2>
          <CtPaidBox yearStart={year.start} label={label} paid={year.ctPaid} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-xs font-medium tracking-wide uppercase">
            {year.ctPaid ? "Set aside (CT paid)" : "Set aside"}
            <span
              className={cn(
                "block font-mono text-2xl font-semibold tracking-normal normal-case tabular-nums",
                year.ctPaid && "line-through"
              )}
            >
              {formatPence(year.total)}
            </span>
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {n} paid {n === 1 ? "invoice" : "invoices"}
          </p>
        </div>
        {year.countedFrom && (
          <p className="text-xs text-muted-foreground">
            Counted from {formatDayName(year.countedFrom)}, the forecast start
            date. Anything paid before that isn&apos;t included.
          </p>
        )}
      </header>
      <ul className="flex flex-col gap-1.5">
        {year.invoices.map((i) => (
          <InvoiceCard key={i.invoiceId} invoice={i} />
        ))}
      </ul>
    </section>
  )
}

/** Each paid invoice's CT set-aside by financial year, and what should be held now. */
export function PaidBuckets({ view }: { view: PaidView }) {
  const open = view.years.filter((y) => !y.ctPaid)
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid gap-4 md:max-w-sm">
        <StatTile
          label="Should be in the tax reserve"
          value={formatPence(view.owed)}
          sub={
            open.length === 0
              ? "Every year's CT is ticked as paid"
              : `For ${open.map(yearLabel).join(" and ")}, CT not yet paid`
          }
          accent
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Each invoice&apos;s set-aside is the Corporation Tax rate in Settings
        times its profit: the amount before VAT, less contractor cost. Tick a
        year once its CT is paid to take it out of the total.
      </p>
      {view.years.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No invoices paid since the forecast start date.
        </p>
      ) : (
        view.years.map((y) => <YearBucket key={y.start} year={y} />)
      )}
    </div>
  )
}
