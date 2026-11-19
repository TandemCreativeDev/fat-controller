import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { getSetAsidesPage } from "@/lib/ct-store"
import {
  formatDay,
  formatMonth,
  formatPence,
  formatPercent,
} from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { PaidInvoices } from "./paid-invoices"

export default async function SetAsidesPage() {
  await requireDirector()
  const data = await getSetAsidesPage()

  const header = (
    <PageHeader
      title="Set-asides"
      lede="What to move to the tax reserve as each invoice is paid."
    />
  )

  if (!data)
    return (
      <div className="flex flex-col gap-8">
        {header}
        <Card>
          <CardContent className="text-sm">
            This needs the forecast set up first.{" "}
            <Link href="/forecast" className="underline">
              Go to the forecast
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    )

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      {header}
      <p className="max-w-2xl text-sm text-muted-foreground">
        Each paid invoice sets aside {formatPercent(data.setAsideRate)} (the
        rate in Settings) of its amount before VAT less contractor cost. It
        leaves out salaries and running costs, so it&apos;s a running guide, not
        the tax bill: see{" "}
        <Link href="/corporation-tax" className="underline underline-offset-4">
          Corporation tax
        </Link>{" "}
        for what each year owes.
      </p>
      {data.years.length === 0 && (
        <p className="text-sm text-muted-foreground">No paid invoices yet.</p>
      )}
      {data.years.map((y) => (
        <section
          key={y.start}
          className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3 md:p-4"
        >
          <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
            <h2 className="font-heading text-base font-semibold">
              Financial year {formatMonth(y.start)} – {formatMonth(y.end)}
            </h2>
            <p className="text-right text-xs font-medium tracking-wide uppercase">
              Set aside
              <span className="block font-mono text-2xl font-semibold tracking-normal normal-case tabular-nums">
                {formatPence(y.total)}
              </span>
            </p>
            {y.countedFrom && (
              <p className="w-full text-xs text-muted-foreground">
                Invoices counted from {formatDay(y.countedFrom)}.
              </p>
            )}
          </header>
          <PaidInvoices year={y} />
        </section>
      ))}
    </div>
  )
}
