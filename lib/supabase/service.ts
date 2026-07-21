import { createServerClient } from "@supabase/ssr"

/**
 * A pure service-role Supabase client for server-only, privileged operations.
 *
 * Built from SUPABASE_SERVICE_ROLE_KEY with NO cookies — no user session is ever
 * attached, so every request carries the service-role key as the Authorization
 * bearer and RLS is bypassed. (createServerClient uses its second arg as both
 * the apikey and the default bearer; with empty cookies there is no user JWT to
 * override it.)
 *
 * Unlike createAdminClient(), this NEVER falls back to a user-session client: if
 * the key is missing it throws, so a config gap surfaces as an obvious 500
 * ("service role not configured") instead of masquerading as an RLS "permission
 * denied" from the authenticated role. Only import this from server code.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set")
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in this runtime")
  }

  return createServerClient(url, serviceRoleKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {},
    },
  })
}
