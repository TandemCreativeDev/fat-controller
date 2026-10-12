import Link from "next/link"

import { requireDirector } from "@/lib/session"
import { SignOutButton } from "./sign-out-button"

const nav = [
  { href: "/", label: "P&L" },
  { href: "/settings", label: "Settings" },
]

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const director = await requireDirector()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="font-heading font-medium">
            fat-controller
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <span>{director.name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
    </div>
  )
}
