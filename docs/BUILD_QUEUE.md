# BUILD QUEUE — Pristine Jobs

The ONLY tickable list. The session handoff (docs/SESSION_HANDOFF.md) points here
and must not duplicate it. Tick items here; git history is the archive.

## SHIPPED (don't rebuild)
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
- [ ] **1. Lead notifications wiring** — fire `sendLeadNotificationToJoe` from
      `app/api/public/sales-leads/route.ts` and `createManualLead` in
      `sales-pipeline/actions.ts`. Move hardcoded `JOE_NOTIFICATION_EMAIL` to env.
- [ ] **2. VA actions board clear-out** — cut the six generators (signals stay as
      badges on their own pages), migration to dismiss the auto-generated backlog
      while preserving manual rows. Board should hold only Joe's manual notes and
      capture-page items.
- [ ] **3. Capture page → VA action board** — voice note on `/capture` becomes a VA
      action + notify the VA.
- [ ] **4. Fix stale `docs/HANDOFF_for_VS_Code_Claude.md`** — it says "There is NO
      staging DB, test against PRODUCTION". False and unsafe. Also stops at PR #14.

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
- [ ] **Labour RLS bug** — completing a visit where primary worker ≠ completer, or
      with helpers, can fail partway. `job_labour_entries` RLS is "own rows or
      admin". Pre-existing, core flow, affects real multi-person jobs.
- [ ] **App audit — 8 questions** (in IDEAS.md). Start from `docs/PAGE_AUDIT.md`
      and check what's stale. Includes cost-capture redesign (overwhelming),
      new-customer capture fields, gaps in the build.

## TIER 3 — PM / body-corporate set (the sales USP)
- [ ] Rental-flagged jobs surface as rentals (trivial now the tag exists)
- [ ] **PM portal** — upcoming visits, per-property history, downloadable reports.
      BUILD LAST: only external-facing surface; displays what other features generate.
- [ ] Walk-around issues need a resolve/dismiss lifecycle (list only grows today)
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
- [ ] Arm branch 5 for Maggie + Sunhill, then ONE parallel run before retiring
      Joe's manual invoice copying. Don't retire the manual copy first.
- [ ] 9 unconfirmed subscription lines — a VA-in-UI task, NOT a SQL batch
- [ ] Xero invoice path has never fired on a real job (only test row INV-2382).
      Needs one real parallel run before it's trusted.
- [ ] Make.com webhook URLs are `NEXT_PUBLIC_*`, baked into the public JS bundle.
      Fix: proxy through a server action/API route, drop the prefix.
- [ ] Dual lockfile (package-lock.json + pnpm-lock.yaml) — pick one
- [ ] ESLint not installed locally — `npm run lint` is broken
- [ ] Reconciliation badge wording: scope to charge_up
- [ ] Phase C: drop write-dead `properties.subscription_*` columns (after burn-in)

## PARKED (deliberately)
Back-costing / worst-performing-jobs reports · crew billable vs non-billable hours
reporting · email sniffer for acceptance language · reply detection / auto-advance.

---
