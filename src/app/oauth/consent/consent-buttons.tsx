"use client"

import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function ConsentButtons() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function answer(accept: boolean) {
    setPending(true)
    setError(null)
    // The client plugin adds the signed query from this page's URL.
    const { data, error } = await authClient.oauth2.consent({ accept })
    if (error || !data?.url) {
      setPending(false)
      setError("That didn't work. Start connecting again from Claude.")
      return
    }
    window.location.href = data.url
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => answer(true)}>
          Allow
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => answer(false)}
        >
          Deny
        </Button>
      </div>
    </div>
  )
}
