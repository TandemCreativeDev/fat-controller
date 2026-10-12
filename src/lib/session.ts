import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { auth } from "@/lib/auth"

export type Director = { id: string; name: string; email: string }

/** The signed-in director, or null. Deduplicated per request. */
export const getDirector = cache(async (): Promise<Director | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const { id, name, email } = session.user
  return { id, name, email }
})

/** Every page and server action calls this; the proxy's cookie check is only optimistic. */
export async function requireDirector(): Promise<Director> {
  const director = await getDirector()
  if (!director) redirect("/sign-in")
  return director
}
