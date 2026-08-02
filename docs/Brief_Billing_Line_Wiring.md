# Brief: wire billing lines into scheduling & invoicing

**Status:** DRAFT for Joe's approval. Nothing built yet — this changes how jobs
get priced, so it's plan-first.
**Written:** 2 Aug 2026.
**Origin:** the "make invoicing easier / standardised" thread, and Joe's
16 Cathedral Place example (fixed visit costs + 2-monthly maintenance where
hours are recorded but don't drive the bill + a 6-monthly fixed spray — but the
whole job got recorded as one).

---

## The one-paragraph version

The database already has the right shape for "a property has several priced job
types" (`property_billing_lines`), and a scheduled job already has the fields to
carry a fixed price (`fixed_visit_amount`, `fixed_visit_label`). But nothing
connects them: you can't set those lines up from the app, the scheduler ignores
them, and the fixed-price fields on a job are dead (no code reads or writes
them). So a property like Cathedral Place can't be scheduled as "this visit is
the spray, that visit is the maintenance" — it all lands as one charge-up job.
This brief wires the pieces together in four stages so a visit inherits its
price and billing behaviour from the property's billing line for that job type.

---

## What's actually true today (verified against the live prod DB + code)

**`property_billing_lines`** — 96 rows across 93 properties. Columns:
`property_id`, `job_type`, `billing_mode`, `subscription_amount`,
`subscription_invoice_confirmed_at/by`, `active`.
- `billing_mode` is one of **`charge_up`** (83 lines), **`subscription`** (10),
  **`fixed_recurring`** (3).
- `subscription_amount` holds the price. It's populated on all 3 fixed_recurring
  lines and 1 subscription line. (The column name says "subscription" but it's
  really the fixed amount for both fixed modes — noted under Decisions.)
- **`job_type` is free text and inconsistent.** Live values right now:
  `maintenance`, `one_off`, `Lawn mowing`, `Regular 2 monthly garden
  maintenance visits`. So the lines don't speak the same vocabulary as the
  scheduler, which uses a fixed list (`one_off`, `maintenance`, `lawn_mowing`,
  `landscaping`).

**`scheduled_jobs`** already has **`fixed_visit_amount`** and
**`fixed_visit_label`** columns — but only 2 of 195 jobs use them, and
**no TypeScript reads or writes them anywhere.** They're orphaned columns.

**The schedule page** (`app/(app)/admin/schedule/page.tsx`) loads only
`billing_mode` from a property's lines and rolls it up to a property-level set
of modes. It drops `job_type` and `subscription_amount` — so the scheduler has
no way to know a line's price.

**The Quick Add modal** (`components/admin-schedule-client.tsx`) picks `job_type`
from a hard-coded list disconnected from the property's real lines, and on save
sets `invoice_method`, `billing_mode` (from the quote/template, else defaults to
`charge_up`), `job_type`, `quoted_amount`. It never touches the fixed-price
fields.

**The property dialog** (`components/property-dialog.tsx`) only manages the
subscription *confirmation* tick and writes a default `charge_up` line. There's
**no UI to add a `fixed_recurring` line** (job type + fixed price). The 3 that
exist were created by migration/hand, not through the app.

**Cathedral Place (CP16)** in the live data: `billing_type = charge_up`, and it
has exactly **one** line — `maintenance / charge_up / no amount`. The three
lines Joe described don't exist. That's the whole reason the recent visit
collapsed into one job: there was nothing to schedule against.

---

## Why this is the fix (not a rebuild)

The model is already correct and settled (migrations 057–059, the per-line
billing identity). This is pure wiring plus two small UIs. We are **not**
touching the settled billing rules (charge_up = per visit, frequency never a
divisor, no silent defaults). We're making the existing fields reachable.

---

## Proposed change — four stages

### Stage 1 — Standardise the job-type vocabulary (plumbing)
Agree one canonical set of job types and use it everywhere (billing lines,
scheduler, job-speed tags). Migrate the free-text line values onto it
(`Lawn mowing` → `lawn_mowing`, the long maintenance label → a proper type).
Without this, a scheduled `job_type` can never reliably match a line's
`job_type`, so nothing downstream can inherit.

### Stage 2 — Manage billing lines on a property (property dialog)
Add a small "Billing lines" section to the property edit window: add/edit/retire
lines, each with **job type**, **billing mode** (Charge up / Subscription /
Fixed per visit), and a **fixed price** field shown only for the two fixed modes.
This is what lets Joe set up Cathedral's three lines himself. Keep the existing
subscription-confirmation tick per subscription/fixed_recurring line.

### Stage 3 — Scheduling inherits from the line
In Quick Add, once a property and job type are chosen, look up the matching
active billing line and pre-fill:
- `billing_mode` and `invoice_method` from the line (keeping the existing
  mismatch guard and charge_up's deliberate no-default),
- for a `fixed_recurring` line, set `fixed_visit_amount` and `fixed_visit_label`
  from the line so the visit is priced at the fixed amount. **Hours are still
  recorded** (for costing/profitability) but don't drive the invoice.
Operator can still override; nothing becomes silent or automatic.

### Stage 4 — Invoicing emits the fixed line
Make the invoice feed produce a single fixed line (label + `fixed_visit_amount`,
hours ignored) for a `fixed_recurring` visit. **To verify first:** the live
`invoice_line_items_for_make` view already has a fixed_recurring branch — I need
to dump the live view definition and confirm it reads the job/line fixed price
before changing anything (the 073 near-miss rule: diff live-vs-live, never build
a view from `scripts/`).

---

## Decisions I need from Joe before building

1. **The canonical job-type list.** What are the standard types? My starting
   proposal: `maintenance`, `lawn_mowing`, `one_off`, `spray`, `landscaping`.
   (Cathedral needs a `spray` type; the current data has no clean one.)
2. **Cathedral's three lines** — confirm the exact set so it's the worked
   example: e.g. maintenance (fixed per visit? or charge-up with hours?), the
   6-monthly spray (fixed price = ?), and any fixed visit cost. What are the
   prices and frequencies?
3. **"Record hours but don't bill"** — confirm those hours should still flow to
   Profitability as cost (yes, I assume), just not to the invoice.
4. **`subscription_amount` rename** — optional. It's really "fixed amount per
   visit" for both fixed modes. Rename to `unit_amount` (clean expand/contract
   migration) or leave the name and just document it? Leaving it is fine.

## Risks
- This is the money path. Same discipline as always: staging rehearsal, live-vs-
  live view diff, transactional migration with post-checks, your OK before prod.
- The double-bill history came from silent fallbacks — every inheritance here is
  a *prefill the operator can see and change*, never a silent write.

## Acceptance tests
1. Set up Cathedral's 3 lines from the property dialog; they persist and show.
2. Schedule a spray visit at Cathedral → job carries the spray fixed price;
   completing it records hours but the invoice preview shows the fixed spray
   amount, not hours × rate.
3. Schedule a maintenance visit at Cathedral → its own line/behaviour, separate
   from the spray.
4. A normal charge_up property is completely unchanged (per-visit, hours-based).
5. Invoice preview + Make feed show the correct fixed line for fixed_recurring
   and the correct hourly line for charge_up.
6. `npx tsc --noEmit` clean; verified on a real staging run end-to-end.
