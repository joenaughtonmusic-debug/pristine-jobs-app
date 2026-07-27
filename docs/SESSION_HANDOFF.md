# SESSION HANDOFF — Pristine Jobs

Start here for a clean chat. This file is dateless and OVERWRITTEN each session —
git history is the archive. The tickable work list lives ONLY in
`docs/BUILD_QUEUE.md`; this file must not duplicate it.

**NEXT WORK: finish the invoice-pipe cleanup, in this order.**
1. Joe eyeballs the two visit-date lists (8 extreme + 4 no-labour rows — in
   BUILD_QUEUE's repair item) → run `scripts/repair_visit_dates_20260727.sql`
   (ID-keyed, guarded, 108 rows).
2. Queue-view fix for the Sunhill router gap: expose
   `scheduled_jobs.invoice_method` in `v_invoice_queue` (migration), Joe updates
   the Make router condition, then reset + requeue the SH15 visit.
3. Joe closes the parallel-run comparison (INV-2409 vs manual Maggie invoice)
   and the INV-2352 deleted-search.
Then: PM report copy amendments (contact@ footer + citable ref number), extras
flow for fixed-price invoices, and the rest of BUILD_QUEUE in tier order.

## Working method
- **Advisory Claude** (chat): plans, decides, keeps the queue, writes briefs.
- **Claude Code in VS Code**: writes code, runs migrations, reads/writes live +
  staging DBs, holds Vercel CLI access. Direct psql to both DBs.
- **Joe** is the bridge: merges PRs, works the Make/Xero/host panels. Plain
  English, one clear recommendation, honest over agreeable.

## Rules that hold every time
1. **Anything that leaves the app gets ONE live fire, confirmed at the FAR END —
   and "arrived" is not "right": check every field against ground truth the
   operator knows first-hand.** The visit-date corruption rode ~90 real invoices
   for 3 weeks because nobody compared the printed date to a known service date.
   Parallel-run any pipe that WRITES BACK into the app, not just outbound ones.
2. **"Build passes" ≠ works, and your test harness can be the thing that's
   wrong.** Match the harness to the app's ACTUAL request (verb, `Prefer`, auth
   role, RLS context). See `docs/HANDOFF_for_VS_Code_Claude.md` rule 2a.
3. **Testing RLS in psql: `postgres` has BYPASSRLS** — `SET ROLE authenticated`
   AND assert `row_security_active()`.
4. **Never trust `scripts/*.sql` as state** — query the live DB. (Bit us again
   27 July: the work_type CHECK existed only in the live DB.)
5. **Staging first** (Tokyo `yrpkfxmthregprsfkxaf`) → Joe's OK → prod (Mumbai
   `tblvlffqanqpqhcagcrk`). Schema before code.
6. **Fail loudly, never silently.** Surface, don't silently correct.
7. **Read-only-confirm before writing to real customer data; self-clean all test
   artifacts. Leftover test accounts get DELETED, not reused** — flag, confirm,
   delete; make fresh temp sessions and clean them (Joe's rule, 27 July, after a
   stale prod admin got borrowed for a live-fire).
8. **DB passwords come from Joe each session, into the Claude Code window, never
   chat, never committed — and NEVER echo a secret back in reply text, even
   inside a command block.** Give commands with placeholders and "paste from
   your notes". (A prod password got echoed 27 July → forced rotation. Both
   prod and staging strings were re-issued that session; get current ones from
   Joe.)
9. **Commit/push only on Joe's OK; never to main directly** — branch + PR.
10. **Dual lockfile** — `npm install <dep>` then `npx pnpm install --lockfile-only`.
11. **Make blueprint imports reset scenario schedules** (hourly → 9-hourly seen
    live). Post-import checklist: schedule interval, webhook binding, connection
    warnings, on/off state, then Run-once on a known row.
12. **Make's Supabase upserts can't simply drop NOT NULL/no-default columns**
    (Postgres checks NOT NULL on the proposed insert row BEFORE conflict
    resolution). The house pattern for Make→visits writes is raw PATCH via
    makeAnApiCall with only the changed fields.

## State of the world (27 July, end of session)
- **PM issue-report feature COMPLETE** (pieces 1, 2, 2b, 3 all merged: PRs #45,
  #46, #48, #49). Crew logs issues → office reviews/edits at /admin/pm-reports →
  send → PM gets PDF (private bucket, 4h signed URL, via Make Email/SMTP from
  contact@) → issues stamped reported_to_pm_at; lifecycle statuses set from the
  property dialog only; everything filters to `open`.
- **Prod migrations applied: 062–066** (labour RLS; property_managers;
  pm_reports+bucket; issue lifecycle; work_type lawn_mowing).
- **Invoice pipe (Make → Xero): LIVE and real since ~7 July** (drafts INV-2367 →
  INV-2409, several paid). 27 July: all 12 visits-writing modules across
  "Pristine App to Xero Invoice", "Invoice: Status Paid/Sent", "Xero: Update App
  Invoices" converted to raw PATCH (blueprint JSON edits, re-imported). The
  visit_date −1/touch corruption is stopped at source but **historic damage is
  unrepaired until the staged repair runs** (see NEXT WORK; the
  inference-over-controlled-test caveat is recorded in BUILD_QUEUE).
- **Queue hygiene:** 21 stranded 'processing' visits flushed to 'excluded' 27
  July (Joe verified all were manually invoiced — stale status, not lost money).
  v_invoice_queue is currently honest.
- **Parallel run in flight:** see BUILD_QUEUE Tier 5 item for full state.
- **Fresh session needs:** prod + staging pooler strings from Joe (both
  re-issued 27 July after the rotation).

## Standing decisions / boundaries
- Xero only via Make. Emails/PDFs leave via Make, never the app directly.
- Google Calendar stays scheduling truth. Billing vocabulary: charge_up /
  subscription / non_billable — plus `fixed_recurring` per-visit lines (live on
  property_billing_lines AND scheduled_jobs.invoice_method; the line-items view
  has a fixed_recurring branch emitting 1 × fixed_visit_amount).
- Labour COST = staff_cost_rates only.
- Maintenance = price per visit with a frequency, never a converted monthly sub.

## Parked (deliberately)
- **Retry-lockout transactional RPC** — scoped in docs/RETRY_LOCKOUT_SCOPING.md;
  wait for a real crew pair to prove 062 in the wild.
- **Quote conversions per month** — revisit ~Oct 2026; key off
  `proposal_sent_at`, never `status`.
- **pristinegardens006@gmail.com** (staff role, never signed in, no staff row) —
  Joe to rule delete-or-keep.

## Access / tooling (this machine)
- psql at `/opt/homebrew/opt/libpq/bin/psql`; session-pooler strings + passwords
  from Joe each session. Two projects: prod `tblvlffqanqpqhcagcrk` (Mumbai),
  staging `yrpkfxmthregprsfkxaf` (Tokyo).
- `npx tsc --noEmit` explicitly (build ignores type errors). `npm run lint`
  broken. Run TS scripts with `npx tsx`.
- Staging run: `set -a; source .env.staging; set +a && npm run dev` (staging
  Make webhooks blanked). Live UI verification: fresh temp auth user +
  puppeteer-core (Chrome at the standard mac path), ALWAYS self-cleaned.
- Prod app URL: **https://v0-landscaping-job-app.vercel.app**.
