/**
 * Idempotent seed, run by every production build after migrations.
 * - Upserts the director accounts named in DIRECTOR_ACCOUNTS. The initial password
 *   is only set when an account has none, so a changed password survives redeploys.
 * - Inserts default settings that don't exist yet; never overwrites edited ones.
 */
import { randomUUID } from "node:crypto"

import { hashPassword } from "better-auth/crypto"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db, pool } from "@/db"
import { account, settings, user } from "@/db/schema"
import { parseDirectorAccounts } from "@/lib/directors"
import { settingDefinitions, settingKeys } from "@/lib/settings"

const seedEnv = z
  .object({
    DIRECTOR_ACCOUNTS: z.string().min(1),
    DIRECTOR_INITIAL_PASSWORD: z.string().min(12),
  })
  .safeParse(process.env)

if (!seedEnv.success) {
  const names = seedEnv.error.issues.map((i) => i.path.join(".")).join(", ")
  throw new Error(`Seed environment invalid: ${names}`)
}

async function main() {
  const { DIRECTOR_ACCOUNTS, DIRECTOR_INITIAL_PASSWORD } = seedEnv.data!
  const directors = parseDirectorAccounts(DIRECTOR_ACCOUNTS)
  let passwordHash: string | undefined

  for (const d of directors) {
    const [row] = await db
      .insert(user)
      .values({
        id: randomUUID(),
        name: d.name,
        email: d.email,
        emailVerified: true,
      })
      .onConflictDoUpdate({ target: user.email, set: { name: d.name } })
      .returning({ id: user.id })

    const existing = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.userId, row.id), eq(account.providerId, "credential"))
      )
    if (existing.length === 0) {
      passwordHash ??= await hashPassword(DIRECTOR_INITIAL_PASSWORD)
      await db.insert(account).values({
        id: randomUUID(),
        accountId: row.id,
        providerId: "credential",
        userId: row.id,
        password: passwordHash,
      })
      console.log(`seed: created credentials for director ${d.name}`)
    }
  }

  const inserted = await db
    .insert(settings)
    .values(
      settingKeys.map((key) => ({
        key,
        value: settingDefinitions[key].default,
      }))
    )
    .onConflictDoNothing()
    .returning({ key: settings.key })

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
  console.log(
    `seed: ${directors.length} directors upserted (${count} users), ${inserted.length} new settings`
  )
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
