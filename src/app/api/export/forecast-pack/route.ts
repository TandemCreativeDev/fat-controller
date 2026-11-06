import { buildForecastPack } from "@/lib/forecast-pack"
import { getForecastPackInput } from "@/lib/forecast-store"
import { getDirector } from "@/lib/session"

// Downloads the forecast as Markdown, to discuss with an LLM.
export async function GET() {
  if (!(await getDirector())) {
    return Response.json({ error: "unauthorised" }, { status: 401 })
  }
  const input = await getForecastPackInput()
  if (!input) {
    return Response.json(
      { error: "The forecast isn't set up yet" },
      { status: 409 }
    )
  }
  return new Response(buildForecastPack(input), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="forecast-${input.result.today}.md"`,
      "Cache-Control": "no-store",
    },
  })
}
