import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: staffMember } = await supabase
          .from('staff_members')
          .select('id, name, staff_type')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (staffMember?.name?.toLowerCase().includes("fletch")) {
  return NextResponse.redirect(`${origin}/labour?debug=fletcher-hit`)
}

return NextResponse.redirect(
  `${origin}/jobs?debug=${encodeURIComponent(
    staffMember ? `${staffMember.id}-${staffMember.name}` : "no-staff"
  )}`
)
      }

      return NextResponse.redirect(`${origin}/TEST-CALLBACK`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}