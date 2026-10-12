"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { syncNow, type SyncActionResult } from "./xero-actions"

export function SyncButton({ label }: { label: string }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SyncActionResult | null>(null)

  async function run() {
    setRunning(true)
    setResult(null)
    try {
      // Keep going while the server reports more to do (first backfill).
      for (let i = 0; i < 40; i++) {
        const r = await syncNow()
        setResult(r)
        router.refresh()
        if (r.status !== "partial") break
      }
    } catch {
      setResult({
        status: "failed",
        message: "The sync request failed. Check the server logs.",
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={running}>
        {running ? "Syncing…" : label}
      </Button>
      {result && (
        <p
          role="status"
          className={
            result.status === "failed"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {result.message}
        </p>
      )}
    </div>
  )
}
