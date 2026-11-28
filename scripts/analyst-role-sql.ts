import { writeFileSync } from "node:fs"

import { analystRoleSql } from "../src/lib/mcp/access"

// Regenerates scripts/analyst-role.sql from src/lib/mcp/access.ts.
writeFileSync(new URL("./analyst-role.sql", import.meta.url), analystRoleSql())
