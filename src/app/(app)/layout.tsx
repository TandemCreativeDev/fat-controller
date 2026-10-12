import Link from "next/link"

import { requireDirector } from "@/lib/session"
import { NavLinks } from "./nav-links"
import { SignOutButton } from "./sign-out-button"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const director = await requireDirector()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <Link
            href="/"
            className="font-heading text-[15px] font-semibold tracking-tight"
          >
            <span className="text-gradient-accent">fat-controller</span>
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{director.name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-10 pb-16">
        {children}
      </main>
    </div>
  )
}
