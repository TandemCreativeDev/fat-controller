"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"

import { useMonth } from "@/components/month-context"
import { cn } from "@/lib/utils"

/** A page's sections: one row that scrolls sideways on mobile, wrapping on desktop. */
export function SectionTabs({
  label,
  tabs,
  active,
}: {
  label: string
  tabs: { key: string; label: string; href: string }[]
  active: string
}) {
  const month = useMonth()?.selected.slice(0, 7)
  const row = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = row.current
    const current = el?.querySelector<HTMLElement>("[aria-current=page]")
    if (el && current)
      el.scrollLeft =
        current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2
  }, [active])
  return (
    <nav
      ref={row}
      aria-label={label}
      data-no-swipe
      className="relative flex w-full gap-1 overflow-x-auto rounded-xl bg-black/30 p-1 text-sm ring-1 ring-violet-500/60 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] max-md:pr-6 md:w-auto md:flex-wrap md:overflow-visible"
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={
            month
              ? `${t.href}${t.href.includes("?") ? "&" : "?"}month=${month}`
              : t.href
          }
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center rounded-lg px-3 py-1.5 font-medium whitespace-nowrap text-muted-foreground hover:text-foreground max-md:min-h-11",
            active === t.key &&
              "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/50"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
