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

  // Force the service-role key onto every REST request. createServerClient does
  // NOT reliably apply the key as the Authorization bearer (with empty cookies it
  // left the insert authenticating as anon → RLS → 42501). Setting global headers
  // explicitly makes PostgREST see a service_role JWT and bypass RLS.
  return createServerClient(url, serviceRoleKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {},
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  })
}

/**
 * Safe, non-secret diagnostics for SUPABASE_SERVICE_ROLE_KEY. Never returns the
 * key itself — only whether it's present, its length, its scheme, and (for a
 * JWT-style key) the decoded `role` claim. The role claim (anon | service_role)
 * is what actually determines RLS bypass, so this tells us whether the value in
 * the env var is genuinely the service-role key or the anon key by mistake.
 */
export function describeServiceKey(): {
  present: boolean
  length: number
  scheme: "jwt" | "sb_secret" | "sb_publishable" | "other" | "none"
  jwtRole: string | null
} {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return { present: false, length: 0, scheme: "none", jwtRole: null }

  let scheme: "jwt" | "sb_secret" | "sb_publishable" | "other" = "other"
  if (key.startsWith("eyJ")) scheme = "jwt"
  else if (key.startsWith("sb_secret")) scheme = "sb_secret"
  else if (key.startsWith("sb_publishable")) scheme = "sb_publishable"

  let jwtRole: string | null = null
  if (scheme === "jwt") {
    try {
      const payload = key.split(".")[1]
      const json = Buffer.from(payload, "base64").toString("utf8")
      jwtRole = (JSON.parse(json) as { role?: string }).role ?? null
    } catch {
      jwtRole = null
    }
  }

  return { present: true, length: key.length, scheme, jwtRole }
}
