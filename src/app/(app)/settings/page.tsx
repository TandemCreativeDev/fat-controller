import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import Link from "next/link"
import { getSettings } from "@/lib/settings-store"
import { requireDirector } from "@/lib/session"
import { ActionForm } from "@/components/action-form"
import { Field, SelectField } from "@/components/form-fields"
import { db } from "@/db"
import { solidtimeMember, xeroAccount } from "@/db/schema"
import { formatDay } from "@/lib/format"
import { solidtimeTokenStatus } from "@/lib/forecast-store"
import { solidtimeConfigured } from "@/lib/solidtime/sync"
import { saveForecastSettings } from "./forecast-actions"
import { FinanceForm } from "./finance-form"
import { PasswordForm } from "./password-form"
import { XeroCard } from "./xero-card"

// Manual sync runs ~45-second slices inside a server action.
export const maxDuration = 60

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ xero?: string; reason?: string }>
}) {
  await requireDirector()
  const [settings, { xero, reason }, accounts, members] = await Promise.all([
    getSettings(),
    searchParams,
    db
      .select({ id: xeroAccount.accountId, name: xeroAccount.name })
      .from(xeroAccount),
    db.select({ id: solidtimeMember.id }).from(solidtimeMember),
  ])
  const { tokenExpires, expiringSoon } = solidtimeTokenStatus(settings)

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Settings"
        lede="Xero connection, finance settings and your password."
      />
      <XeroCard flash={xero} reason={reason} />
      <Card>
        <CardHeader>
          <CardTitle>Solidtime</CardTitle>
          <CardDescription>
            Tracked hours for the forecast, pulled by each sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            {solidtimeConfigured()
              ? `Connected. ${members.length} members synced.`
              : "Not set up: add the SOLIDTIME_ environment variables."}
          </p>
          {tokenExpires && (
            <p
              className={
                expiringSoon ? "text-destructive" : "text-muted-foreground"
              }
            >
              Token expires {formatDay(tokenExpires)}.
              {expiringSoon && " Create a new one soon."}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Forecast</CardTitle>
          <CardDescription>
            <Link href="/settings/projects" className="underline">
              Projects
            </Link>
            {" · "}
            <Link href="/settings/people" className="underline">
              People
            </Link>
            {" · "}
            <Link href="/settings/accounts" className="underline">
              Accounts
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveForecastSettings} submit="Save">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                name="forecastStartDate"
                label="Forecast start date"
                hint="When Solidtime tracking began"
                type="date"
                defaultValue={settings.forecast_start_date ?? ""}
              />
              <Field
                name="buffer"
                label="Operating buffer (£)"
                type="number"
                min={0}
                step="0.01"
                defaultValue={settings.operating_buffer_gbp}
              />
              <Field
                name="rate"
                label="Set-aside rate (%)"
                type="number"
                step="0.01"
                defaultValue={settings.ct_set_aside_rate * 100}
              />
              <Field
                name="hoursPerDay"
                label="Hours per day"
                type="number"
                step="0.25"
                defaultValue={settings.hours_per_day}
              />
              <Field
                name="rounding"
                label="Invoice day rounding"
                type="number"
                step="0.01"
                defaultValue={settings.invoice_day_rounding}
              />
              <Field
                name="lookback"
                label="Lookback (days)"
                type="number"
                defaultValue={settings.forecast_lookback_days}
              />
              <Field
                name="months"
                label="Months to forecast"
                type="number"
                defaultValue={settings.forecast_months}
              />
              <Field
                name="vatRegisteredFrom"
                label="VAT registered from"
                hint="Leave empty until registered"
                type="date"
                defaultValue={settings.vat_registered_from ?? ""}
              />
              <Field
                name="vatRate"
                label="VAT rate (%)"
                type="number"
                step="0.01"
                defaultValue={settings.vat_rate * 100}
              />
              <SelectField
                name="vatAccount"
                label="VAT liability account"
                defaultValue={settings.vat_liability_account_id ?? ""}
                options={[
                  { value: "", label: "None" },
                  ...accounts.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Finance</CardTitle>
          <CardDescription>
            Used by the financial-year and take-home figures.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinanceForm settings={settings} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
