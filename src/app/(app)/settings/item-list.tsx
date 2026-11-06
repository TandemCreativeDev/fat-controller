"use client"

import Link from "next/link"
import { useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type ListItem = {
  id: string
  title: string
  meta: string
  /** A figure lined up down the right-hand side. */
  figure?: string
  /** Something that needs fixing, shown in words. */
  flag?: string
}

export type ListGroup = { label: string; items: ListItem[] }

/** The left-hand list of a settings page: filter it, pick a row, edit it alongside. */
export function ItemList({
  groups,
  selected,
  basePath,
  noun,
  addLabel,
}: {
  groups: ListGroup[]
  selected: string
  basePath: string
  noun: string
  addLabel: string
}) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        `${i.title} ${i.meta}`.toLowerCase().includes(q)
      ),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="flex min-h-0 flex-col gap-3 rounded-lg border border-border bg-card/60 p-3 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)]">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          aria-label={`Filter ${noun}`}
          placeholder={`Filter ${noun}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Link
          href={`${basePath}?id=new`}
          scroll={false}
          aria-current={selected === "new" ? "true" : undefined}
          className={cn(
            "shrink-0 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium whitespace-nowrap hover:bg-muted",
            selected === "new" && "border-violet-400/50 bg-violet-500/20"
          )}
        >
          {addLabel}
        </Link>
      </div>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {shown.length === 0 && (
          <p className="px-2 py-1 text-sm text-muted-foreground">
            No {noun} match that.
          </p>
        )}
        {shown.map((g) => (
          <section key={g.label} className="flex flex-col gap-1">
            <h2 className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g.label} ({g.items.length})
            </h2>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`${basePath}?id=${i.id}`}
                    scroll={false}
                    aria-current={selected === i.id ? "true" : undefined}
                    className={cn(
                      "grid grid-cols-[1fr_auto] gap-x-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60",
                      selected === i.id &&
                        "bg-violet-500/20 ring-1 ring-violet-400/50"
                    )}
                  >
                    <span className="truncate font-medium">{i.title}</span>
                    <span className="font-mono text-xs leading-5 tabular-nums">
                      {i.figure}
                    </span>
                    <span className="col-span-2 truncate text-xs text-muted-foreground">
                      {i.meta}
                    </span>
                    {i.flag && (
                      <span className="col-span-2 text-xs text-amber-400">
                        {i.flag}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
