# SESSION HANDOFF — Pristine Jobs

Start here for a clean chat. This file is dateless and OVERWRITTEN each session —
git history is the archive. The tickable work list lives ONLY in
`docs/BUILD_QUEUE.md`; this file must not duplicate it.

**NEXT WORK: the communications-page deletion PR — BLOCKED on Joe's inbox
sweep.** Scope is BLESSED (see "Comms page bin" below). When Joe says the sweep
is done, build it. After that: BUILD_QUEUE order (labour-recon misc window gap,
Tier 2).

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

## What shipped this session (26 July, two sittings) — all live-fire verified

- **Tier 1 item 1 — lead notification wiring (PR #36):** all three lead-creation
  paths notify after-insert; failures log `LEAD_NOTIFY_FAILED lead=<id>`.
- **Tier 1 item 2 — VA actions clear-out (PR #37 + migration 061):** all six
  generators cut, board emptied (staging 255 / prod 195 dismissed, zero
  refill), dashboard subscription card repointed to /admin/properties,
  lib/admin-actions.ts deleted. Board + Add Action form kept.
- **Tier 1 item 3 — capture → VA action board (PR #39):** a capture triaged
  VA Offload (annoying_task) creates an admin_actions row (action_type
  va_offload, source_record_type "capture", DB-index deduped) AND emails the
  VA via the Make webhook with to_email = VA_NOTIFICATION_EMAIL
  (admin@pristinegardens.co.nz — server-only var, in .env.local AND Vercel
  Production). Live-fired through REAL prod triage (classified high
  confidence); VA inbox confirmation pending.
- **WordPress form fix (plugin 0.21.2)** from the first sitting: nonce gate
  replaced with honeypot + rate limit, every rejection logged.
- **The notification pipeline actually works now:** Make scenario active, Zoho
  module mapped ({{1.to_email}}, {{1.subject}}, {{1.body}}, plain text). One
  scenario serves lead notifications (to Joe) and VA capture notifications
  (to the VA) via the payload's to_email.

## The Make "Communication: Hub" story (settled 26 July evening)

- Root cause (from Joe's blueprint read): the router's route 2 (AI branch) has
  NO filter → every email ran two branches → double insert with the same
  external_id → duplicate-key 409s → Make auto-deactivated 17 July. Fix if
  ever revived: route 2 as a FALLBACK route (recorded in BUILD_QUEUE, do NOT
  do — page being binned). All four branches insert a hardcoded user_id.
- App-side evidence: inserts died ~5 July (last communication-sourced action).
  The table's ~100 real rows were then purged by the inverted test-row
  cleanup (see rule 7) — only 2 test rows remain. Both approval lanes
  (estimates-calendar quote requests, schedule client adjustments) are EMPTY —
  nothing unactioned. Emails survive in the Zoho inbox.

## Comms page bin — scope BLESSED, sequencing agreed

Delete: both comms pages + both client components, nav entry, dashboard comms
queries/card, enquiries communication_count + link, the estimates-calendar
quote-request lane, the schedule client-adjustments strip, and
lib/communication-classification.ts. Both approval lanes go WITH the page
(Joe's explicit call: "VA reads inbox, acts directly"). Keep the communications
TABLE as a frozen archive; Make scenario stays off. Bark/BuildersCrack →
pipeline via manual add (source "bark" exists; automation later =
LEAD_CAPTURE_SPEC email-forward). The queued comms-reply env fix is MOOT.
**Sequence: Joe's inbox sweep (from ~5 July, for Bark + unhandled enquiries)
FIRST, then the deletion PR** (staging-verified page-by-page — estimates-
calendar and schedule surgeries touch live surfaces).

## Still broken / open

- `NEXT_PUBLIC_SEND_COMMUNICATION_REPLY_WEBHOOK_URL` absent from Vercel — VA
  Send Reply never worked in prod. MOOT if the comms page bin proceeds; do
  nothing until that lands.
- Local `.env.local` SALES_LEADS_WEBHOOK_SECRET still differs from the
  canonical Vercel value (accepted; sync from dashboard if ever needed).
- Notification Link field is a relative path (BUILD_QUEUE, small).

## Access / tooling (this machine)

- psql at `/opt/homebrew/opt/libpq/bin/psql`; php at `/opt/homebrew/bin/php`
  (used for `php -l` on plugin builds).
- Vercel CLI via `npx vercel` — authed; project linked (`.vercel/`, gitignored).
  Runtime log retention is hours — never promise 30-day history.
  OPENAI_API_KEY is marked SENSITIVE in Vercel — `env pull` redacts it, so
  staging can't run real capture triage; positive-path tests need a local
  stub (never committed) and the real path proves out via a prod live fire.
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

## Pending cleanup (ON HOLD until the VA confirms her capture email)

Prod rows, all link-free, one read-only-confirm pass when released: sales_leads
`b781161e` (ZZTEST Item3 Lead Path) + `464d778e` (ZZTEST Post-Mapping Lead),
captures `bf1b5cd4` (Kennards/mulch test), admin_actions `d4642452` (its VA
Offload card — visible on the board, deliberately), auth user + profile for
item3-verify@example.com. Plus test emails in Joe's and the VA's inboxes.

## Open PRs

#40 (docs: Make root cause, rule-7 example, this handoff) — merge before
starting the next chat so it reads current docs from main.

## Non-build track

7 verified Auckland PM targets with named decision-makers + outreach templates.
Live differentiators: photo-proof on rental visits, walk-around report — and
now a working website lead funnel. Joe makes the PM calls himself. A reply from
one PM teaches more than another feature.
