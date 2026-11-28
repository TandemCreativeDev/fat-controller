"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

function continueUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const { redirect, url } = data as { redirect?: unknown; url?: unknown }
  return redirect === true && typeof url === "string" ? url : null
}

export function SignInForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    // Client-side call so the request goes through /api/auth and its rate limiter.
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) {
      setError(
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "Wrong email or password."
      )
      return
    }
    // Signing in part-way through connecting Claude: the server says where the
    // OAuth flow continues (the consent page, or straight back to Claude).
    const next = continueUrl(data)
    if (next) {
      window.location.href = next
      return
    }
    router.replace("/")
    router.refresh()
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}
