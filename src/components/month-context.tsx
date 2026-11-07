"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"

import { formatMonthShort } from "@/lib/format"
import { cn } from "@/lib/utils"

type MonthState = {
  months: string[]
  selected: string
  select: (month: string) => void
}

const MonthContext = createContext<MonthState | null>(null)

/** The month in view on mobile, or null outside a month view. */
export const useMonth = () => useContext(MonthContext)

/** Holds the selected month, kept in the URL as ?month=2026-11. */
export function MonthProvider({
  months,
  initial,
  children,
}: {
  months: string[]
  /** From the URL: 2026-11. */
  initial: string | undefined
  children: React.ReactNode
}) {
  const wanted = initial ? `${initial}-01` : ""
  const [selected, setSelected] = useState(
    months.includes(wanted) ? wanted : months[0]
  )
  const select = useCallback((month: string) => {
    setSelected(month)
    const url = new URL(window.location.href)
    url.searchParams.set("month", month.slice(0, 7))
    url.hash = ""
    window.history.replaceState(null, "", url)
  }, [])
  return (
    <MonthContext.Provider value={{ months, selected, select }}>
      {children}
    </MonthContext.Provider>
  )
}

/** The sticky month control. Only on mobile: desktop shows every month side by side. */
export function MonthSwitcher({ className }: { className?: string }) {
  const state = useMonth()
  if (!state) return null
  return (
    <div
      role="group"
      aria-label="Month"
      className={cn(
        "sticky top-12 z-20 -mx-4 grid auto-cols-fr grid-flow-col gap-1 bg-background/95 px-4 py-1 backdrop-blur-md md:hidden",
        className
      )}
    >
      {state.months.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={state.selected === m}
          onClick={() => state.select(m)}
          className={cn(
            "min-h-11 rounded-lg text-sm font-medium text-muted-foreground ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            state.selected === m &&
              "bg-violet-500/20 text-violet-100 ring-violet-400/50"
          )}
        >
          {formatMonthShort(m)}
        </button>
      ))}
    </div>
  )
}

/** One month's content: on mobile it shows only while selected. */
export function MonthPane({
  month,
  className,
  children,
}: {
  month: string
  className?: string
  children: React.ReactNode
}) {
  const state = useMonth()
  return (
    <div
      className={cn(
        "min-w-0",
        state && state.selected !== month && "max-md:hidden",
        className
      )}
    >
      {children}
    </div>
  )
}

const SWIPE_DISTANCE = 60

/** Swiping left or right changes month. Anything that scrolls sideways opts out. */
export function MonthSwipe({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const state = useMonth()
  const start = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      className={className}
      onTouchStart={(e) => {
        const target = e.target as Element
        start.current = target.closest("[data-no-swipe]")
          ? null
          : { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        const from = start.current
        start.current = null
        if (!from || !state) return
        const dx = e.changedTouches[0].clientX - from.x
        const dy = e.changedTouches[0].clientY - from.y
        if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy))
          return
        const next =
          state.months[state.months.indexOf(state.selected) + (dx < 0 ? 1 : -1)]
        if (next) state.select(next)
      }}
    >
      {children}
    </div>
  )
}
