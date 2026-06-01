import { createServerClient } from "@supabase/ssr"
import { createClient as createRequestClient } from "@/lib/supabase/server"

export async function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return createRequestClient()
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    }
  )
}
