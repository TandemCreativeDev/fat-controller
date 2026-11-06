import { asc } from "drizzle-orm"

import { ActionForm } from "@/components/action-form"
import { SelectField } from "@/components/form-fields"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { db } from "@/db"
import { accountGroup, xeroAccount } from "@/db/schema"
import { londonDate } from "@/lib/forecast"
import { uncountedSpend } from "@/lib/forecast-store"
import { formatDay, formatPence } from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { getSettings } from "@/lib/settings-store"
import { saveAccountGroups, saveBankRoles } from "../forecast-actions"
import { FormSection } from "../form-section"

const GROUPS = [
  { value: "sales", label: "Sales" },
  { value: "people", label: "People" },
  { value: "other", label: "Other" },
  { value: "exclude", label: "Exclude" },
]

const CLASSES = [
  { value: "REVENUE", label: "Income" },
  { value: "EXPENSE", label: "Expenses" },
  { value: "ASSET", label: "Assets" },
  { value: "LIABILITY", label: "Liabilities" },
  { value: "EQUITY", label: "Equity" },
]

export default async function AccountsPage() {
  await requireDirector()
  const settings = await getSettings()
  const [accounts, groups] = await Promise.all([
    db.select().from(xeroAccount).orderBy(asc(xeroAccount.name)),
    db.select().from(accountGroup),
  ])
  const groupOf = new Map(groups.map((g) => [g.accountId, g]))
  const bankAccounts = accounts.filter((a) => a.type === "BANK")
  const roles = settings.bank_account_roles as Record<string, string>
  const hasOperating = Object.values(roles).includes("operating")
  const uncounted = hasOperating
    ? await uncountedSpend(settings, londonDate(new Date()))
    : []
  const known = new Set(CLASSES.map((c) => c.value))
  const pAndL = accounts.filter((a) => a.type !== "BANK")
  const sections = [
    ...CLASSES.map((c) => ({
      label: c.label,
      rows: pAndL.filter((a) => a.class === c.value),
    })),
    {
      label: "Other",
      rows: pAndL.filter((a) => !a.class || !known.has(a.class)),
    },
  ].filter((c) => c.rows.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bank accounts</CardTitle>
            <CardDescription>
              The forecast uses operating accounts only. The tax reserve is
              shown beside any shortfall, but never counted as cash to pay out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bank accounts yet. Run a sync from Connections.
              </p>
            ) : (
              <ActionForm action={saveBankRoles} submit="Save roles">
                <div className="grid gap-3 sm:grid-cols-2">
                  {bankAccounts.map((a) => (
                    <SelectField
                      key={a.accountId}
                      name={`role:${a.accountId}`}
                      label={a.name}
                      defaultValue={roles[a.accountId] ?? ""}
                      options={[
                        { value: "", label: "Not used" },
                        { value: "operating", label: "Operating" },
                        { value: "tax_reserve", label: "Tax reserve" },
                      ]}
                    />
                  ))}
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spend missing from the P&amp;L</CardTitle>
            <CardDescription>
              Operating-account spend in the last 12 months coded to an account
              grouped as Exclude. Transfers and dividends to a director are left
              out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasOperating ? (
              <p className="text-sm text-muted-foreground">
                Tag an operating account above to run this check.
              </p>
            ) : uncounted.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to check.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {uncounted.map((l, i) => (
                  <li
                    key={`${l.date}-${i}`}
                    className="grid grid-cols-[1fr_auto] gap-x-3 py-2 text-sm"
                  >
                    <span className="font-medium">{l.contact}</span>
                    <span className="font-mono tabular-nums">
                      {formatPence(l.amount)}
                    </span>
                    <span className="col-span-2 text-xs text-muted-foreground">
                      {l.account} · {formatDay(l.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account groups</CardTitle>
          <CardDescription>
            Where each account appears on the P&amp;L. A group you choose here
            is never overwritten by a sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveAccountGroups} submit="Save groups">
            <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {sections.map((c) => (
                <FormSection
                  key={c.label}
                  title={`${c.label} (${c.rows.length})`}
                >
                  {c.rows.map((a) => {
                    const g = groupOf.get(a.accountId)
                    return (
                      <SelectField
                        key={a.accountId}
                        name={`group:${a.accountId}`}
                        label={
                          g?.source === "manual" ? `${a.name} (manual)` : a.name
                        }
                        className="grid grid-cols-[1fr_7rem] items-center gap-3"
                        defaultValue={g?.group ?? "exclude"}
                        options={GROUPS}
                      />
                    )
                  })}
                </FormSection>
              ))}
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  )
}
