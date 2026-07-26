# SESSION HANDOFF — Pristine Jobs

Start here for a clean chat. This file is dateless and OVERWRITTEN each session —
git history is the archive. The tickable work list lives ONLY in
`docs/BUILD_QUEUE.md`; this file must not duplicate it.

**NEXT WORK: Tier 1 item 3 (capture → VA action board + VA notify)** — scoped
and prerequisites cleared: new `source_record_type: "capture"` approved, DB
dedupe index confirmed (survived the clear-out), notification pipe proven
end-to-end. Waiting on: `VA_NOTIFICATION_EMAIL=` in `.env.local` (Joe pastes),
then the Zoho To field mapped to `{{1.to_email}}` (currently hard-typed as
Joe's address). Also pending: the one-line comms-reply env fix (see "Still
broken").

## Working method

- **Advisory Claude**: plans, decides, keeps the queue, writes briefs. No app code.
- **Claude Code in VS Code**: writes code, runs migrations, reads/writes live +
  staging DBs, holds Vercel CLI access (authed as joenaughtonmusic-debug).
- **Joe** is the bridge — pastes briefs, relays results, merges PRs, uploads
  WordPress plugin zips via wp-admin, works the host control panel.
- Joe is non-technical. Plain English, define jargon, one clear recommendation.
  Honest over agreeable.

## Rules that hold every time

1. **Anything that leaves the app — email, webhook, Xero — gets ONE live prod
   fire before it goes in SHIPPED, and the fire must be confirmed at the FAR
   END (the inbox, Make's History tab), never by a 200 from the webhook.**
   Earned twice on 26 July: (a) the lead notifier was audited as "exists and
   works" while its env var was never set in Vercel — it had never once worked
   in production; (b) even after that fix, "notification succeeded" was still
   false — **Make returns 200 and queues silently when a scenario is
   INACTIVE**, so app logs showed success while nothing was delivered (and
   once activated, the Zoho module had no field mappings and sent blank
   emails). The first genuinely end-to-end lead notification arrived 26 July
   evening.
2. **Investigate before building** — the feature usually part-exists.
3. **Never trust `scripts/*.sql`** — drifted from live. Query the live DB.
4. **"Build passes" ≠ works.** Acceptance results with real values. `npx tsc
   --noEmit` explicitly (Vercel ignores type errors; baseline 19 pre-existing).
   `npm run lint` broken. No test framework — verify live.
5. **Staging first** (Tokyo `yrpkfxmthregprsfkxaf`) → Joe's OK → prod (Mumbai
   `tblvlffqanqpqhcagcrk`). Schema before code.
6. **Fail loudly, never silently** — and LOG every rejection with a reason
   (the WP form dropped customer enquiries silently for weeks; never again).
7. **Read-only-confirm before any write to real customer data.** The concrete
   example this rule exists for: a routine mid-July test-row cleanup on the
   `communications` table got it exactly backwards — it KEPT the 2 test rows
   and DELETED the ~100 real customer emails (discovered 26 July; the only
   in-app remnants are excerpts on 103 dismissed admin_actions rows; the
   source emails survive in the Zoho inbox). Look at what you're about to
   delete, show it, and wait.
8. **DB connection strings into the Claude Code window, never chat.** Passwords
   from Joe each session. Vercel env values: the dashboard is canonical.
9. Commit/push only on Joe's explicit OK; `git add → commit → push` together.
10. **State a hypothesis's falsifier before acting on it.** Two wrong cache
    theories were burned 26 July before the controlled experiment settled it.

## Standing decisions / boundaries

- Xero only via Make.com. Emails queue through Make (or WP wp_mail), never the app.
- Google Calendar stays scheduling truth. Signals are badges, never admin_actions
  rows. Manual card advancement only. Voice-to-quote stays a separate app.
- Billing vocabulary: `charge_up` / `subscription` / `non_billable` only.

## What shipped this session (26 July) — all verified live in prod

- **Tier 1 item 1 — lead notification wiring (PR #36, merged, deployed):**
  `sendLeadNotificationToJoe` now fires from all three lead-creation paths
  (website webhook, VA manual add, existing-customer add), after-insert,
  never able to fail the lead save, failures logged as one greppable line
  `LEAD_NOTIFY_FAILED lead=<id> source=<source> error=<msg>` in Vercel logs.
  Staging: 6/6 acceptance tests. Prod: proven with real submissions — leads
  landed, notifications fired, emails arrived in Joe's gmail.
- **The website enquiry chain works end-to-end for the first time ever.**
  Prod's first-ever `website`-source leads landed 26 July.

## The three findings (26 July) and their states

1. **`NEXT_PUBLIC_LEAD_NOTIFICATION_WEBHOOK_URL` was never set in Vercel —
   FIXED.** Lead notifications had NEVER worked in prod from ANY call site
   (including the two pre-existing ones); every call threw "not configured".
   Var added to Production, redeployed, verified live twice (admin-enquiries
   and website paths).
2. **WordPress form front door — FIXED (plugin 0.21.2, live).** The nginx page
   cache served >24h-old HTML whose WP nonce always failed → every customer
   got "Security check failed", dropped with no log. Proven by controlled
   experiment (cached nonce fails, cache-busted fresh nonce passes seconds
   apart). Fix: nonce gate removed from the public form (it remains on the
   wp-admin meta boxes, correctly), replaced with hidden honeypot
   (`pgv2_ref_code`) + per-IP rate limit (5/hr) + every rejection logged
   `[pgv2] enquiry rejected reason=…`; `nocache_headers()` on contact pages;
   Joe also excluded /contact/ + /contact-us/ from the host cache. Verified:
   Joe's incognito phone submissions landed as pipeline leads with emails.
   Theme repo (~/Desktop/pristine-wordpress-theme, git) is the deployment
   record; Desktop zips stopped being reliable at 0.20.22 (9 July). Rollback
   artifact: `pristine-home-v2-mockup-v4-0.21.1.zip` on Joe's Desktop
   (source-built, assumed-match-live, unverified).
3. **Secret drift — OPEN (accepted).** `SALES_LEADS_WEBHOOK_SECRET` in Joe's
   local `.env.local` does NOT match the canonical Vercel prod value (set 11d
   before discovery). WordPress's wp-config has the CORRECT value (proven by
   live submissions). Local file still stale — sync from the Vercel dashboard
   if local testing against the prod endpoint is ever needed.

## Still broken — next up (one line)

**`NEXT_PUBLIC_SEND_COMMUNICATION_REPLY_WEBHOOK_URL` is absent from Vercel in
every environment** → the VA's comms-hub Send Reply has NEVER worked in prod
(fails honestly: "Reply webhook URL is not configured."). Fix = add the var
(value in Joe's `.env.local`) + redeploy + ONE live prod fire per rule 1.

## Access / tooling (this machine)

- psql at `/opt/homebrew/opt/libpq/bin/psql`; php at `/opt/homebrew/bin/php`
  (used for `php -l` on plugin builds).
- Vercel CLI via `npx vercel` — authed; project linked (`.vercel/`, gitignored).
  Runtime log retention is hours — never promise 30-day history.
- Staging run: `set -a; source .env.staging; set +a && npm run dev`.
- Live UI verification: temp auth user + profiles row (NOTE: prod has a signup
  trigger that auto-creates profiles as 'staff' — PATCH to admin, don't
  insert) + forged `sb-<ref>-auth-token` cookie + puppeteer-core in the
  session scratchpad. Set the cookie domain to the real host. ALWAYS self-clean.
- Crew-flow RLS landmine: `job_labour_entries` is "own rows or admin" — set the
  test job's `assigned_staff_id` to the temp staff member.
- Prod app URL: **https://v0-landscaping-job-app.vercel.app** (Vercel project
  `pristine-jobs-app`; team-scoped `*-joes-projects-*` aliases are SSO-walled,
  the primary domain is open). WP form → same-page POST (theme plugin
  `pristine-home-v2-mockup-v4`, source in ~/Desktop/pristine-wordpress-theme).

## Pending cleanup

None — all test rows and temp users from 26 July verified deleted (prod holds
zero example.com auth users, zero ZZTEST/Diagnostic leads). Test emails in
Joe's inboxes are his to delete.

## Non-build track

7 verified Auckland PM targets with named decision-makers + outreach templates.
Live differentiators: photo-proof on rental visits, walk-around report — and
now a working website lead funnel. Joe makes the PM calls himself. A reply from
one PM teaches more than another feature.
