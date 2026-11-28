import { auth } from "@/lib/auth"

// RFC 9728 metadata for /api/mcp. The mcp() plugin builds it when a request
// reaches the Better Auth handler, which only routes /api/auth by itself.
export const GET = (request: Request) => auth.handler(request)
