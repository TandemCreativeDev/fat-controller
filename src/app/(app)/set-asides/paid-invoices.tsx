import {
  paidByDay,
  type PaidInvoice,
  type PaidYear,
} from "@/lib/forecast-views"
import { CATEGORY_COLOUR } from "@/lib/forecast-colours"
import { formatDayName, formatPence } from "@/lib/format"

function InvoiceTile({ invoice: i }: { invoice: PaidInvoice }) {
  return (
    <li
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-l-4 bg-background px-3 py-2.5"
      style={{ borderLeftColor: CATEGORY_COLOUR.set_asides }}
    >
      <p className="font-mono text-xl font-semibold tabular-nums">
        {formatPence(i.setAside)}
      </p>
      <p className="truncate text-sm font-medium" title={i.title}>
        {i.title}
      </p>
      <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
        {i.invoiceNumber} · {formatPence(i.profit)} profit
      </p>
      {(i.partPaid || i.noCostMatched) && (
        <p className="text-xs">
          {i.partPaid && (
            <span className="text-muted-foreground tabular-nums">
              Part paid: {formatPence(i.paid)}{" "}
            </span>
          )}
          {i.noCostMatched && (
            <span className="text-destructive">No contractor cost matched</span>
          )}
        </p>
      )}
    </li>
  )
}

/** A year's paid invoices by the day they were paid, each with its set-aside. */
export function PaidInvoices({ year }: { year: PaidYear }) {
  return (
    <div className="flex flex-col gap-4">
      {paidByDay(year.invoices).map((day) => (
        <section key={day.paidOn} className="flex flex-col gap-2">
          <h4 className="flex items-baseline justify-between gap-2 border-b border-border pb-1 text-sm">
            <span className="font-medium">
              Paid {formatDayName(day.paidOn)}
            </span>
            <span className="tabular-nums">
              <span className="text-muted-foreground">Set aside </span>
              <span className="font-mono font-semibold">
                {formatPence(day.setAside)}
              </span>
            </span>
          </h4>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
            {day.invoices.map((i) => (
              <InvoiceTile key={i.invoiceId} invoice={i} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
