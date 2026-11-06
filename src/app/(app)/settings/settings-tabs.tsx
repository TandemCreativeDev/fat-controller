"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const TABS = [
  { href: "/settings", label: "Connections" },
  { href: "/settings/rules", label: "Rules" },
  { href: "/settings/projects", label: "Projects" },
  { href: "/settings/people", label: "People" },
  { href: "/settings/accounts", label: "Accounts" },
  { href: "/settings/password", label: "Password" },
]

export function SettingsTabs() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-wrap gap-1 rounded-xl bg-black/30 p-1 text-sm ring-1 ring-violet-500/60"
    >
      {TABS.map((t) => {
        const active =
          t.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground",
              active &&
                "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/50"
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
