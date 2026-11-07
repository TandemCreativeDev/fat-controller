"use client"

import { Copy } from "lucide-react"
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
      <Copy aria-hidden className="md:hidden" />
      <span className="max-md:sr-only">
        {copied ? "Copied" : "Copy for chat"}
      </span>
    </Button>
  )
}
