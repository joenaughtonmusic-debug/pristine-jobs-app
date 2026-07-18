// The ONLY place a public quote link is built. The token is the stored fact;
// the URL is derived at display/send time — never persisted. A stored
// absolute URL is wrong by construction: whatever origin was in scope at
// draft-creation time gets baked in forever, which is how a June proposal
// email went out with a localhost:3001 link.
//
// NEXT_PUBLIC_APP_URL must be set in Vercel (production) to the app's real
// domain. The window fallback is only correct when the operator is driving
// the deployed site — fine for dev previews, never for a customer send.
export function getPublicQuoteUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "")

  return `${base}/public/quote/${token}`
}
