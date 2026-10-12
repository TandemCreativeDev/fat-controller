import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { getSettings } from "@/lib/settings-store"
import { requireDirector } from "@/lib/session"
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
  const [settings, { xero, reason }] = await Promise.all([
    getSettings(),
    searchParams,
  ])

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Settings"
        lede="Xero connection, finance settings and your password."
      />
      <XeroCard flash={xero} reason={reason} />
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
