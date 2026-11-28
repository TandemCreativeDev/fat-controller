import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { createAuthClient } from "better-auth/react"

// Same-origin: the client talks to /api/auth on whichever deployment served the page.
// The OAuth plugin carries a signed authorize query from the page URL into
// sign-in and consent requests, so the MCP connection flow resumes.
export const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
})
