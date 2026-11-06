/** A titled block of fields inside a settings form. */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border/70 p-4">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  )
}
