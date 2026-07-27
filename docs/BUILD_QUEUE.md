# BUILD QUEUE — Pristine Jobs

The ONLY tickable list. The session handoff (docs/SESSION_HANDOFF.md) points here
and must not duplicate it. Tick items here; git history is the archive.

## NEXT UP — one-line fix, live-fire to verify
- [x] **Comms-reply webhook env var — MOOT, closed 26 July.** The comms page
      bin proceeded (branch comms-page-bin), so Send Reply no longer exists.
      Never add `NEXT_PUBLIC_SEND_COMMUNICATION_REPLY_WEBHOOK_URL` to Vercel.

- [ ] **Labour-recon misc-work window gap** — the ONE signal that lost coverage
      in the VA actions clear-out: the recon page only shows unlinked misc
      entries inside its default Mon-Fri window, so a prior-week "Link extra
      work" entry is invisible until someone pages back. Small fix, needs
      doing (e.g. an out-of-window unlinked-misc count/banner on the page).

- [ ] **Notification Link field is a relative path** (`/sales-pipeline`) — not
      clickable in the email. Make it a full URL (NEXT_PUBLIC_APP_URL exists
      in Vercel). Small; touches lib/lead-notifications.ts (Tier 5 proxy item
      also touches that file — can ride together).
- [x] **VA actions board clear-out (Tier 1 item 2)** — SHIPPED 26 July, PR #37
      + migration 061 (staging 255 / prod 195 rows dismissed, zero refill).

- [ ] **Make "Communication: Hub" revival fix (recorded, do NOT do — page likely
      being binned):** the router's route 2 (AI branch, modules 4→5→2) has NO
      filter, so every email (incl. Bark/BuildersCrack/Cardlink) runs BOTH its
      own branch and the AI branch → double insert, same external_id →
      duplicate-key 409s → Make auto-deactivated 17 July. Fix if ever revived:
      set route 2 as a FALLBACK route in Make (one setting, no code). Note:
      all four branches insert a hardcoded user_id
      (5d75a454-7dd8-432e-b7c7-560fddfcac91) — the id the error names.
- [ ] **Comms-reply env fix (NEXT UP above) is MOOT if the comms page is
      binned** — don't do it until the bin decision lands.


## RESOLVED 26 July — website lead chain (was TOP PRIORITY; kept for the record)
- [x] **(a) WordPress form front door — FIXED (plugin 0.21.2, live-verified).**
      Root cause: nginx page cache served >24h-old HTML whose WP nonce always
      failed → every customer (anonymous included — both earlier hypotheses
      were wrong) got "Security check failed", dropped with no log. Fix: nonce
      gate removed from the public form; honeypot (`pgv2_ref_code`) + per-IP
      rate limit (5/hr); EVERY rejection logged `[pgv2] enquiry rejected
      reason=…`; `nocache_headers()` on contact pages + host-panel cache
      exclusion for /contact/ and /contact-us/. Verified: Joe's incognito phone
      submissions → pipeline leads + notification emails. Theme git repo is the
      deployment record (Desktop zips unreliable after 0.20.22 / 9 July).
- [x] **(b) WordPress → app forward — was NEVER broken.** wp-config.php holds
      the correct URL + secret (proven by live submissions). Only Joe's local
      `.env.local` secret is stale vs the canonical Vercel value — OPEN,
      accepted; sync from the Vercel dashboard if ever needed locally.
- [x] **(c) App → notification email — FIXED.**
      `NEXT_PUBLIC_LEAD_NOTIFICATION_WEBHOOK_URL` was never set in Vercel, so
      ALL lead notifications (including the two pre-existing call sites) failed
      in production since forever — the 23 July audit's "the notifier exists
      and works" was true of the code and FALSE in production. Var added +
      redeployed + live-verified on both the admin-enquiries and website paths.

## SHIPPED (don't rebuild)
- [x] **Lead notifications wiring (Tier 1 item 1, PR #36) — live-fire verified
      in prod 26 July**: all three lead-creation paths notify after-insert,
      failures log `LEAD_NOTIFY_FAILED lead=<id> source=<source>`; 6/6 staging
      acceptance tests; real prod submissions landed with emails in Joe's
      inbox. (Hardcoded email stays until the Tier 5 webhook-proxy item — see
      that entry.)
- [x] **Website enquiry chain end-to-end** — first `website`-source leads in
      the system's history landed 26 July.
- [x] Per-line billing model (`property_billing_lines`, migrations 057–059)
- [x] `fixed_recurring` billing pattern (051/052)
- [x] Rental property tag (`is_rental`, 053) — all rentals tagged
- [x] Photo-gate (PR #32)
- [x] Walk-around report + severity (migration 060, PR #33)
- [x] Sales pipeline board, six stages, manual entry, follow-up ladders
- [x] Service-aware quote builder, per-visit pricing, sold→scheduled seam, crew brief
- [x] Auth rebuild (magic link, password reset, Zoho SMTP)
- [x] WordPress lead webhook → `/api/public/sales-leads`

## TIER 1 — the "last 10%" (next, in order)
- [x] **1. Lead notifications wiring** — SHIPPED 26 July (see SHIPPED). The
      env-var move was deliberately dropped (client-component call sites);
      the email leaves the bundle in the Tier 5 proxy item.
- [x] **2. VA actions board clear-out** — SHIPPED 26 July (PR #37 + migration
      061; see the [x] entry above).
- [x] **3. Capture page → VA action board** — SHIPPED 26 July (PR #39),
      live-fired through real prod triage; VA inbox confirmation pending.
- [x] **4. Fix stale `docs/HANDOFF_for_VS_Code_Claude.md`** — DONE 26 July: the
      false "no staging DB, test against PRODUCTION" section replaced with the
      staging-first flow; shipped ledger now defers to BUILD_QUEUE (was stuck at
      PR #14); migration + next-work sections brought current.

## TIER 2 — real gaps, need a decision first
- [ ] **Messenger + Bark lead intake.** No path exists for either. This IS
      `docs/LEAD_CAPTURE_SPEC.md`. Shape: email-forward for Bark, share-sheet/paste
      for Messenger. ⚠️ First decision: which repo. (The "voice-to-quote stays
      separate, Pristine Jobs is system of record" ruling suggests: build here,
      port the extraction patterns across.)
- [ ] **Labour reconciliation review** — is it over the top, does it give clean
      data, is it easy + reliable for crew? NOTE: hours are recorded for
      quoted-vs-actual comparison, NOT billing, so it is **not** redundant.
      Do AFTER the VA board clear-out.
- [x] **Labour RLS bug — SHIPPED (PR #42, migration 062, prod-applied +
      prod live-fired).** `job_labour_entries` split into per-command policies:
      SELECT + INSERT widened to job members (`current_staff_job_ids()`),
      UPDATE/DELETE stay own-or-admin. Fixed the completer inserting a
      teammate's cost row (fired live 17 Jul, Alex+Graham) AND a silent
      under-show on `jobs/[id]`. Diagnostic lesson kept in
      docs/HANDOFF_for_VS_Code_Claude.md rule 2a (return=representation vs the
      app's return=minimal false-negative).
- [ ] **Complete-visit retry lockout — separate bug, still open, the part that
      costs money.** Independent of the RLS fix above. When ANY of the 8
      completion writes fails partway (network drop, etc.), the visit row is
      already inserted, so the duplicate guard (complete-visit-dialog.tsx
      ~line 259) tells the crew "This job has already been completed." on
      retry. Crew stops reporting it, the job looks fine on the schedule, the
      visit stays invoice_status=not_ready — and it silently NEVER INVOICES.
      Underlying cause: the dialog runs 8 sequential writes from the crew's
      phone with no transaction (visit → primary labour → visit-labour →
      hours sync → helper labour → invoice stamp → photos → job status). Fix:
      either a resume-instead-of-block path when the existing visit is in a
      half-completed state, or fold the whole sequence into one transactional
      RPC. (The RLS fix does NOT address this — a partial strand can still
      happen from a non-RLS error.)
- [ ] **Reconciliation backfills can mask live bugs — surface, don't just
      correct.** The 21 July labour-recon backfill note "cost row was missing"
      WAS the RLS bug above being silently absorbed — recon caught it (earns
      its keep; relevant to the "is labour-recon over the top?" Tier 2
      review), but Joe's profitability for that 17 July job was wrong for four
      days and nobody knew. Principle: if a backfill fires to fix a missing
      row, something upstream failed — it should raise a flag, not just patch
      the data.
- [ ] **App audit — 8 questions** (in IDEAS.md). Start from `docs/PAGE_AUDIT.md`
      and check what's stale. Includes cost-capture redesign (overwhelming),
      new-customer capture fields, gaps in the build.

## TIER 2 additions (26 July audit findings)
- [ ] **PAGE_AUDIT.md is stale on 8 of 16 pages** (dashboard, enquiries, quotes,
      schedule, properties, actions, labour-recon, profitability — per-line
      billing ripple + photo-gate/walk-around). Two recs dead (quotes split
      DONE; labour-recon exceptions→actions REVERSED). Refresh when the app
      audit runs.
- [~] **Cost Capture page: 1,237 lines** — audited (docs/COST_CAPTURE_AUDIT.md,
      PR #43) and partly fixed: labour cost now reads staff_cost_rates and the
      fabricating backfill button is gone (PR #44). STILL OPEN: the broader
      simplification (drop the inline correction forms, fold back-costing into
      Profitability, leaner read-only "what's not ready to bill" list) — see
      the audit's "simpler version".
- [ ] **Quoted-jobs → invoices merge still undone** — the one live PAGE_AUDIT
      recommendation; page and nav entry both remain.

## TIER 3 — PM / body-corporate set (the sales USP)

### PM issue-report feature (ACTIVE — build order)
- [x] **1. PM contact table** — SHIPPED (PR #45, migration 063, prod). Shared
      `property_managers` (one PM → many properties), assigned from the property
      dialog on rentals. Joe is entering PMs.
- [x] **2. Report engine** — SHIPPED (PR #46 merged, migration 064 applied to
      prod). PDF (react-pdf) → private `pm-reports` bucket → signed URL → Make;
      `pm_reports` record; admin API route `POST /api/pm-report {visitId}`.
      Make scenario is LIVE: Webhook → HTTP Get a file → **built-in Email app
      over SMTP** (NOT the Zoho Mail module — it has no attachments field),
      sending from contact@pristinegardens.co.nz. Live-fired TWICE, confirmed
      at the inbox both times: staging engine → Make → PDF opened; prod through
      the deployed Vercel route (proves react-pdf on Vercel) → PDF opened,
      photos render.
- [~] **2b. Office review/send UI** — BUILT, PR #48 open. `/admin/pm-reports`:
      To send queue + Sent section; per-issue editable notes (saved to
      job_photos.caption, engine reads fresh at send = review-before-send);
      two-step confirm Send; re-send warns with prior date; no-PM-email rows
      warn instead of send. Signed URL TTL now 4h (was 7d). Per-issue exclusion
      deferred to piece 3 by decision. Staging live-verified end-to-end.
- [ ] **PM report copy amendments** (small, fold into a nearby PR): (a) PDF
      footer + API contact line show admin@pristinegardens.co.nz (the VA's
      address) — switch to contact@pristinegardens.co.nz for PM-facing docs;
      (b) add a human-citable reference number to the report (subject + PDF
      header) so a PM handling several reports can cite one back to us —
      pm_reports needs a short unique ref (e.g. PG-2026-0001 style sequence).
- [ ] **3. Walk-around resolve/dismiss lifecycle** (was: "list only grows").
      DECISIONS LOCKED: four states `open`/`resolved`/`dismissed`/`not_our_job`;
      property badge counts `open` ONLY; status set from the property dialog
      only; add `reported_to_pm_at` as a STAMP (set when a report sends), not a
      state. Zero issues in prod today → greenfield, no backfill. Columns on
      `job_photos`: issue_status (default 'open' + CHECK, only on photo_type
      'issue'), issue_status_at, issue_status_by, issue_status_note. Badge +
      property-dialog list filter to open.

### Other Tier 3
- [ ] Rental-flagged jobs surface as rentals (trivial now the tag exists)
- [ ] **PM portal** — upcoming visits, per-property history, downloadable reports.
      BUILD LAST: only external-facing surface; displays what other features generate.
- [ ] White-label / forwardable PDF reports for landlords

Candidates (pick later, don't fan out): one-tap repair approval with pre-approved
threshold (<$150 auto); consolidated monthly PM invoice with per-property lines;
tenant heads-up texts pre-visit; vacant-property mode (mail/windows/security +
photo proof); end-of-tenancy 48hr turnaround guarantee.

*Several of these are service offerings, not app features — they can go in sales
pitches before the app supports them.*

## TIER 4 — validated but not built
- [ ] **Speed tag** (orange = high speed / yellow = medium / green = detail).
      Per-job + overridable. Lawn jobs default ORANGE. Non-lawn take the PROPERTY's
      speed. Property speed does NOT reach into lawns.
- [ ] **Expected duration per job** — badge at SCHEDULING time on the job card,
      pulled from the property's quote. Fixed-price jobs are the priority case.
      VERIFIED: quotes attach via `quote_drafts.property_id`; hours plumbing exists
      both ends (`quote_drafts.labour_hours`,
      `scheduled_jobs.planned_duration_hours`). Wiring, not schema.
      Watch-outs: which quote wins when a property has several; multiple labour
      lines → leave duration blank, don't sum.
- [ ] Post-job follow-up email (review request, referral ask, maintenance upsell)
- [ ] Photo attach to Xero invoices — kills the download-resize-attach routine.
      Job photos now exist, so this is wiring.
- [ ] Billing type fix for the 88 mislabelled `charge_up` properties — BLOCKED on
      Joe identifying which are genuinely fixed-price. Not a code problem.
- [ ] Voice-to-quote integration — design brief written, nothing built.
- [ ] 48h follow-up "F" flag on sent quotes — a BADGE, not an actions row
- [ ] Billing-change audit log (who, when, from → to)
- [ ] Verify: is billing method locked when a job comes from a quote?
- [ ] Billing type mandatory on property at creation (no default); jobs inherit
- [ ] Quote export (clipboard or CSV) · quote log book · crew runbook ·
      guarded admin-only lead delete
- [ ] Calendly-style booking slots with geography clustering (respect the GCal
      boundary — this is its own scoping job)

## TIER 5 — housekeeping
- [x] Leftover PROD admin `item3-verify@example.com` — DELETED 27 July (auth
      user + profile; no other rows referenced it). Full prod auth sweep same
      day: 8 accounts, no other test accounts. One to confirm with Joe:
      `pristinegardens006@gmail.com` (role staff, created 25 Apr, NEVER signed
      in, no staff_members row) — unused; delete or keep deliberately.
      RULE (recorded in SESSION_HANDOFF): leftover test accounts get deleted,
      not reused.
- [~] **Maggie + Sunhill fixed-price parallel run — IN FLIGHT (27 July).** Both
      27-Jul lawn visits queued as `fixed_recurring` per-visit drafts ($149.00
      MR1 / $84.50 SH15 — two separate services at SH15, never merged with the
      $329.74 garden line, which stays manual). SH15's $84.50 lawn line
      reactivated as fixed_recurring. Joe compares the drafts against his
      manual invoices this cycle before retiring the manual copy. Don't retire
      the manual copy first.
- [ ] 9 unconfirmed subscription lines — a VA-in-UI task, NOT a SQL batch
- [x] ~~"Xero invoice path has never fired on a real job"~~ — WRONG since at
      least 7 July (corrected 27 July, Joe was planning around it): the Make
      invoice scenario is ON and has been creating real drafts continuously
      (INV-2367 → INV-2405+, several PAID). What HADN'T fired before 27 July
      is the fixed_recurring branch — that's what the parallel run above tests.
      Separate finding: INV-2352 (Maggie's 29-Jun visit, draft_created in-app)
      is absent from Joe's Xero list — suspected deleted-in-Xero draft; the app
      never learns about Xero-side deletions. Confirm via deleted-invoices
      search before scaling the pipe.
- [ ] Stranded `processing` visits (21 found 2 Jun–15 Jul; Joe verified all
      real money was invoiced manually — stale status, not lost work): flush
      to `excluded` with a note. Root cause worth a look someday: Make marks
      processing at pickup and never writes back on failure; the zero-line
      guard (shipped since) prevents new subscription-visit strands.
- [ ] Make.com webhook URLs are `NEXT_PUBLIC_*`, baked into the public JS bundle.
      Fix: proxy through a server action/API route, drop the prefix. The hardcoded
      `JOE_NOTIFICATION_EMAIL` in lib/lead-notifications.ts moves server-side as
      part of the SAME fix (decided 26 July — not before, since the original call
      sites are client components).
- [ ] Dual lockfile (package-lock.json + pnpm-lock.yaml) — pick one
- [ ] ESLint not installed locally — `npm run lint` is broken
- [ ] Reconciliation badge wording: scope to charge_up
- [ ] Phase C: drop write-dead `properties.subscription_*` columns (after burn-in)

## PARKED (deliberately)
- [ ] **Quote conversions per month — parked 26 July; revisit after 3+ months
      of real quoting data (≈ Oct 2026).** Investigated live in prod, no build:
      `quote_drafts` has 6 rows total (earliest 1 June 2026), 2 sent, 0
      accepted, 0 declined — any report is a chart of nothing, and the metric
      is only as good as the "mark accepted" click habit, which doesn't exist
      yet. Findings for whoever builds it later:
      - **Key "sent" off `proposal_sent_at`** (stamped by Make.com on the real
        send; `quote_sent_at` mirrors it) — **NEVER off `status`**. `status`
        stays `'draft'` on sent quotes; only `proposal_status` (→ `sent`) and
        `xero_quote_status` (→ `SENT_APP`) advance. Also never `created_at`
        (unsent drafts would inflate the denominator).
      - "Accepted" = `quote_accepted_at`; three write paths (public quote page,
        manual mark-accepted button, sales-pipeline card). Email acceptances
        are lost unless someone clicks — behavioural gap, not technical.
      - Declined is barely recorded → report accepted-vs-sent counts, not a
        conversion rate, while n is tiny.
      - Pre-June 2026 quote history lives ONLY in Xero (app has no Xero read
        path) — read history in Xero's own reports; do not backfill.

Back-costing / worst-performing-jobs reports · crew billable vs non-billable hours
reporting · email sniffer for acceptance language · reply detection / auto-advance.

---
