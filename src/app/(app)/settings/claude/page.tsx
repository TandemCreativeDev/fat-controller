import { and, desc, eq, max } from "drizzle-orm"

import { ActionForm } from "@/components/action-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { db } from "@/db"
import { mcpCall, oauthClient, oauthConsent } from "@/db/schema"
import { baseUrl } from "@/env"
import { requireDirector } from "@/lib/session"
import { CopyText } from "./copy-text"
import { revokeConnection } from "./actions"

const when = (d: Date | null) =>
  d
    ? d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      })
    : "never"

function Url({ value }: { value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-muted px-2 py-1 font-mono text-sm break-all">
        {value}
      </code>
      <CopyText text={value} />
    </div>
  )
}

export default async function ClaudeSettingsPage() {
  const director = await requireDirector()
  const url = `${baseUrl}/api/mcp`
  const connections = await db
    .select({
      clientId: oauthConsent.clientId,
      name: oauthClient.name,
      since: oauthConsent.createdAt,
      lastUsed: max(mcpCall.createdAt),
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .leftJoin(
      mcpCall,
      and(
        eq(mcpCall.clientId, oauthConsent.clientId),
        eq(mcpCall.userId, director.id)
      )
    )
    .where(eq(oauthConsent.userId, director.id))
    .groupBy(oauthConsent.clientId, oauthClient.name, oauthConsent.createdAt)
    .orderBy(desc(oauthConsent.createdAt))

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Connect Claude</CardTitle>
          <CardDescription>
            Give Claude read-only access to Fat Controller, so you can ask it
            about the P&amp;L, cash, the forecast, tax and anything else in the
            books. It can&apos;t change anything and never talks to Xero; its
            numbers are as fresh as the last sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 text-sm">
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">The connector URL</h3>
            <Url value={url} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">
              Claude on the web, desktop or phone
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                In Claude, open <strong>Settings → Connectors</strong> and
                choose <strong>Add custom connector</strong>.
              </li>
              <li>
                Name it <strong>Fat Controller</strong> and paste the URL above.
                Leave the OAuth client ID and secret empty.
              </li>
              <li>
                Choose <strong>Connect</strong>. Sign in here with your Fat
                Controller account, then choose <strong>Allow</strong>.
              </li>
              <li>
                In a chat, turn Fat Controller on from the tools menu and ask
                away, for example &ldquo;how&apos;s this month looking?&rdquo;.
                The connector is set up once on the web and then works on
                desktop and phone too.
              </li>
            </ol>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Claude Code</h3>
            <p className="text-muted-foreground">
              Run this, then <code>/mcp</code> in Claude Code to sign in:
            </p>
            <Url
              value={`claude mcp add --transport http fat-controller ${url}`}
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">What it can do</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                The dashboard&apos;s own figures: P&amp;L, clients, aged
                debtors, staff pay, take-home, the forecast, set-asides,
                Corporation Tax, balances and what&apos;s borrowed from the
                reserve.
              </li>
              <li>
                Its own read-only SQL over the synced Xero data and the
                app&apos;s tables, for anything else.
              </li>
              <li>
                Ready-made prompts: month so far, dividend check, CT check,
                client concentration, forecast review.
              </li>
              <li>
                Limits: 30 calls a minute and 1,000 a day each. It can see
                individual pay; it can&apos;t see passwords, tokens or the Xero
                connection.
              </li>
            </ul>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your connections</CardTitle>
          <CardDescription>
            Apps you&apos;ve allowed. Disconnecting stops one straight away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing connected yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {connections.map((c) => (
                <li
                  key={c.clientId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{c.name ?? "Unnamed app"}</p>
                    <p className="text-xs text-muted-foreground">
                      Connected {when(c.since)} · last used {when(c.lastUsed)}
                    </p>
                  </div>
                  <ActionForm
                    action={revokeConnection}
                    submit="Disconnect"
                    variant="outline"
                  >
                    <input type="hidden" name="clientId" value={c.clientId} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
