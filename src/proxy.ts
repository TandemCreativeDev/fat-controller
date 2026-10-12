import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

// Optimistic redirect for signed-out visitors. Real checks happen in requireDirector().
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|sign-in|_next/static|_next/image|favicon.ico).*)"],
}
