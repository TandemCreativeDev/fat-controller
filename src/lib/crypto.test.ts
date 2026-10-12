import { randomBytes } from "node:crypto"

import { describe, expect, it } from "vitest"

import { decrypt, encrypt, parseKey } from "./crypto"

const key = randomBytes(32)

describe("encrypt/decrypt", () => {
  it("round-trips", () => {
    const secret = "refresh-token-ünïcode-🙂"
    expect(decrypt(encrypt(secret, key), key)).toBe(secret)
  })

  it("uses a fresh IV each time", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key))
  })

  it("rejects tampered ciphertext", () => {
    const parts = encrypt("secret", key).split(".")
    const ct = Buffer.from(parts[3], "base64url")
    ct[0] ^= 1
    parts[3] = ct.toString("base64url")
    expect(() => decrypt(parts.join("."), key)).toThrow()
  })

  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("secret", key), randomBytes(32))).toThrow()
  })

  it("rejects unknown formats", () => {
    expect(() => decrypt("garbage", key)).toThrow(/Unrecognised/)
  })
})

describe("parseKey", () => {
  it("accepts a 32-byte base64 key", () => {
    expect(parseKey(randomBytes(32).toString("base64")).length).toBe(32)
  })
  it("rejects other lengths", () => {
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(
      /32 bytes/
    )
  })
})
