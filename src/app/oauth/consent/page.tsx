import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { headers } from "next/headers"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { auth } from "@/lib/auth"
import { requireDirector } from "@/lib/session"
import { ConsentButtons } from "./consent-buttons"

/** "Allow Claude to read Fat Controller?" — the last step of connecting an MCP client. */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const director = await requireDirector()
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(params))
    for (const value of Array.isArray(v) ? v : v === undefined ? [] : [v])
      query.append(k, value)

  const { secret } = await auth.$context
  const valid = await verifyOAuthQueryParams(query.toString(), secret)
  const clientId = query.get("client_id")
  const client =
    valid && clientId
      ? await auth.api
          .getOAuthClientPublic({
            query: { client_id: clientId },
            headers: await headers(),
          })
          .catch(() => null)
      : null

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm px-2 py-6">
        <CardHeader>
          <CardTitle className="font-heading text-xl font-semibold">
            {client ? "Connect to Fat Controller?" : "This link has expired"}
          </CardTitle>
          <CardDescription>
            {client
              ? `${client.client_name ?? "An app"} wants read-only access to Tandem's finance data as ${director.name}.`
              : "Start connecting again from Claude."}
          </CardDescription>
        </CardHeader>
        {client && (
          <CardContent className="flex flex-col gap-4 text-sm">
            <ul className="list-disc pl-5 text-muted-foreground">
              <li>
                It can read the P&amp;L, cash, forecast, tax and pay data.
              </li>
              <li>It can&apos;t change anything, and never talks to Xero.</li>
              <li>You can disconnect it any time in Settings.</li>
            </ul>
            <ConsentButtons />
          </CardContent>
        )}
      </Card>
    </main>
  )
}
