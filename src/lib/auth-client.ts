import { createAuthClient } from "better-auth/react"

// Same-origin: the client talks to /api/auth on whichever deployment served the page.
export const authClient = createAuthClient()
