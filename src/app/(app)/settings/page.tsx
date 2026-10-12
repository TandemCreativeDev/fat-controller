import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-medium">Settings</h1>
      <XeroCard flash={xero} reason={reason} />
      <Card>
        <CardHeader>
          <CardTitle>Finance</CardTitle>
          <CardDescription>
            Used by the CT set-aside and take-home figures.
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
