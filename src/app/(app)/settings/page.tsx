import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getSettings } from "@/lib/settings-store"
import { requireDirector } from "@/lib/session"
import { db } from "@/db"
import { solidtimeMember } from "@/db/schema"
import { formatDay } from "@/lib/format"
import { solidtimeTokenStatus } from "@/lib/forecast-store"
import { solidtimeConfigured } from "@/lib/solidtime/sync"
import { XeroCard } from "./xero-card"

// Manual sync runs ~45-second slices inside a server action.
export const maxDuration = 60

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ xero?: string; reason?: string }>
}) {
  await requireDirector()
  const [settings, { xero, reason }, members] = await Promise.all([
    getSettings(),
    searchParams,
    db.select({ id: solidtimeMember.id }).from(solidtimeMember),
  ])
  const { tokenExpires, expiringSoon } = solidtimeTokenStatus(settings)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
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
    </div>
  )
}
