import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireDirector } from "@/lib/session"
import { PasswordForm } from "../password-form"

export default async function PasswordPage() {
  await requireDirector()
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent>
        <PasswordForm />
      </CardContent>
    </Card>
  )
}
