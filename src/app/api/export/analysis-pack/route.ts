import { buildAnalysisPack } from "@/lib/analysis-pack"
import { getAnalysisPackInput } from "@/lib/analysis-pack-store"
import { getPeriod } from "@/lib/period-store"
import { getDirector } from "@/lib/session"

// Downloads the Markdown analysis pack for `?period=` (default lifetime).
// `?lines=1` adds the invoice-line CSV appendix.
export async function GET(request: Request) {
  if (!(await getDirector())) {
    return Response.json({ error: "unauthorised" }, { status: 401 })
  }
  const params = new URL(request.url).searchParams
  const period = await getPeriod(params.get("period"))
  const includeLines = params.get("lines") === "1"
  const pack = buildAnalysisPack(
    await getAnalysisPackInput(period, includeLines)
  )
  const today = new Date().toISOString().slice(0, 10)
  return new Response(pack, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="analysis-pack-${period.key}-${today}.md"`,
      "Cache-Control": "no-store",
    },
  })
}
