"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

/** Copies text exactly as shown. */
export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Copy"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}
