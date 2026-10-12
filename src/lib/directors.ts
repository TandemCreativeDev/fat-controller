import { z } from "zod"

const director = z.object({
  name: z.string().min(1),
  email: z.email().toLowerCase(),
})
export type Director = z.infer<typeof director>

/** Parse `Name <email>, Name <email>` into director records. Throws on any malformed entry. */
export function parseDirectorAccounts(raw: string): Director[] {
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (entries.length === 0) throw new Error("DIRECTOR_ACCOUNTS is empty")
  const directors = entries.map((entry, i) => {
    const m = /^(.+?)\s*<([^<>]+)>$/.exec(entry)
    const parsed = director.safeParse(
      m ? { name: m[1].trim(), email: m[2].trim() } : {}
    )
    if (!parsed.success)
      throw new Error(`DIRECTOR_ACCOUNTS entry ${i + 1} is malformed`)
    return parsed.data
  })
  if (new Set(directors.map((d) => d.email)).size !== directors.length) {
    throw new Error("DIRECTOR_ACCOUNTS has duplicate emails")
  }
  return directors
}
