import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-medium">Monthly P&amp;L</h1>
      <Card>
        <CardHeader>
          <CardTitle>No Xero data yet</CardTitle>
          <CardDescription>
            The monthly P&amp;L appears here once Xero is connected and the
            first sync has run.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
