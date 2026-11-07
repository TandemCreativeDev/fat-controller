import { ActionForm } from "@/components/action-form"
import { Field } from "@/components/form-fields"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  RunningCostGroup,
  RunningCostMonth,
  RunningCostStatus,
  RunningCostTally,
} from "@/lib/forecast"
import {
  formatDayShort,
  formatMoney,
  formatMonth,
  formatPence,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import { saveRunningCostFixed } from "./actions"
import { OneOffBox } from "./one-off-box"

const figure = "font-mono tabular-nums"

const STATUS: Record<RunningCostStatus, string> = {
  in_average: "In the average",
  one_off: "Left out",
  fixed: "Replaced by the fixed amount",
  this_month: "Not in the average yet",
  older: "Too old to count",
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn(figure, "text-lg font-medium")}>{value}</p>
    </div>
  )
}

function Month({ month }: { month: RunningCostMonth }) {
  const hasForecast = Number(month.forecast) !== 0
  const hasSpend = Number(month.spent) !== 0
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-3",
        month.inAverage && "border-violet-400/60",
        hasForecast && !hasSpend && "border-primary/60"
      )}
    >
      <p className="text-xs font-medium">{formatMonth(month.month)}</p>
      <p className={cn(figure, "text-sm")}>{formatMoney(month.total)}</p>
      <p className="text-xs text-muted-foreground">
        {hasForecast
          ? hasSpend
            ? `${formatMoney(month.spent)} so far`
            : "Forecast"
          : month.inAverage
            ? "In the average"
            : "Spent"}
      </p>
      {Number(month.oneOffs) !== 0 && (
        <p className="text-xs text-muted-foreground">
          {formatMoney(month.oneOffs)} one-off
        </p>
      )}
    </li>
  )
}

function Group({ group }: { group: RunningCostGroup }) {
  const markable = group.charges.filter((c) => c.canMark)
  const marked = markable.filter((c) => c.oneOff)
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium break-words">{group.label}</h2>
          <p className="text-xs text-muted-foreground">
            {group.charges.length}{" "}
            {group.charges.length === 1 ? "charge" : "charges"},{" "}
            {formatMoney(group.perMonth)} a month in the forecast
          </p>
        </div>
        <p className={cn(figure, "text-sm font-medium")}>
          {formatPence(group.total)}
        </p>
      </header>
      <ActionForm
        key={`${group.key}-${group.fixedAmount}`}
        action={saveRunningCostFixed}
        submit="Save"
        variant="outline"
        className="flex-row flex-wrap items-end"
      >
        <input type="hidden" name="supplierKey" value={group.key} />
        <Field
          id={`fixed-${group.key.replace(/\W+/g, "-")}`}
          name="amountGbp"
          label="Fixed amount a month (£)"
          hint="Empty uses the average. 0 means it has stopped."
          inputMode="decimal"
          className="min-w-0 flex-1 basis-48"
          defaultValue={group.fixedAmount ?? ""}
        />
      </ActionForm>
      {group.recurring && markable.length > 1 && (
        <OneOffBox
          sourceIds={markable.map((c) => c.sourceId)}
          checked={marked.length === markable.length}
          indeterminate={marked.length > 0 && marked.length < markable.length}
          name={`every ${group.label} charge`}
          label="All one-offs"
        />
      )}
      <ul className="flex flex-col divide-y divide-border/60">
        {group.charges.map((c) => (
          <li
            key={c.sourceId}
            className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span className="tabular-nums">{formatDayShort(c.date)}</span>
            <span
              className={cn(
                figure,
                c.status === "one_off" && "text-muted-foreground line-through"
              )}
            >
              {formatPence(c.amount)}
            </span>
            {c.canMark ? (
              <OneOffBox
                sourceIds={[c.sourceId]}
                checked={c.oneOff}
                name={`${group.label} on ${formatDayShort(c.date)}`}
                label="One-off"
              />
            ) : (
              <span />
            )}
            <span className="col-span-3 text-xs text-muted-foreground">
              {STATUS[c.status]}
            </span>
          </li>
        ))}
      </ul>
    </li>
  )
}

function Groups({
  title,
  description,
  groups,
}: {
  title: string
  description: string
  groups: RunningCostGroup[]
}) {
  if (groups.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} ({groups.length})
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {groups.map((g) => (
            <Group key={g.key} group={g} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Every running cost so far and to come, with a way to leave one-offs out of the average. */
export function RunningCosts({ tally }: { tally: RunningCostTally }) {
  const changed = tally.average !== tally.averageFromBank
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Running costs over the forecast</CardTitle>
          <CardDescription>
            Future months use the average of the last three complete months,
            outlined below, with any fixed amounts you set in place of a
            supplier&apos;s share. A one-off stays in what was spent, but leaves
            the average.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold tracking-[0.08em] text-success uppercase">
                Forecast a month
              </p>
              <p className={cn(figure, "text-3xl font-medium text-success")}>
                {formatMoney(tally.average)}
              </p>
              {changed && (
                <p className="text-xs text-muted-foreground">
                  {formatMoney(tally.averageFromBank)} before one-offs and fixed
                  amounts
                </p>
              )}
            </div>
            <Figure label="Spent so far" value={formatMoney(tally.spent)} />
            <Figure label="Still to come" value={formatMoney(tally.forecast)} />
            <Figure label="Total" value={formatMoney(tally.total)} />
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-9">
            {tally.months.map((m) => (
              <Month key={m.month} month={m} />
            ))}
          </ul>
        </CardContent>
      </Card>
      <Groups
        title="Recurring"
        description="Paid in more than one month. Biggest effect on the average first."
        groups={tally.recurring}
      />
      <Groups
        title="Single charges"
        description="Paid in one month only. Tick the ones that won't come back."
        groups={tally.single}
      />
    </>
  )
}
