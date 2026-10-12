import "server-only"

import { eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { accountGroup, xeroAccount } from "@/db/schema"
import { defaultGroup } from "@/lib/pnl"

/** Give every synced account without a group its default one. */
export async function ensureAccountGroups() {
  const missing = await db
    .select({
      accountId: xeroAccount.accountId,
      name: xeroAccount.name,
      class: xeroAccount.class,
    })
    .from(xeroAccount)
    .leftJoin(accountGroup, eq(accountGroup.accountId, xeroAccount.accountId))
    .where(isNull(accountGroup.accountId))
  if (missing.length === 0) return
  await db
    .insert(accountGroup)
    .values(
      missing.map((a) => ({
        accountId: a.accountId,
        group: defaultGroup(a),
        source: "auto" as const,
      }))
    )
    .onConflictDoNothing()
}
