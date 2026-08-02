# SESSION HANDOFF — Pristine Jobs

Start here for a clean chat. This file is dateless and OVERWRITTEN each session —
git history is the archive. The tickable work list lives ONLY in
`docs/BUILD_QUEUE.md`; this file must not duplicate it.

## Where things stand
Everything built this session is MERGED (PRs #59–#61); Joe merged with the
Vercel deploy still propagating — confirm the deploy landed before live-firing
anything UI-side. Prod migrations applied through **073** (both applied BEFORE
their code merged; staging matches, viewdefs hash-verified identical). Three
things shipped: property email/phone edit (VA unblock), sales-pipeline lead
soft-delete (spam clear-out), and the non_billable invoice guard.

## NEXT WORK (in rough priority)
1. **Invoice photo attach — Part C is Joe's, in Make** (unchanged from last
   session). Extend "Pristine App to Xero Invoice" with the attach branch at
   DRAFT time (`IncludeOnline=true`) reading `invoice_photos_for_make` per
   visit — read the VIEW, never job_photos. Verify Xero ceilings +
   IncludeOnline on the live module, then one end-to-end live fire. Brief:
   `docs/archive/INVOICE_PHOTO_ATTACH_BRIEF.md`.
2. **Website spam:** Turnstile is COMMITTED in the theme repo (0.22.0/0.22.1,
   off until keys exist) — Joe is creating the Cloudflare keys and enabling.
   Once spam stops, the VA clears the backlog with the new lead Delete button.
3. Everything else: BUILD_QUEUE in tier order. Retry-lockout RPC stays PARKED
   (unchanged — waiting on a real paired-crew completion to prove 062).

## Rules that hold every time
1. **Anything leaving the app gets ONE live fire, confirmed at the FAR END —
   and "arrived" is not "right": check every field against ground truth.**
   Parallel-run pipes that WRITE BACK into the app too.
2. **New tables/views need EXPLICIT grants in the migration**; verify
   browser-read tables through a REAL authenticated browser session on PROD
   (068 lesson: RLS-without-grant hid on staging, broke prod silently).
3. **Never trust scripts/*.sql, column names, OR substring greps as truth —
   diff the LIVE DB.** This session's near-miss: the invoice view live on
   both DBs has a 5th fixed_recurring branch and wider exclusions that exist
   in NO script (049 is the newest view file); a grep for the 049 exclusion
   string "confirmed" a match that was false. The 049-built first cut of 073
   clobbered the fixed_recurring branch ON STAGING; caught only by diffing
   `pg_get_viewdef` staging-vs-prod before prod. When replacing ANY view:
   dump the live prod viewdef, edit THAT, and post-check with RAISE (073 is
   the model — it also proves grants survive CREATE OR REPLACE).
4. **DB passwords/API keys come into the Claude Code window, never chat, and
   NEVER echo a secret back in reply text.** Passwords rotate; get current
   ones from Joe each session.
5. **Leftover test accounts/rows get DELETED, not reused.** Verification
   scripts must route ALL failure paths through the cleanup (a thrown
   mid-script error stranded staging rows twice this session — Supabase
   query builders are thenables WITHOUT .catch; use try/await around them).
6. **Safety-critical feeds are ALLOWLISTS/choke points.** The invoice ready
   stamp now has ONE choke point: `readyInvoiceStatusForJob` ('excluded' for
   non_billable + legacy quoted). Any new ready-stamp or extras write path
   MUST go through it, and the view exclusion arrays are a known denylist
   smell — extending them needs the rule-3 live-diff treatment every time.
7. **Creating a temp admin: PATCH the profile to admin; INSERT only if no
   trigger-made profile exists** (prod has the auto-create trigger; staging
   does NOT — its insert needs full_name NOT NULL).
8. **Staging first → Joe's OK → prod. Schema before code** (both 072 and 073
   were on prod before merge). New pattern now standard: a query error on a
   load-bearing page renders a VISIBLE error banner, never an empty surface
   (sales-pipeline board does this; silent-empty was how schema drift hid).
9. **Make specifics (unchanged):** blueprint imports reset schedules; house
   pattern for Make→visits writes is raw PATCH with only changed fields;
   nothing propagates Xero deletions/voids back (exposure documented in
   BUILD_QUEUE); module 48 stamps 'invoiced' with no invoice created for a
   wrongly-subscription-tagged property.
10. **Dual lockfile** — `npm install <dep>` then `npx pnpm install
    --lockfile-only`. puppeteer-core is NOT a dependency — install with
    `npm install --no-save` for browser live-fires.

## Standing decisions / boundaries
- Xero ONLY via Make; emails/PDFs leave via Make, never the app directly.
- Google Calendar stays scheduling truth. Billing vocab: charge_up /
  subscription / non_billable, plus `fixed_recurring` per-visit lines.
  **non_billable now structurally cannot invoice** (073 + choke point).
- Labour COST = `staff_cost_rates` only.
- Lead deletion is SOFT (deleted_at) and for spam/junk only; real customers
  who don't proceed get Mark lost (keeps reporting honest). No restore UI —
  recovery is a DB update, deliberately.
- Walk-around issue photos vs after/completion separation enforced by the
  `invoice_photos_for_make` allowlist (photo_type after/completion only).
- Joe wants reports/summaries CONCISE and PLAIN-ENGLISH: outcome, business
  risk, what he must do. Technical detail goes in commits/PRs, not the chat
  summary.

## Parked (deliberately)
- **Retry-lockout transactional RPC** — parked until a real paired-crew
  completion proves migration 062 in the wild. Zero confirmed prod cost.
- **Quote conversions per month** — revisit ~Oct 2026; key off
  `proposal_sent_at`, never `status`.
- **pristinegardens006@gmail.com ↔ Charles link** — still BLOCKED on Joe's
  ruling (staff row already linked to pristine528@gmail.com). "Test Staff"
  row linked to Joe's admin account also still unruled.
- Comms-hub revival, placeholder staff rows — unchanged, see BUILD_QUEUE.

## What shipped this session (all merged; deploy propagating)
- **Property contact edit** (PR #59): Client Email + Phone in the property
  edit dialog; add-mode state-leak fixed in review; staging browser
  live-fired. VA can now fix emails herself.
- **Lead soft-delete** (PR #60, migration 072): Delete button + confirm on
  pipeline cards; deleted leads hidden from board + duplicate matching;
  visible error banner replaces silent-empty-board on query failure; staging
  browser live-fired end-to-end.
- **Non_billable invoice guard** (PR #61, migration 073): verified the guard
  did not exist (zero prod exposure — 0 non_billable jobs ever), then closed
  it in two independent layers (choke-point function + view emits nothing,
  extras branch included). Staging acceptance 4/4 with charge_up /
  fixed_recurring / legacy-quoted controls proving no collateral change.
- **Prod data note (read-only):** 23 'new' leads on the board (likely mostly
  spam — the Delete button is the clear-out tool once deployed).

## Prod migration state
Applied to prod: 062–073. (070 lead_intake, 071 invoice_photos_for_make,
**072 sales_leads soft delete, 073 invoice view non_billable exclusions**.)
Staging matches; invoice viewdefs hash-identical prod↔staging.

## Access / tooling (this machine)
- psql at `/opt/homebrew/opt/libpq/bin/psql`. Prod ref `tblvlffqanqpqhcagcrk`
  (Mumbai), staging `yrpkfxmthregprsfkxaf` (Tokyo). Pooler strings + passwords
  from Joe each session (they rotate).
- `npx tsc --noEmit` explicitly (build ignores type errors). `npm run lint`
  broken. Run TS scripts with `npx tsx` from repo root (copy the file into
  repo root so imports resolve; self-delete after).
- Staging run: `set -a; source .env.staging; set +a && npm run dev` (staging
  Make webhooks blanked). OPENAI_API_KEY not in env files.
- Live UI verification: fresh temp admin + real signInWithPassword session →
  forged chunked `sb-<ref>-auth-token` cookie + puppeteer-core (Chrome at the
  standard mac path, `npm install --no-save puppeteer-core`). ALWAYS
  self-clean (see rule 5). New tables need `notify pgrst,'reload schema'`.
- Prod app URL: **https://v0-landscaping-job-app.vercel.app**.
