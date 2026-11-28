import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"

import { auth } from "@/lib/auth"

// RFC 8414. MCP clients look here, with or without the issuer path (/api/auth).
export const GET = oauthProviderAuthServerMetadata(auth)
