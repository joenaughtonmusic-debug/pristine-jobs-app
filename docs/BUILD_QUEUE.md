# BUILD QUEUE — Pristine Jobs

The ONLY tickable list. The session handoff (docs/SESSION_HANDOFF.md) points here
and must not duplicate it. Tick items here; git history is the archive.

## NEXT UP — one-line fix, live-fire to verify
- [x] **Property client email not editable in UI — SHIPPED 28 July (PR #59).**
      Client Email + Client Phone fields added to the property edit dialog
      (both save on edit AND add; empty saves NULL; add-mode resets both —
      review caught stale values leaking into new properties). Live column is
      `phone`, NOT client_phone. Staging browser live-fire passed, DB-verified.
- [x] **Guarded admin-only lead delete — SHIPPED 28 July (PR #60, migration
      072 staging+prod).** Soft delete (`deleted_at`/`deleted_by` on
      sales_leads): red Delete button + confirm on the expanded card; deleted
      leads hidden from the board and from lead-intake duplicate matching,
      recoverable via DB (no restore UI by design). Confirm copy steers real
      customers to Mark lost so reporting stays honest. Board leads-query
      errors now render a visible banner, never an empty board. Staging
      browser live-fire passed end-to-end.
- [~] **Website contact-form spam (WordPress theme repo, NOT this app).**
      The form is the custom pgv2 plugin, NOT Contact Form 7. Honeypot +
      per-IP rate limit (0.21.2) are being beaten. Cloudflare Turnstile is
      ALREADY CODED in the theme repo (0.22.0 + 0.22.1 script-URL fix, off
      until keys are set) — REMAINING: Joe creates the Turnstile keys and
      turns it on. Pairs with lead delete above for the spam already landed.
- [x] **Comms-reply webhook env var — MOOT, closed 26 July.** The comms page
      bin proceeded (branch comms-page-bin), so Send Reply no longer exists.
      Never add `NEXT_PUBLIC_SEND_COMMUNICATION_REPLY_WEBHOOK_URL` to Vercel.

- [x] **Labour-recon misc-work window gap** — SHIPPED 27 July (PR #51). Amber
      banner counts unlinked misc entries (job_type=misc, no scheduled_job_id)
      dated before the current window, names the oldest, links to a widened
      window. Surface only. Staging-verified.

- [x] **Notification Link field relative path** — SHIPPED 27 July (PR #51).
      Full URL via NEXT_PUBLIC_APP_URL; server-side callers (website-lead
      route) had no window.origin so relative paths leaked. Verified at a
      capture webhook. Tier 5 proxy item still separate.
- [x] **VA actions board clear-out (Tier 1 item 2)** — SHIPPED 26 July, PR #37
      + migration 061 (staging 255 / prod 195 rows dismissed, zero refill).



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
      live-fired through real prod triage; VA CONFIRMED the notification
      email arrived (28 July) — chain proven at every link. All 4 early
      captures were Joe's tests; the Kennards test action dismissed 28 July,
      board starts clean. Only VA-task-shaped recordings reach the board
      (triage type annoying_task); other captures stay in the capture list.
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
      STATUS 28 July: still PARKED, and RETRY-LOCKOUT HAS ZERO CONFIRMED COST
      IN PROD. Investigation found 6 charge_up visits stuck at not_ready with
      job status completed (Sue Good 24 Jul, McLean 23 Jul, Natalie 23 Jun,
      McLean 17 Jun, Diana 12 Jun, McLean 29 Apr) — Joe checked ALL SIX in
      Xero: every one was invoiced MANUALLY. So the "stuck not_ready + job
      completed" signature indicates MANUAL HANDLING, not retry-lockout
      damage — do not read it as lost money. Those 6 flushed to 'excluded'
      28 July (same treatment as the 21 stranded 'processing' on 27 July); the
      3 subscription visits with that signature (AR34, POWELL17, SH15) left as
      not_ready (correct — subscription isn't app-invoiced). ALSO: migration
      062 (labour RLS) remains UNPROVEN in the wild — no paired-crew
      completion on prod since it shipped 26 July (last pair was 17 Jul
      Alex+Graham, pre-062). Keep this RPC parked until a real pair completes
      a paired visit through the app and proves 062.
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
- [x] **2b. Office review/send UI** — SHIPPED (PR #48 merged 27 July). `/admin/pm-reports`:
      To send queue + Sent section; per-issue editable notes (saved to
      job_photos.caption, engine reads fresh at send = review-before-send);
      two-step confirm Send; re-send warns with prior date; no-PM-email rows
      warn instead of send. Signed URL TTL now 4h (was 7d). Per-issue exclusion
      deferred to piece 3 by decision. Staging live-verified end-to-end.
- [x] **PM report copy amendments** — SHIPPED 27 July (PR #51), prod-live-fired.
      (a) contact@ footer (was admin@). (b) Reference number PG-YYYY-NNNN
      (migration 067): global sequence, never year-resets, ONE VISIT = ONE REF
      (a re-send reuses the visit's ref — enforced by lookup-before-mint, so
      report_ref is deliberately NOT unique across the history rows). In subject
      + PDF header + webhook payload + pm_reports row. Prod live fire:
      PG-2026-0001 on both a send and a re-send (reuse proven); sequence reset
      after so the first REAL report is PG-2026-0001.
- [x] **Prod grant bug (migration 068)** — SHIPPED 27 July. property_managers
      (063), pm_reports (064), property_billing_lines (057-059) had RLS but no
      `authenticated` grant on prod → browser reads errored "permission
      denied"; staging hid it (auto-grant) and prod paths used service role
      (bypass). 068 grants authenticated + revokes anon (closed a staging
      world-readable hole). **ACTION FOR JOE: re-enter real property managers**
      — none ever persisted on prod (silent INSERT-denied). LESSON in
      SESSION_HANDOFF: live-fire new-table features through a real browser/authed
      session on PROD, not just staging or service-role paths.
- [x] **Grant-hygiene sweep + anon revoke (migration 069)** — SHIPPED 28 July,
      prod+staging. Full read-only sweep (all 35 tables, both DBs, queried AS
      the anon role): post-068 NO table lacks the authenticated grant; the ONLY
      table anon can actually read is public_suburb_locations (intended public
      map feed, 63 rows). 7 tables carried a vestigial anon grant that RLS
      already default-denied (calendar_blockouts, job_board_items,
      job_board_responses, job_photos, profiles, sales_leads, scheduling_queue)
      — 069 revokes anon on those 7 (both DBs), leaving public_suburb_locations
      and all authenticated grants alone. Behaviour no-op (verified anon read 0
      before, DENIED after; authenticated unchanged). Post-apply re-verified the
      app via a real PROD browser session (temp admin, self-cleaned): /admin,
      /sales-pipeline, /admin/job-board, /admin/schedule all render. No
      genuine anon write exposure existed (only 1 anon/public policy in the
      whole schema, SELECT on public_suburb_locations).
- [x] **3. Walk-around resolve/dismiss lifecycle** — SHIPPED (PR #49 merged
      27 July, migrations 065 + 066 on prod). Four states as locked; status set
      from the property dialog only (select + note + confirm); badge, dialog,
      PM-reports queue and report engine all filter to `open`;
      `reported_to_pm_at` stamped on exactly the issues a successful send
      included (stamp failure surfaces as warning + pm_reports.error, never a
      fake send-failure). Staging-live-verified end-to-end incl. the PDF
      containing only open issues. Also in #49: "Lawn mowing" misc work type
      (066 extends the work_type CHECK — scripts/ didn't show the constraint;
      live DB did).

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
- [~] **Photo attach to Xero invoices — Part A+B BUILT (PR, staging-verified);
      Part C (Make) + live-fire are Joe's.** Brief: docs/INVOICE_PHOTO_ATTACH_BRIEF.md.
      Allowlist view `invoice_photos_for_make` (migration 071) = photo_type IN
      ('after','completion'), jpg/png only, 3 most-recent per scheduled_job_id,
      filename photo-<photo_id>.jpg, service-role only. Client resize at upload
      (lib/resize-image.ts, ~1600px JPEG q80, best-effort, forward-only — NO
      backfill; existing full-size photos stay, hence the view's jpg/png filter).
      Acceptance test 1 PASSED on staging (issue+after/completion → view returns
      only after/completion; issue/HEIC/client_instruction excluded). Resize
      verified 3000px→1600 JPEG; complete-visit 8-write sequence confirmed intact
      (resize is onChange-only, submit untouched). REMAINING (Joe): extend the
      "Pristine App to Xero Invoice" Make scenario with the attach branch at
      draft time (IncludeOnline=true), VERIFY Xero attachment ceilings +
      IncludeOnline on the live module, then the end-to-end live-fire.
      KNOWN LIMIT (deferred): association is job-level (scheduled_job_id), so a
      recurring job's 3 most-recent attach to each visit's invoice; per-visit
      visit_id preference is a later refinement, not built.
- [ ] Billing type fix for the 88 mislabelled `charge_up` properties — BLOCKED on
      Joe identifying which are genuinely fixed-price. Not a code problem.
- [ ] Voice-to-quote integration — design brief written, nothing built.
- [ ] 48h follow-up "F" flag on sent quotes — a BADGE, not an actions row
- [ ] Billing-change audit log (who, when, from → to)
- [ ] Verify: is billing method locked when a job comes from a quote?
- [ ] Billing type mandatory on property at creation (no default); jobs inherit
- [ ] Quote export (clipboard or CSV) · quote log book · crew runbook
      (lead delete SHIPPED 28 July — see NEXT UP)
- [ ] Calendly-style booking slots with geography clustering (respect the GCal
      boundary — this is its own scoping job)

## TIER 5 — housekeeping
- [x] Leftover PROD admin `item3-verify@example.com` — DELETED 27 July (auth
      user + profile). Full prod auth sweep + re-verification: 8 accounts, no
      test-shaped addresses, no orphans either direction. RULE (in
      SESSION_HANDOFF): leftover test accounts get deleted, not reused.
- [ ] **pristinegardens006@gmail.com — Joe RULED keep (it's Charles's) but the
      link is BLOCKED on a conflict:** Charles's staff_members row is ALREADY
      linked to pristine528@gmail.com (active login, last sign-in 15 July).
      Joe to rule which is really Charles's: if 006, re-point the staff row
      (and decide what pristine528 is); if pristine528, then 006 is NOT
      Charles's and goes back to delete-or-keep. No write made.
- [x] **Maggie + Sunhill fixed-price parallel run — CLOSED 27 July, both
      proven on the fixed pipeline.** Sunhill: router gap fixed → INV-2410
      (1 × $84.50 "Lawn mowing — 15 Sunhill Road — 2026-07-27"), garden line
      correctly excluded, xero_contact_id 2da711c6-… written back, confirmed
      by Joe. Maggie: stale INV-2409 (printed 2026-07-26; generated
      pre-repair) deleted in Xero → visit reset → regenerated as INV-2411
      printing 2026-07-27, 1 × $149 — proves the raw-PATCH conversion on both
      create and write-back. Root cause of the Sunhill dead-end: router 45's
      condition on {{3.billing_type}} from the properties lookup
      (invoice_method was already available at module 49). Fixed by Joe in the
      Make UI: route 1 = billing_type != subscription OR invoice_method =
      fixed_recurring; route 2 adds invoice_method != fixed_recurring. The
      v_invoice_queue/invoice_method migration was CANCELLED — module 1 reads
      the visits TABLE directly (ready_for_invoice + status 'ready'), never
      the view. STANDING NOTE: module 48 stamps 'invoiced' with NO invoice
      created — a wrongly subscription-tagged property silently never bills.
- [ ] **9 unconfirmed subscription lines (bucket 4 of the 28-Jul billing
      audit — docs/BILLING_AUDIT_20260728.csv)** — VA-in-UI task with Joe's
      27-Jul test: Xero repeating invoice EXISTS → leave as subscription and
      tick the confirmation; NONE exists → re-express as a fixed_recurring
      per-visit line like Maggie's. Members: McDonalds ×4, Powell St, 34B
      Armadale, 58 Allendale, 747 Remuera, 5 Locarno. 5 Locarno already RULED
      genuine subscription (repeating invoice, $90/visit × 2 per quarter,
      nothing unbilled) — leave billing_type, its NULL line amount stays in
      this task.
- [x] **Trevor (75 Pah Rd, Howick) — property marked INACTIVE 27 July** (Joe's
      ruling: no work done, none intended; was the audit's only
      active-with-no-billing-line property).
- [x] **Non_billable invoice guard — SHIPPED 28 July (PR #61, migration 073
      staging+prod).** The 28-Jul verification found the guard DID NOT EXIST
      (crew dialog stamped ready with no billing check; the view's visit
      branches didn't exclude non_billable) but zero prod exposure (0
      non_billable jobs ever). Fix, two independent layers, deploy-order
      safe: (a) readyInvoiceStatusForJob returns 'excluded' for non_billable
      — single choke point behind all 3 ready-stamp paths, and cost-capture's
      extras insert now uses it too; (b) 073: the view emits NOTHING for
      non_billable — both visit branches AND the extras branch (review catch:
      a 'ready' extra charge was the one line still emitted, enough to pass
      the zero-line guard). Staging acceptance 4/4 incl. charge_up /
      fixed_recurring / legacy-quoted controls unchanged.
      ⚠️ CORRECTION of this entry's earlier text + STANDING LESSON: the live
      view did NOT "match script 049" — it had a 5th fixed_recurring branch
      and wider exclusions that exist only live (a substring grep had
      "confirmed" the match). The 049-built first cut of 073 clobbered that
      branch on STAGING; caught by diffing pg_get_viewdef against prod
      before prod was touched. 073's body is the live prod viewdef verbatim;
      when replacing ANY view, diff pg_get_viewdef live-vs-live, never trust
      scripts/ or a substring check.
- [ ] **Extras flow for fixed-price invoices** — petrol/greenwaste etc. as
      visit_extra_charges lines appended under the fixed line; the view
      already supports it (sort_order 10); needs the office add-extras flow.
- [ ] **Consolidate the three overlapping paid/sent Make scenarios — DEFERRED
      behind a burn-in period (Joe, 27 July).** The raw-PATCH conversion was
      accepted on inference, not a controlled test; let it run clean for a
      while before restructuring the scenarios.
- [ ] **Nothing propagates Xero deletions/voids back into the app** (verified
      28 Jul, read-only): no Xero webhook receiver exists (4 API routes, none
      Xero); the app has no 'deleted'/'voided' status concept
      (normalizeInvoiceStatus maps draft/created/authorized/invoiced only);
      the Make watchers route on paid/sent transitions, and Xero's own
      list-invoices excludes deleted drafts, so a deletion is INVISIBLE to
      every layer. Proven twice for real: INV-2352 and INV-2409 both left
      permanent draft_created stamps cleared by hand. Consequence: a deleted
      draft's visit is never re-polled (Make only reads 'ready') → silently
      unbilled — same class as module 48. Current exposure: 24 draft_created
      + 1 authorised + 5 sent = 30 visits. No fix proposed yet per Joe.
- [x] ~~"Xero invoice path has never fired on a real job"~~ — WRONG since at
      least 7 July: the pipe has created real drafts continuously (INV-2367 →
      INV-2409, several PAID). Corrected 27 July; Joe had been planning around
      the stale claim.
- [x] **visit_date corruption repair — DONE 27 July (UPDATE 108, all guards
      held; today's MR1+SH15 visits verified back on the 27th).** By Joe's
      decision the 8 extreme rows (pre-app 2025 invoices, already paid) were
      SKIPPED deliberately — their old dates stand; the 2 April setup rows were
      left as-is. Original finding: Make's visits-upserts round-tripped `visit_date` through
      its timezone handling, shifting it −1 day PER TOUCH (repeat-touching
      payment watcher → drift up to 26 days; all 121 Make-touched visits
      affected, 0 untouched ones). Fixed at source 27 July: all 12 modules
      across 3 scenarios converted to raw-PATCH (only changed fields; pattern
      from "Xero: Invoice Paid update" module 6) — NOTE this was accepted on
      inference (121/121 shifted vs 16/16 clean + updated_at matching the run),
      NOT a controlled single-row test; if the repair ever looks wrong, revisit
      that assumption first. Repair script: scripts/repair_visit_dates_20260727.sql
      — 108 rows, ID-keyed, before-value-guarded, anchored to crew labour dates
      (which equal NZ creation dates on every row — two independent anchors).
      Excluded for eyeball: 8 extreme rows (before-dates Oct–Dec 2025 — if
      those were deliberate catch-up invoices for pre-app work, their old dates
      are REAL and must not be repaired) + 4 no-labour rows (2 are
      TEST-ALPHA-UI debris — delete not repair; SG21 + SS1 April setup rows).
- [x] **TEST-ALPHA-UI property — DELETED from prod 27 July** (property, 2
      visits, 2 jobs, labour row, billing line, 2 dismissed admin_actions;
      FK-checked, transactional, verified zero remaining).
- [x] **INV-2352 — CLOSED 27 July.** Joe had deleted it in Xero and re-issued
      as INV-2408 (29 June garden maintenance, $184). Not a write-back bug.
      INV-2408 and INV-2411 are different visits — nothing to void.
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
- [ ] **Make "Communication: Hub" revival fix (do NOT do — comms page binned
      26 July):** if ever revived, route 2 (AI branch, modules 4→5→2) has no
      filter → double insert → 409s → Make auto-deactivated 17 July. Fix =
      make route 2 a FALLBACK route (one Make setting). All four branches
      insert hardcoded user_id 5d75a454-7dd8-432e-b7c7-560fddfcac91.
- [ ] **Placeholder staff rows "Temp Worker" and "Estimator"** (no auth, active)
      — parked by Joe 27 July. Related finding, unruled: a staff row named
      "Test Staff" (casual, ACTIVE) is linked to Joe's own admin auth account
      (pristinegardensnz) — test debris in staff_members; rule on it next pass.
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
