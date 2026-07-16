import { type EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Server-side handler for Supabase email links (magic link, password
// recovery, invites). The email templates must link here with
// ?token_hash={{ .TokenHash }}&type=<type> — token_hash is verifiable
// server-side, unlike the default implicit-flow links whose tokens arrive in
// a URL hash fragment the server never sees.
const ALLOWED_TYPES: EmailOtpType[] = [
  "magiclink",
  "recovery",
  "invite",
  "signup",
  "email",
  "email_change",
]

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  if (!tokenHash || !type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  })

  if (error) {
    console.error("[auth/confirm] verifyOtp failed", {
      type,
      message: error.message,
    })
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  // Recovery links continue to the set-a-new-password page; everything else
  // lands in the app.
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/update-password`)
  }

  return NextResponse.redirect(`${origin}/jobs`)
}
