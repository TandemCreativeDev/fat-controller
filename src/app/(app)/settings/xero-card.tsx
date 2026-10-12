import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { xeroConfig, xeroRedirectUri } from "@/lib/xero/config"
import { getXeroStatus } from "@/lib/xero/status"
import { SyncButton } from "./sync-button"
import { disconnectXero } from "./xero-actions"

const when = (d: Date | null | undefined) =>
  d
    ? d.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
      })
    : "never"

const callbackMessages: Record<string, string> = {
  connected: "Xero connected. Run the first sync below.",
  "not-configured":
    "Xero isn't configured on the server (XERO_CLIENT_ID, XERO_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY).",
}

export async function XeroCard({
  flash,
  reason,
}: {
  flash?: string
  reason?: string
}) {
  const configured = xeroConfig() !== null
  const status = await getXeroStatus()
  const { connection } = status
  const flashMessage =
    flash === "error"
      ? `Xero connection failed (${reason ?? "unknown"}).`
      : flash
        ? callbackMessages[flash]
        : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Xero</CardTitle>
        <CardDescription>
          {connection
            ? `Connected to ${connection.tenantName} on ${when(connection.connectedAt)}.`
            : configured
              ? "Not connected. One director authorises once; the app keeps the connection alive."
              : "Not configured on this server."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {flashMessage && (
          <Alert variant={flash === "error" ? "destructive" : "default"}>
            <AlertDescription>{flashMessage}</AlertDescription>
          </Alert>
        )}
        {connection?.status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>
              The Xero connection needs attention:{" "}
              {connection.lastError ?? "token refresh failed"}. Reconnect below.
            </AlertDescription>
          </Alert>
        )}

        {!connection && configured && (
          <div className="flex flex-col gap-2">
            <a
              href="/api/xero/connect"
              className={buttonVariants({ className: "w-fit" })}
            >
              Connect to Xero
            </a>
            <p className="text-xs text-muted-foreground">
              Redirect URI registered in your Xero app must be exactly{" "}
              <code>{xeroRedirectUri()}</code>
            </p>
          </div>
        )}

        {connection && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <SyncButton
                label={status.backfillDone ? "Sync now" : "Run first sync"}
              />
              <span className="text-sm text-muted-foreground">
                Last complete sync: {when(status.lastCompleted)}
                {status.inProgress && " · a sync is part-way through"}
              </span>
            </div>

            <table className="w-full max-w-md text-sm">
              <tbody>
                {status.counts.map((c) => (
                  <tr key={c.label} className="border-b last:border-0">
                    <td className="py-1.5 text-muted-foreground">{c.label}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {c.count.toLocaleString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {status.recentRuns.some((r) => r.error) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Recent sync errors
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {status.recentRuns
                    .filter((r) => r.error)
                    .slice(0, 5)
                    .map((r) => (
                      <li key={r.id} className="text-destructive">
                        {when(r.startedAt)} · {r.resource}: {r.error}
                      </li>
                    ))}
                </ul>
              </details>
            )}

            <div className="flex flex-wrap gap-3 text-sm">
              <a
                href="/api/xero/connect"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Reconnect
              </a>
              <form action={disconnectXero}>
                <button
                  type="submit"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Disconnect
                </button>
              </form>
            </div>
            <p className="text-xs text-muted-foreground">
              Scopes granted: {connection.scopes || "unknown"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
