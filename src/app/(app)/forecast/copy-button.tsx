"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

/** Copies the breakdown as fixed-width text, for chat apps without table support. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(`\`\`\`\n${text}\n\`\`\``)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? "Copied" : "Copy for chat"}
    </Button>
  )
}
