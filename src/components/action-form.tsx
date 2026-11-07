"use client"

import { startTransition, useActionState, useEffect, useRef } from "react"

import { useInSheet } from "@/components/bottom-sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type FormState = { ok: boolean; message: string } | null

/** A form posting to a server action, with its pending state and result message. */
export function ActionForm({
  action,
  submit,
  variant = "default",
  resetOnSuccess = false,
  className,
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  submit: string
  variant?: "default" | "outline" | "ghost" | "destructive"
  /** Clear the fields once saved, for a form that adds a new row. */
  resetOnSuccess?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const form = useRef<HTMLFormElement>(null)
  // Only the main action is pinned: never a delete or clear.
  const pinned = useInSheet() && variant !== "ghost"
  useEffect(() => {
    if (state?.ok && resetOnSuccess) form.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form
      ref={form}
      // Not `action=`: React resets a form after its action, which would throw
      // away what was typed whenever a value needs correcting.
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => formAction(data))
      }}
      className={cn("flex flex-col gap-3", pinned && "flex-1", className)}
    >
      {children}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3",
          // In a sheet, the action stays on screen above the safe area.
          pinned &&
            "sticky bottom-0 z-10 -mx-4 mt-auto w-[calc(100%+2rem)] border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        )}
      >
        <Button
          type="submit"
          variant={variant}
          size="sm"
          disabled={pending}
          className={pinned ? "w-full" : undefined}
        >
          {pending ? "Saving…" : submit}
        </Button>
        {state && (
          <p
            role="status"
            className={
              state.ok
                ? "text-xs text-muted-foreground"
                : "text-xs text-destructive"
            }
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  )
}
