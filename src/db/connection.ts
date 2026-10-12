/** Neon hands out `sslmode=require`; upgrade it so the certificate is actually verified. */
export function normaliseConnectionString(url: string): string {
  return url.replace(/([?&])sslmode=require(?=&|$)/, "$1sslmode=verify-full")
}
