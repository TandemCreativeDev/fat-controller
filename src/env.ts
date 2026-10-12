import { z } from "zod"

// Server-side environment, validated once at import. Never read process.env elsewhere.
const schema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().optional(),
  // Vercel system variables (absent locally).
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // Names only: never echo values.
  const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
  throw new Error(`Invalid environment variables: ${names}`)
}

export const env = parsed.data

/**
 * The origin the server builds auth URLs from. On previews BETTER_AUTH_URL is
 * unset, so derive it from the deployment URL. Use this, never env.BETTER_AUTH_URL.
 */
export const baseUrl: string = (() => {
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL)
    return `https://${env.VERCEL_URL}`
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL
  if (env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  return "http://localhost:3000"
})()

export const trustedOrigins: string[] = [
  baseUrl,
  ...(env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : []),
  ...(env.VERCEL_BRANCH_URL ? [`https://${env.VERCEL_BRANCH_URL}`] : []),
  ...(env.VERCEL_PROJECT_PRODUCTION_URL
    ? [`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`]
    : []),
]
