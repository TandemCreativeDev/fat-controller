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

export default async function SettingsPage() {
  await requireDirector()
  const settings = await getSettings()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-medium">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Xero</CardTitle>
          <CardDescription>
            Not connected. The Xero connection arrives in the next milestone.
          </CardDescription>
        </CardHeader>
      </Card>
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
