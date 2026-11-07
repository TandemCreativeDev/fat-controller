"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(max-width: 767.98px)"

const subscribe = (change: () => void) => {
  const list = window.matchMedia(QUERY)
  list.addEventListener("change", change)
  return () => list.removeEventListener("change", change)
}

/** True below the mobile breakpoint. False while rendering on the server. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
