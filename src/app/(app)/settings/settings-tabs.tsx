"use client"

import { usePathname } from "next/navigation"

import { SectionTabs } from "@/components/section-tabs"

const TABS = [
  { key: "/settings", href: "/settings", label: "Connections" },
  { key: "/settings/rules", href: "/settings/rules", label: "Rules" },
  { key: "/settings/projects", href: "/settings/projects", label: "Projects" },
  { key: "/settings/people", href: "/settings/people", label: "People" },
  { key: "/settings/accounts", href: "/settings/accounts", label: "Accounts" },
  { key: "/settings/password", href: "/settings/password", label: "Password" },
]

export function SettingsTabs() {
  const pathname = usePathname()
  const active =
    TABS.find((t) => t.key !== "/settings" && pathname.startsWith(t.key))
      ?.key ?? "/settings"
  return <SectionTabs label="Settings sections" tabs={TABS} active={active} />
}
