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

        if (staffMember?.id === '24103117-08be-4d0d-8f5e-027ff0e5734d') {
  return NextResponse.redirect(`${origin}/labour`)
}
      }

      return NextResponse.redirect(`${origin}/jobs`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}