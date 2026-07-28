# SESSION HANDOFF — Pristine Jobs

Start here for a clean chat. This file is dateless and OVERWRITTEN each session —
git history is the archive. The tickable work list lives ONLY in
`docs/BUILD_QUEUE.md`; this file must not duplicate it.

## Where things stand
Everything built this session is MERGED and on prod (PRs #48–#57). No open PRs.
Prod migrations applied through **071**. The big threads — PM issue-report
feature, the invoice-pipe repair, and the grant-hygiene sweep — are CLOSED.
Two features shipped this session are new and worth watching in the wild:
lead-intake paste box and invoice-photo resize/feed.

## NEXT WORK (in rough priority)
1. **Invoice photo attach — Part C is Joe's, in Make.** Parts A+B shipped
   (#57, migration 071). Extend the "Pristine App to Xero Invoice" scenario
   with an attach branch at DRAFT time (`IncludeOnline=true`), reading
   `invoice_photos_for_make` per visit. **Read that view, NEVER job_photos
   directly** — the view's allowlist (`photo_type IN ('after','completion')`)
   is the only thing keeping issue-fault photos off customer invoices.
   VERIFY against the live Xero connection (don't trust recalled numbers):
   attachment count/size ceilings + that the module exposes `IncludeOnline`.
   Then the end-to-end live-fire: one real draft carrying only the
   after/completion photos, confirmed in Xero. Brief:
   `docs/INVOICE_PHOTO_ATTACH_BRIEF.md`.
2. **Lead-intake paste box is LIVE** (#56, migration 070). Joe can start using
   it on /sales-pipeline. Uses the OpenAI key already in Vercel; the key Joe
   generated this session is a spare (delete it if unwanted — prod doesn't
   need it).
3. Everything else: BUILD_QUEUE in tier order. Retry-lockout RPC stays PARKED
   (see below).

## Rules that hold every time
1. **Anything leaving the app gets ONE live fire, confirmed at the FAR END —
   and "arrived" is not "right": check every field against ground truth the
   operator knows.** The visit-date corruption rode ~90 invoices for 3 weeks
   because nobody compared the printed date to a known one. Parallel-run pipes
   that WRITE BACK into the app too, not just outbound ones.
2. **New tables/views need EXPLICIT grants in the migration** — `GRANT … TO
   authenticated` (or service_role) + `REVOKE … FROM anon`. Do NOT rely on
   staging's auto-grant (it hides the gap; prod has none). Then verify a
   browser-read table through a REAL authenticated browser session, not a
   service-role query. This bit us hard (068: property_managers/pm_reports/
   property_billing_lines had RLS but no grant → prod PM entries never saved).
3. **Never trust column names or `scripts/*.sql` as truth — query the live
   DB.** This session: `completed_by_staff_id` FKs to `profiles(id)` NOT
   staff_members; the work_type CHECK existed only live; `IN (...)` stores as
   `= ANY(ARRAY[...])`.
4. **DB passwords/API keys come into the Claude Code window, never chat, and
   NEVER echo a secret back in reply text** (even in a command block). Give
   commands with placeholders + "paste from your notes". A prod password got
   echoed → forced rotation. The prod password has rotated several times; get
   the current one from Joe.
5. **Leftover test accounts get DELETED, not reused.** Make fresh temp sessions
   for verification and self-clean them.
6. **Safety-critical feeds are ALLOWLISTS, never denylists** (invoice photos:
   only after/completion; lead intake: null-over-guess). An allowlist makes the
   dangerous case structurally impossible.
7. **Creating a temp PROD admin: PATCH the profile to admin, don't INSERT** —
   the prod signup trigger auto-creates the profile as 'staff', so an INSERT
   no-ops and is_admin() stays false.
8. **Staging first → Joe's OK → prod. Schema before code.** Commit/push only on
   Joe's OK; branch + PR, Joe merges.
9. **Make specifics:** blueprint imports RESET scenario schedules (re-check
   the interval after import). Make's Supabase upserts can't drop
   NOT NULL/no-default columns (Postgres checks NOT NULL before conflict
   resolution) → the house pattern for Make→visits writes is raw PATCH via
   makeAnApiCall with only the changed fields. Nothing propagates Xero
   deletions/voids back to the app — a deleted draft strands its visit at
   draft_created.
10. **Dual lockfile** — `npm install <dep>` then `npx pnpm install --lockfile-only`.

## Standing decisions / boundaries
- Xero ONLY via Make; emails/PDFs leave via Make, never the app directly.
- Google Calendar stays scheduling truth. Billing vocab: charge_up /
  subscription / non_billable, plus `fixed_recurring` per-visit lines.
- Labour COST = `staff_cost_rates` only.
- Walk-around ISSUE photo = `job_photos` photo_type='issue' (+severity for real
  faults); completed-work = after/completion; both share the PUBLIC job-photos
  bucket, so separation is by photo_type in the row, enforced by the
  `invoice_photos_for_make` allowlist for anything customer-facing.

## Parked (deliberately)
- **Retry-lockout transactional RPC** — still parked. Zero confirmed prod cost
  (the 6 stuck charge_up visits were all manually invoiced; flushed to
  'excluded'). Migration 062 (labour RLS) remains UNPROVEN in the wild — no
  paired-crew completion on prod since it shipped 26 July. Don't build the RPC
  until a real pair completes a paired visit through the app.
- **Quote conversions per month** — revisit ~Oct 2026; key off
  `proposal_sent_at`, never `status`.
- **pristinegardens006@gmail.com** ↔ Charles link is BLOCKED on a conflict
  (Charles's staff row already links pristine528@gmail.com, active). Joe to
  rule which is really his. Also: a staff row "Test Staff" is linked to Joe's
  own admin account — test debris, unruled.

## What shipped this session (all merged, prod)
- **PM issue-report feature COMPLETE** (#48/#49/#51): review/send UI, walk-around
  lifecycle (065/066), report reference PG-YYYY-NNNN (067), contact@ footer.
  Prod live-fired (PG-2026-0001, reuse proven).
- **Invoice pipe repaired + closed:** visit_date −1/touch corruption (Make
  upserts round-tripping the date) fixed at source (12 modules → raw PATCH) and
  repaired (108 rows); router gap fixed; Maggie + Sunhill parallel run proven
  (INV-2410/2411). 21 stranded 'processing' visits flushed.
- **Grant-hygiene:** 068 (grant authenticated + revoke anon on 3 admin tables),
  069 (revoke vestigial anon on 7 more). Full sweep: only public_suburb_locations
  is anon-readable (intended).
- **Lead-intake paste box** (#56, 070) — Messenger/Bark paste → AI extract →
  pending tray → approve. Both spec answer keys pass.
- **Rental badge + completed_by_staff_id** (#55).
- **Invoice photo attach A+B** (#57, 071) — client resize + allowlist view.
- **Small fixes** (#51): notification full-URL, labour-recon out-of-window
  banner, PM contact line.
- **Deleted from prod:** item3-verify + TEST-ALPHA-UI test debris. Trevor
  property marked inactive.

## Prod migration state
Applied to prod: 062–071. (065 issue lifecycle, 066 work_type lawn_mowing,
067 pm_report ref, 068 grants, 069 anon revoke, 070 lead_intake, 071
invoice_photos_for_make.) Staging matches.

## Access / tooling (this machine)
- psql at `/opt/homebrew/opt/libpq/bin/psql`. Prod ref `tblvlffqanqpqhcagcrk`
  (Mumbai), staging `yrpkfxmthregprsfkxaf` (Tokyo). Pooler strings + passwords
  from Joe each session (prod rotated several times).
- `npx tsc --noEmit` explicitly (build ignores type errors). `npm run lint`
  broken. Run TS scripts with `npx tsx` (copy into repo root for the `@/` alias).
- Staging run: `set -a; source .env.staging; set +a && npm run dev` (staging
  Make webhooks blanked). OPENAI_API_KEY is NOT in .env.local/.env.staging and
  is redacted on `vercel env pull` — for local AI grading, Joe pastes a key.
- Live UI verification: fresh temp admin + forged `sb-<ref>-auth-token` cookie
  (chunked base64) + puppeteer-core (Chrome at the standard mac path). ALWAYS
  self-clean. New tables need `notify pgrst,'reload schema'` (apply scripts do it).
- Prod app URL: **https://v0-landscaping-job-app.vercel.app**.
