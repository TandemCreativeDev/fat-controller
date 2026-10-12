import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDirector } from "@/lib/session"
import { SignInForm } from "./sign-in-form"

export default async function SignInPage() {
  if (await getDirector()) redirect("/")

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>fat-controller</CardTitle>
          <CardDescription>Sign in with your director account.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  )
}
