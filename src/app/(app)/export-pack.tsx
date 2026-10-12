import { buttonVariants } from "@/components/ui/button"

/** Plain GET form: downloads the analysis pack, optionally with invoice lines. */
export function ExportPack() {
  return (
    <form
      action="/api/export/analysis-pack"
      method="get"
      className="flex items-center gap-3 text-xs text-muted-foreground"
    >
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          name="lines"
          value="1"
          className="size-3.5 accent-violet-500"
        />
        include invoice lines (CSV)
      </label>
      <button
        type="submit"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Export analysis pack
      </button>
    </form>
  )
}
