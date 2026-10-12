/** Page title with the gradient heading and an optional right-hand note. */
export function PageHeader({
  title,
  lede,
  note,
  actions,
}: {
  title: string
  lede?: string
  note?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <h1 className="text-gradient font-heading text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          {title}
        </h1>
        {lede && <p className="mt-1.5 text-muted-foreground">{lede}</p>}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        {actions}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  )
}
