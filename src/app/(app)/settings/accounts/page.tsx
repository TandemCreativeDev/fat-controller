import { asc } from "drizzle-orm"
import Link from "next/link"

import { ActionForm } from "@/components/action-form"
import { SelectField } from "@/components/form-fields"
import { PageHeader } from "@/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { db } from "@/db"
import { accountGroup, xeroAccount } from "@/db/schema"
import { londonDate } from "@/lib/forecast"
import { uncountedSpend } from "@/lib/forecast-store"
import { formatDay, formatPence } from "@/lib/format"
import { requireDirector } from "@/lib/session"
import { getSettings } from "@/lib/settings-store"
import { saveAccountGroups, saveBankRoles } from "../forecast-actions"

const GROUPS = [
  { value: "sales", label: "Sales" },
  { value: "people", label: "People" },
  { value: "other", label: "Other" },
  { value: "exclude", label: "Exclude" },
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

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Accounts"
        lede="Bank account roles, spend missing from the P&L, and account groups."
        note={
          <Link href="/settings" className="underline">
            Back to Settings
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Bank accounts</CardTitle>
          <CardDescription>
            The forecast uses operating accounts only. The tax reserve is shown
            beside any shortfall, but never counted as cash to pay out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bank accounts yet. Run a sync from Settings.
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uncounted.map((l, i) => (
                  <TableRow key={`${l.date}-${i}`}>
                    <TableCell className="whitespace-nowrap">
                      {formatDay(l.date)}
                    </TableCell>
                    <TableCell>{l.contact}</TableCell>
                    <TableCell>{l.account}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPence(l.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
            <div className="grid gap-3 sm:grid-cols-2">
              {accounts
                .filter((a) => a.type !== "BANK")
                .map((a) => {
                  const g = groupOf.get(a.accountId)
                  return (
                    <SelectField
                      key={a.accountId}
                      name={`group:${a.accountId}`}
                      label={a.name}
                      hint={
                        g?.source === "manual" ? "Set by a director" : undefined
                      }
                      defaultValue={g?.group ?? "exclude"}
                      options={GROUPS}
                    />
                  )
                })}
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  )
}
