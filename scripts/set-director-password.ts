/**
 * Create a local director account, or reset its password. Run it in a terminal:
 *   node --env-file=.env.local --import tsx scripts/set-director-password.ts "Name" email
 * The password is typed at a hidden prompt, so it never reaches shell history.
 * Local Docker Postgres only.
 */
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline/promises"
import { Writable } from "node:stream"

import { hashPassword } from "better-auth/crypto"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db, pool } from "@/db"
import { account, user } from "@/db/schema"

const MIN_PASSWORD_LENGTH = 12

async function ask(question: string): Promise<string> {
  process.stdout.write(question)
  const muted = new Writable({ write: (_chunk, _enc, done) => done() })
  const rl = createInterface({
    input: process.stdin,
    output: muted,
    terminal: process.stdin.isTTY,
  })
  const answer = await rl.question("")
  rl.close()
  process.stdout.write("\n")
  return answer
}

async function main() {
  const [name, rawEmail] = process.argv.slice(2)
  const email = z.email().toLowerCase().parse(rawEmail)
  if (!name) throw new Error("Give a name and an email")
  const host = new URL(process.env.DATABASE_URL ?? "").hostname
  if (host !== "localhost" && host !== "127.0.0.1")
    throw new Error("This script only runs against the local database")

  const password = await ask("New password: ")
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters`)
  if ((await ask("Same again: ")) !== password)
    throw new Error("Those passwords don't match")
  const hash = await hashPassword(password)

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(user)
      .values({ id: randomUUID(), name, email, emailVerified: true })
      .onConflictDoUpdate({ target: user.email, set: { name } })
      .returning({ id: user.id })
    const isCredential = and(
      eq(account.userId, row.id),
      eq(account.providerId, "credential")
    )
    const [existing] = await tx
      .select({ id: account.id })
      .from(account)
      .where(isCredential)
    if (existing)
      await tx.update(account).set({ password: hash }).where(isCredential)
    else
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: row.id,
        providerId: "credential",
        userId: row.id,
        password: hash,
      })
  })
  console.log(`Done. ${email} can sign in.`)
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err)
    await pool.end()
    process.exit(1)
  })
