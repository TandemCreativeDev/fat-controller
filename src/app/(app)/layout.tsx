import Link from "next/link"

import { requireDirector } from "@/lib/session"
import { BottomNav, NavLinks } from "./nav-links"
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
        <div className="mx-auto flex h-12 max-w-screen-2xl items-center gap-6 px-4 md:h-16 md:px-6">
          <Link
            href="/"
            className="flex items-center font-heading text-[15px] font-semibold tracking-tight max-md:min-h-11"
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
      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-6 md:pt-10 md:pb-16">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
