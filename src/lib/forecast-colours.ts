import type { TimelineCategory } from "@/lib/forecast"

/**
 * Every colour the Forecast uses for a client, person or category, so each means the
 * same thing on every tab. Client and contractor colours come from a fixed order
 * rather than from names, because no one's name belongs in this public repo.
 */
const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export const SERIES_SLOTS = SERIES.length

/** Anything without its own colour, such as "Other clients". */
export const NEUTRAL_COLOUR = "var(--muted-foreground)"

export const seriesColour = (slot: number | null | undefined): string =>
  slot === null || slot === undefined
    ? NEUTRAL_COLOUR
    : (SERIES[slot] ?? NEUTRAL_COLOUR)

export const CATEGORY_COLOUR: Record<TimelineCategory, string> = {
  money_in: "var(--chart-2)",
  contractors: "var(--chart-1)",
  set_asides: "var(--chart-4)",
  running: "var(--chart-3)",
  directors: "var(--success-mark)",
  other: NEUTRAL_COLOUR,
}
