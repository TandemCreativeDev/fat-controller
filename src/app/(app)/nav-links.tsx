"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

// Dashboard pages share the period switch, so the chosen period follows the nav.
const nav = [
  { href: "/", label: "P&L", periodic: true },
  { href: "/clients", label: "Clients", periodic: true },
  { href: "/staff", label: "Staff", periodic: true },
  { href: "/settings", label: "Settings", periodic: false },
]

export function NavLinks() {
  const pathname = usePathname()
  const period = useSearchParams().get("period")
  return (
    <nav className="flex gap-1 rounded-xl bg-black/30 p-1 text-sm ring-1 ring-border">
      {nav.map((n) => {
        const active =
          n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
        return (
          <Link
            key={n.href}
            href={
              n.periodic && period
                ? `${n.href}?period=${encodeURIComponent(period)}`
                : n.href
            }
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground",
              active &&
                "bg-linear-to-br from-violet-500 to-indigo-500 text-white shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_8px_24px_-8px_rgb(139_92_246/0.7)] hover:text-white"
            )}
          >
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}
