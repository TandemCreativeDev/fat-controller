/**
 * Keep the top `max - 1` entities by total, fold the rest into "Other".
 * Order of the kept ones is by key (stable colour per entity), not by rank.
 */
export function topWithOther<
  T extends { key: string; label: string; total: number },
>(items: T[], max = 5): { kept: T[]; other: T[] } {
  if (items.length <= max) return { kept: [...items].sort(byKey), other: [] }
  const ranked = [...items].sort((a, b) => b.total - a.total)
  return {
    kept: ranked.slice(0, max - 1).sort(byKey),
    other: ranked.slice(max - 1),
  }
}
const byKey = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label)
