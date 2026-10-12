import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// AES-256-GCM for secrets at rest (the Xero refresh and access tokens).
// Format: v1.<iv>.<tag>.<ciphertext>, each part base64url.

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64")
  if (key.length !== 32)
    throw new Error("Encryption key must be 32 bytes (base64)")
  return key
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return ["v1", iv, tag, ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".")
}

export function decrypt(payload: string, key: Buffer): string {
  const [version, iv, tag, ct] = payload.split(".")
  if (version !== "v1" || !iv || !tag || ct === undefined)
    throw new Error("Unrecognised ciphertext")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
