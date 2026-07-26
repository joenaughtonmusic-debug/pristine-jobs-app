# HANDOFF — for Claude in VS Code (Pristine Jobs)

Read this before doing anything. It's the standing technical rulebook and the
landmines. For CURRENT session state, read `docs/SESSION_HANDOFF.md`; for the
work list, `docs/BUILD_QUEUE.md`. A fresh coding session that ignores these will
repeat known mistakes.

---

## What this repo is
Next.js/TypeScript + Supabase app for a NZ landscaping business. Flow:
**lead → quote → accepted → scheduled → crew does the job → invoiced in Xero.**
Deploys from `main` via Vercel. Owner (Joe) is non-technical and relays between an
advisory Claude (planning) and you (code).

---

## THE RULES THAT MATTER (these have burned us repeatedly)

1. **`scripts/*.sql` has DRIFTED from the live DB.** Migrations were hand-pasted
   into Supabase. The folder is INTENT, not STATE. **Never trust it as truth.**
   Before touching anything schema- or data-related, query the LIVE DB to confirm
   actual columns, constraints, and stored shapes. You have service-role access via
   `.env.local` — use it to verify, don't assume.

2. **"Typecheck passes" / "build passes" ≠ it works.** Prove changes with a LIVE
   end-to-end test against the real DB/UI (the pattern already used in this repo:
   temp admin user + forged SSR cookie + `next start` + headless Chrome CDP,
   self-cleaning afterward). A green build has repeatedly hidden real breakage.
   Report what you actually verified, not just that it compiled.

3. **Investigate before building.** Repeatedly, the "feature" already existed and the
   real work was wiring/surfacing it. ALWAYS first report: what already exists for
   this? Lead your plan with the investigation result.

4. **Fail honestly, never silently.** Prefer code that STOPS and reports a bad state
   over code that fakes success. A silent card-advance once left a quote unlinked
   with a live recurring-invoice reminder — the double-billing shape. Guards that
   stop-and-report are correct and wanted.

5. **Don't over-build.** The owner's stated failure mode is adding complexity "in
   what I think helps the customer without knowing if it does." When a spec could be
   simpler, flag it. If you'd need to guess business logic, STOP and ask rather than
   assume (e.g. multiple labour lines → leave Duration blank, don't sum).

6. **Show the plan before building** on anything non-trivial, and **flag anything
   that tangles with recently-merged work.**

7. **Data-shape drift is real.** Some `quote_drafts.line_items` are stored as JSON
   strings, some as arrays — the shared parser handles all three shapes; don't
   assume one shape. Watch for similar drift elsewhere.

---

## PRODUCTION SAFETY (important)
- **A staging DB EXISTS — use it first, always.** Staging: Supabase project
  `yrpkfxmthregprsfkxaf` (Tokyo), a prod snapshot with Make.com webhook URLs
  deliberately blanked (staging can never email a customer). Prod:
  `tblvlffqanqpqhcagcrk` (Mumbai). Flow: rehearse on staging → Joe's OK → prod.
  Connection strings + passwords come from Joe each session, pasted into the
  coding window, never chat. (An earlier version of this file said "there is no
  staging DB, test against production" — that was false and unsafe.)
- Prod tests only for final verification, self-cleaning: temp users, test rows,
  storage objects deleted; statuses/flags restored; read-only-confirm before
  deleting anything (an orphan test property once turned up in a routine delete).
- **Never touch real customer rows in a test.** If unsure whether a row is real,
  don't write to it.
- **Anything that leaves the app — email, webhook, Xero — gets ONE live prod
  fire before it counts as shipped.** The lead notifier was code-complete and
  had never once worked in prod (env var missing in Vercel).

---

## ARCHITECTURE NOTES YOU NEED
- **Xero invoicing is reached ONLY via Make.com.** The app sets flags / writes rows;
  Make scenarios read them and do the Xero work. Do not try to call Xero directly.
- Make's Supabase connection uses SERVICE_ROLE (bypasses RLS).
- Admin pages are gated on `profiles.role` via the live `is_admin()` RPC.
- Key tables: `properties`, `quote_drafts`, `sales_leads`, `scheduled_jobs`,
  `visits`, `extra_charge_items`, `profiles`. Views feed Make (e.g. the invoice
  line-item view branches on `invoice_method`).

## BILLING MODEL (settled — don't re-litigate in code)
- `charge_up` = default maintenance, billed **PER VISIT** (labour hrs×rate +
  greenwaste + extras). **Frequency is informational, NEVER a divisor.** Quoted
  per-visit number = invoiced per-visit number.
- `subscription` = ~6–7 genuinely-fixed properties, invoiced by HAND in Xero via a
  repeating invoice. App does NOT auto-create recurring invoices. `monthly_equivalent`
  still stored for these.
- Default labour rate $80/hr (new quotes only).
- Account codes: Labour 10010, Materials 10011, Plants 10115, Greenwaste 10114,
  sprays/extras 10011. Tax OUTPUT2, LineAmountTypes Inclusive.

---

## RECENTLY SHIPPED (so you don't rebuild it)

**The authoritative shipped ledger is `docs/BUILD_QUEUE.md` → SHIPPED** (this
file previously stopped at PR #14; the queue now carries everything through
PR #36: per-line billing 057–059, rental tag, photo-gate, walk-around report +
severity 060, capture/VA Offload, auth gate + RLS role separation 041, lead
notification wiring on all three creation paths, WordPress form fix 0.21.2).
Highlights from the PR #9–#14 era that still shape the code:
- Service-aware quote builder: new-customer-first; quote type reshapes form (pricing
  panel filter, template filter, scope/terms wording, hand-edit preservation);
  greenwaste one-input auto-range; lead `job_type` pre-selects builder type.
- Per-visit pricing model: maintenance line = one visit's cost; frequency doesn't
  divide; $80 default.
- Sold→scheduled seam: card "Schedule job" → `/admin/schedule?quote=…` with
  pre-filled modal; save links job↔quote, clears recurring-invoice reminder,
  auto-advances card. `recurring_invoice_setup_status` is TEXT NOT NULL with CHECK
  (`not_required`/`required`/`completed`) — write `not_required` when linking, never
  null.
- Crew brief: quote scope + materials (line items + maintenance allowances, sizes
  only) + labour hours (→ Duration) land on `scheduled_jobs` and show on crew
  `/jobs/[id]`.

---

## PR / WORKFLOW CONVENTIONS
- Branch, commit, push, open a PR. If `gh pr create` is blocked by permissions, push
  the branch and give Joe the compare URL to open it.
- **Nothing is live until merged to `main` and deployed.** Say so clearly — don't
  imply a pushed branch is live.
- Migrations: numbered `scripts/NNN_*.sql` with an intent header, idempotency,
  and fail-loud RAISE post-checks (057 is the model). Applied via psql: rehearse
  on staging → Joe's OK → prod. Schema before code — state that the code depends
  on the migration being applied FIRST. (Numbering has collided before — check
  for the next truly free number.)

---

## THE CURRENT / NEXT WORK
Lives in `docs/SESSION_HANDOFF.md` (current state, overwritten each session) and
`docs/BUILD_QUEUE.md` (the tickable list) — this file deliberately doesn't track
it. Whatever the task: investigate first, staging first, verify live, fail
honestly, don't over-build, show the plan.
