# SESSION HANDOFF — Pristine Jobs

Start here for a clean chat. This file is dateless and OVERWRITTEN each session —
git history is the archive. The tickable work list lives ONLY in
`docs/BUILD_QUEUE.md`; this file must not duplicate it.

**NEXT WORK: Tier 1 item 1 — lead notification wiring** (see BUILD_QUEUE.md).
Joe pastes the brief. It is investigate-first (8 questions, STOP, wait for OK),
then a small change, then 5 staging acceptance tests, then prod. Follow the
steps exactly; do not jump ahead.

## Working method

- **Advisory Claude**: plans, decides, keeps the queue, writes briefs. No app code.
- **Claude Code in VS Code**: writes code, runs migrations, reads/writes live +
  staging DBs.
- **Joe** is the bridge — pastes briefs across, relays results, merges PRs.
- Joe is non-technical. Plain English, define jargon, one clear recommendation.
  Honest over agreeable.

## Rules that hold every time

1. **Investigate before building** — the feature usually part-exists; the real
   work is wiring/surfacing. Lead every plan with the investigation result.
2. **Never trust `scripts/*.sql`** — drifted from live. Query the live DB.
3. **"Build passes" ≠ works.** Acceptance results with real values, not "done".
   `npx tsc --noEmit` explicitly (Vercel ignores type errors; baseline is 19
   pre-existing errors — duplicate @supabase/supabase-js + one EmailOtpType).
   `npm run lint` is broken (no ESLint). No test framework — verify live.
4. **Staging first, always**: staging (Tokyo `yrpkfxmthregprsfkxaf`) → Joe's OK →
   prod (Mumbai `tblvlffqanqpqhcagcrk`). Schema before code.
5. **Fail loudly, never silently** — the double-billing bugs were silent fallbacks.
6. **Don't over-build.** Push the simpler version; validate before building.
7. **Read-only-confirm before any write to real customer data** (caught the
   orphan-property problem in the 22 July delete).
8. **DB connection strings go into the Claude Code window, never chat.** Check the
   project ref matches the intended environment. Passwords come from Joe each
   session — never stored.
9. Commit/push only on Joe's explicit OK; `git add → commit → push` together.

## Standing decisions / boundaries

- Xero only via Make.com; the app never calls Xero directly. Emails queue through
  Make, never sent from the app.
- Google Calendar stays the scheduling truth — no in-app calendar rebuild.
- New signals are **badges on their own pages**, never `admin_actions` rows.
- Manual card advancement only — no auto-advance on customer replies.
- Voice-to-quote stays a **separate app** exposing an API; Pristine Jobs is the
  system of record and owns the single Xero relationship. Don't merge codebases.
- Billing vocabulary is `charge_up` / `subscription` / `non_billable`. Any doc
  saying "time_and_materials / fixed_price / quoted" is stale and wrong.

## Where things stand

- **PRs #32 (photo-gate), #33 (walk-around report), #34 (housekeeping docs) are
  ALL MERGED and live** (22 July). Migration 060 (`job_photos.severity`) is
  applied to both staging and prod. All rental properties are tagged.
- In walk-around queries, **severity NON-NULL distinguishes walk-around issues
  from generic crew-tagged "Issue" photos** — keep that filter.
- Prod pipeline cleanup done (22 July): test leads "dave"/"John" plus dave's
  test property, billing line, and quote draft deleted, post-checked to zero.
- `docs/LEAD_CAPTURE_SPEC.md` is DRAFT — Tier 2. Its first decision is WHICH REPO
  (⚠️ flag in its reuse map: 4 of 5 reuse files live in the GenQuote repo).
- Still pending a real-phone sanity check: complete one real rental visit with an
  issue; confirm the property badge appears.

## Key findings from the 23 July audit

- **The lead-notification leak (= Tier 1 item 1):** `sendLeadNotificationToJoe`
  (→ Make.com → email) exists and works, but fires only from admin-enquiries and
  estimates-calendar. It does NOT fire from the public website webhook
  (`app/api/public/sales-leads/route.ts`) or the VA's manual Add-lead form
  (`createManualLead` in `sales-pipeline/actions.ts`). Website and VA leads
  notify nobody. Mechanism built; wired to the wrong taps. Known also: the
  webhook URL is a `NEXT_PUBLIC_*` var (bundle-exposed — separate queued item,
  do NOT fix inside the Tier 1 brief) and the recipient address is hardcoded in
  `lib/lead-notifications.ts`.
- **The VA actions board:** the 200+ rows are auto-generated, not typed. Six
  pages call `ensureWorkflowAdminActions` on load (communications,
  internal-notes, labour-reconciliation, invoices, quotes, admin/page). Deleting
  rows without cutting the generators just regrows them. Migration 056 is the
  pattern (it did this for labour-recon exceptions).

## Decided: staging email evidence for the Tier 1 acceptance tests

Staging's Make webhook URLs are deliberately blanked so it can never email a
customer. For the notification tests, **use webhook.site**: set
`NEXT_PUBLIC_LEAD_NOTIFICATION_WEBHOOK_URL` on staging to a webhook.site URL for
the test run, capture the payload as the "email arrived" evidence, then blank it
again. Do NOT point staging at the real Make webhook. Leaving the URL blanked is
the missing-config test; a 404 URL is the failure test.

## Access / tooling (this machine)

- psql at `/opt/homebrew/opt/libpq/bin/psql`.
- Run app against staging: `set -a; source .env.staging; set +a && npm run dev`.
- Live UI verification pattern (proven twice): temp auth user via admin API +
  `profiles` row + `staff_members` row (`auth_user_id` link) +
  `scheduled_job_staff` assignment; forged `sb-<ref>-auth-token` cookie
  (`base64-` + base64url(session JSON)); headless Chrome via puppeteer-core
  installed in the session scratchpad, system Chrome at
  `/Applications/Google Chrome.app/...`. ALWAYS self-clean: temp users, rows,
  storage objects; restore statuses/flags.
- **Crew-flow testing landmine:** `job_labour_entries` RLS is "own rows or
  admin" — a temp crew user completing a visit whose primary worker is another
  staff member fails at the labour insert (42501). Set the test job's
  `assigned_staff_id` to the temp staff member first. (The same landmine affects
  REAL multi-person completions — tracked in BUILD_QUEUE Tier 2.)

## Non-build track (don't let the build crowd this out)

Joe has a verified list of 7 Auckland property-manager targets with named
decision-makers and emails, plus outreach templates in his voice. Two live
differentiators to pitch: enforced photo proof on rental visits, and the
walk-around issue report. **Decided: Joe makes the PM follow-up calls himself**
— founder work; routine comms go to the VA after onboarding. A reply from one
property manager teaches more than another feature. Push toward outreach at
natural stopping points.
