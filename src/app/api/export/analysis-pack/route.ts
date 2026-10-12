import { buildAnalysisPack } from "@/lib/analysis-pack"
import { getAnalysisPackInput } from "@/lib/analysis-pack-store"
import { getDirector } from "@/lib/session"

// Downloads the Markdown analysis pack. `?lines=1` adds the invoice-line CSV appendix.
export async function GET(request: Request) {
  if (!(await getDirector())) {
    return Response.json({ error: "unauthorised" }, { status: 401 })
  }
  const includeLines = new URL(request.url).searchParams.get("lines") === "1"
  const pack = buildAnalysisPack(await getAnalysisPackInput(includeLines))
  const today = new Date().toISOString().slice(0, 10)
  return new Response(pack, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="analysis-pack-${today}.md"`,
      "Cache-Control": "no-store",
    },
  })
}
