import { ActionForm } from "@/components/action-form"
import { Field, SelectField } from "@/components/form-fields"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { db } from "@/db"
import { xeroAccount } from "@/db/schema"
import { requireDirector } from "@/lib/session"
import { getSettings } from "@/lib/settings-store"
import { FinanceForm } from "../finance-form"
import { saveForecastSettings } from "../forecast-actions"
import { FormSection } from "../form-section"

export default async function RulesPage() {
  await requireDirector()
  const [settings, accounts] = await Promise.all([
    getSettings(),
    db
      .select({ id: xeroAccount.accountId, name: xeroAccount.name })
      .from(xeroAccount),
  ])

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Forecast rules</CardTitle>
          <CardDescription>
            These feed every figure on the Forecast page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveForecastSettings} submit="Save rules">
            <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-4">
              <FormSection title="Take-home">
                <Field
                  name="directorSalary"
                  label="Director salary per month, each (£)"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={settings.director_monthly_salary_gbp}
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
              </FormSection>
              <FormSection title="Forecast window">
                <Field
                  name="forecastStartDate"
                  label="Forecast start date"
                  hint="When Solidtime tracking began"
                  type="date"
                  defaultValue={settings.forecast_start_date ?? ""}
                />
                <Field
                  name="months"
                  label="Months to forecast"
                  type="number"
                  defaultValue={settings.forecast_months}
                />
                <Field
                  name="lookback"
                  label="Lookback (days)"
                  type="number"
                  defaultValue={settings.forecast_lookback_days}
                />
              </FormSection>
              <FormSection title="Time and invoices">
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
              </FormSection>
              <FormSection title="VAT">
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
              </FormSection>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Financial year</CardTitle>
          <CardDescription>
            Used by the financial-year and take-home figures.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinanceForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  )
}
