import { redirect } from "next/navigation"

/** The forecast is the landing page. */
export default function HomePage() {
  redirect("/forecast")
}
