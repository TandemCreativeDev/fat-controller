import { handleMcp } from "@/lib/mcp/handler"

// The MCP analyst (PLAN.md): read-only tools over Streamable HTTP for Claude,
// behind OAuth. Every request is checked in handleMcp.
export const dynamic = "force-dynamic"

export const GET = handleMcp
export const POST = handleMcp
export const DELETE = handleMcp
