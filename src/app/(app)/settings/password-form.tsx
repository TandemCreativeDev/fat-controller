"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

export function PasswordForm() {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null
  )
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const newPassword = String(form.get("newPassword"))
    if (newPassword !== String(form.get("confirmPassword"))) {
      setStatus({ ok: false, message: "The new passwords don't match." })
      return
    }
    setPending(true)
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword")),
      newPassword,
      revokeOtherSessions: true,
    })
    setPending(false)
    if (error) {
      setStatus({
        ok: false,
        message: error.message ?? "Couldn't change the password.",
      })
      return
    }
    formEl.reset()
    setStatus({
      ok: true,
      message: "Password changed. Other sessions were signed out.",
    })
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      className="flex max-w-md flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">New password (12+ characters)</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
        {status && (
          <p
            role="status"
            className={
              status.ok
                ? "text-sm text-muted-foreground"
                : "text-sm text-destructive"
            }
          >
            {status.message}
          </p>
        )}
      </div>
    </form>
  )
}
