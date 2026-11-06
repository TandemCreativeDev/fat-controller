import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function Field({
  label,
  hint,
  className,
  ...input
}: { label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={input.id ?? input.name}>{label}</Label>
      <Input id={input.id ?? input.name} {...input} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SelectField({
  label,
  hint,
  options,
  className,
  ...select
}: {
  label: string
  hint?: string
  options: { value: string; label: string }[]
} & React.ComponentProps<"select">) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={select.id ?? select.name}>{label}</Label>
      <select
        id={select.id ?? select.name}
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-popover">
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
