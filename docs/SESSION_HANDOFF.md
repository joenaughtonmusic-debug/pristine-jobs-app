# SESSION HANDOFF — Pristine Jobs

Start here for a clean chat. This file is dateless and OVERWRITTEN each session —
git history is the archive. The tickable work list lives ONLY in
`docs/BUILD_QUEUE.md`; this file must not duplicate it.

**NEXT WORK: piece 3 of the PM issue-report feature** — the walk-around
resolve/dismiss lifecycle + `reported_to_pm_at` stamp. Decisions are locked (see
below). Pieces 2 and 2b are DONE: engine merged (#46), 064 applied to prod, the
Make scenario is live (built-in Email/SMTP module — the Zoho Mail module has no
attachments field), `PM_REPORT_WEBHOOK_URL` is in Vercel Production, and BOTH
live-fires were confirmed at the inbox (staging engine → Make → PDF opened;
prod through the deployed Vercel route → PDF opened, photos render). The 2b
review/send UI is built + staging-live-verified, awaiting merge as **PR #48**.

## Working method
- **Advisory Claude** (chat): plans, decides, keeps the queue, writes briefs.
- **Claude Code in VS Code**: writes code, runs migrations, reads/writes live +
  staging DBs, holds Vercel CLI access. This machine has direct psql to both DBs.
- **Joe** is the bridge: pastes briefs, relays results, merges PRs, sets up
  Make scenarios, uploads WP zips, works the host panel. Non-technical — plain
  English, one clear recommendation, honest over agreeable.

## Rules that hold every time
1. **Anything that leaves the app — email, webhook, Xero — gets ONE live fire,
   confirmed at the FAR END** (the inbox / Make History), never a 200 from the
   webhook. Make returns 200 and queues silently even when a scenario is
   inactive or unmapped.
2. **"Build passes" / "typecheck passes" ≠ works. AND your test harness can be
   the thing that's wrong.** Twice this session a verification method gave a
   false result: (a) an acceptance harness used `Prefer: return=representation`
   (INSERT…RETURNING, which also checks the SELECT/USING policy) while the app
   uses `return=minimal` — it falsely condemned a correct RLS fix and nearly
   sent us to build an unneeded RPC; (b) a UI check ran against a stale `.next`
   cache. Make the harness match the app's ACTUAL request (verb, `Prefer`,
   auth role, RLS context). See `docs/HANDOFF_for_VS_Code_Claude.md` rule 2a.
3. **When testing RLS as a staff role in psql, `postgres` has BYPASSRLS.** Use
   `SET ROLE authenticated` AND assert `row_security_active('<table>')` is true,
   or the test silently bypasses the policy you're checking.
4. **Never trust `scripts/*.sql` as state** — it's intent. Query the live DB.
5. **Staging first** (Tokyo `yrpkfxmthregprsfkxaf`) → Joe's OK → prod (Mumbai
   `tblvlffqanqpqhcagcrk`). Schema before code. Apply scripts live in `scripts/`.
6. **Fail loudly, never silently.** Prefer a recorded `failed` row / a stop over
   a fake success. Reconciliation BACKFILLS that silently fix missing rows MASK
   upstream bugs — surface, don't just correct (learned from the labour RLS bug).
7. **Read-only-confirm before writing to real customer data.** Self-clean any
   prod/staging test rows, users, and storage objects.
8. **DB passwords come from Joe each session, into the Claude Code window, never
   chat, never committed.** The PROD password was rotated this session — the old
   string is dead; get the current one from Joe. (Staging pooler string was
   still valid at session end.)
9. **Commit/push only on Joe's OK; never to main directly** — branch + PR, Joe
   merges. `git add → commit → push` together.
10. **Dual lockfile is live** (package-lock.json + pnpm-lock.yaml). Adding a dep
    must update BOTH or the Vercel build can fail (Vercel likely uses pnpm). Use
    `npm install <dep>` then `npx pnpm install --lockfile-only`.

## Standing decisions / boundaries
- Xero only via Make.com. Emails/PDFs leave via Make, never the app directly.
- Google Calendar stays scheduling truth. Billing vocabulary: `charge_up` /
  `subscription` / `non_billable` only.
- Labour COST = the `staff_cost_rates` table (single source of truth; the
  profitability view already joins it). Never hardcode per-name rates again.
- Walk-around issue = a `job_photos` row, `photo_type='issue'` + `severity`
  (urgent/soon/cosmetic). The public `job-photos` bucket means issue photos sit
  on capability URLs (UUID-gated, not enumerable, but permanent+unauth once a
  URL is known). Generated PM report PDFs therefore go in a PRIVATE bucket with
  a short-lived signed URL for Make to fetch.

## What shipped this session (all live-verified where noted)
- **Comms Hub binned** (PR #41): pages, lanes, dashboard card, classification
  lib removed; `communications` table kept as a frozen archive.
- **Labour RLS bug fixed** (PR #42, migration 062, prod-applied + prod
  live-fired): `job_labour_entries` split into per-command policies; SELECT +
  INSERT widened to job members, UPDATE/DELETE stay own-or-admin. Fixes crew
  completing paired visits + a silent under-show on `jobs/[id]`.
- **Cost Capture** (PR #44): labour cost now from `staff_cost_rates` (drift
  fixed — Fletcher was $43 vs $38, James $39 vs $44); the fabricating "Backfill
  Missing Labour" button removed (it had created zero prod rows).
- **PM contact table** (PR #45, migration 063, prod-applied): shared
  `property_managers` (one PM → many properties), assigned from the property
  dialog on rentals. Joe is entering PMs now.
- **PM report engine** (PR #46, MERGED): `@react-pdf/renderer` PDF (address,
  visit date, our name, each issue photo+note — NO ids/jargon/severity words),
  stored in a private `pm-reports` bucket, signed URL → Make; `pm_reports`
  record; admin API route. Make hop + Vercel runtime both live-fired and
  confirmed at the inbox.
- **PM report review/send UI, piece 2b** (PR #48, OPEN): `/admin/pm-reports` —
  To send queue + Sent section, per-issue editable notes (job_photos.caption;
  engine reads fresh at send = the review step), two-step confirm send, re-send
  warning, no-PM-email warning, failed sends surfaced. Signed URL TTL 7d → 4h.
  Staging-live-verified incl. admin caption-edit RLS through the real UI.
- **Docs** (PR #43): retry-lockout scoping + Cost Capture audit.

## Prod migration state
Applied to prod: **062** (labour RLS), **063** (property_managers), **064**
(pm_reports + private bucket — applied 27 July, post-checks passed).

## Open PRs
- **#48** — PM report review/send UI (piece 2b). Fully verified; just needs
  Joe's merge. Also carries the 4h signed-URL TTL and this docs refresh.

## Locked decisions for the upcoming pieces
- **Walk-around resolve/dismiss lifecycle (piece 3 / Tier 3):** four states
  `open` / `resolved` / `dismissed` / `not_our_job`; the property badge counts
  `open` only; status is set from the property dialog only; add
  `reported_to_pm_at` as a STAMP (not a state), set when a PM report sends.
  Zero issues exist in prod today — greenfield, no backfill. Add columns to
  `job_photos` (issue_status default 'open' + CHECK, issue_status_at/by/note).
- **PM report:** review-before-send (crew free-text goes to a client); no
  issues → send nothing; report must read for someone who's never seen the app.

## Parked (deliberately)
- **Retry-lockout transactional RPC** — scoped in `docs/RETRY_LOCKOUT_SCOPING.md`.
  Do NOT build until a real crew pair completes a paired visit through the app
  and proves migration 062 works in the wild. Separate from the RLS fix: a
  partial-write strand from any non-RLS error still trips "already completed" →
  the job silently never invoices.
- **Quote conversions per month** — revisit ~Oct 2026 (3+ months of data). Key
  reports off `proposal_sent_at`, NEVER `status` (see BUILD_QUEUE).

## Access / tooling (this machine)
- psql at `/opt/homebrew/opt/libpq/bin/psql`. Prod ref `tblvlffqanqpqhcagcrk`
  (Mumbai, aws-1-ap-south-1 pooler); staging ref `yrpkfxmthregprsfkxaf` (Tokyo,
  aws-0-ap-northeast-1 pooler). Session-pooler strings + passwords from Joe.
- Run TS/JSX scripts with `npx tsx <file>` (resolves the `@/` alias via
  tsconfig). `@react-pdf/renderer` is now a dependency.
- Staging run: `set -a; source .env.staging; set +a && npm run dev` (staging
  Make webhooks are blanked — it can never email a customer).
- Live UI verification: temp auth user + `profiles` row (prod signup trigger
  auto-creates profiles as 'staff' — PATCH to admin, don't insert) + forged
  `sb-<ref>-auth-token` cookie + puppeteer-core (Chrome at the standard mac
  path). ALWAYS self-clean. New tables need `NOTIFY pgrst,'reload schema'` (the
  apply scripts do this) to appear in the REST API.
- Prod app URL: **https://v0-landscaping-job-app.vercel.app**.
