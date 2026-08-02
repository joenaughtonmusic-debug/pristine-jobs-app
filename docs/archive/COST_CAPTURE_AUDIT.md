> ⚠️ **ARCHIVED / SUPERSEDED (2 Aug 2026).** The page was reworked after this audit (backfill button removed; now reads `staff_cost_rates`). For current behaviour see `docs/OPERATING_MANUAL.md`. Kept for history.

# Cost Capture Page — What It Does & A Simpler Version

Investigation only (27 July 2026). No code changed. Findings + a simplification
sketch, not a build. Two decisions for Joe are flagged at the end.

Files: `app/(app)/admin/cost-capture/page.tsx` (1,237 lines),
`app/(app)/admin/cost-capture/export/route.ts` (221 lines, CSV),
`lib/cost-capture.ts` (95 lines, the status/issue rules).

## What it actually does

A server component that lists **completed visits** and flags the ones whose
back-cost data (labour hours, materials, work notes) is missing or inconsistent,
so margin reporting can be trusted. It's the QA-and-correct surface for visit
costs. Default view: visits from 10 Jun 2026 onward, newest first, capped at 200.

**Reads:** `visits` (+ nested `scheduled_jobs → properties`), `visit_labour_entries`,
`visit_extra_charges`. Both the visits and extras queries have a **fallback
variant** that drops optional columns if the first query errors on a missing
column (`materials_review_note`, `cost_capture_override_reason`, the extras
cost/sell columns) — defensive against schema drift, ~150 lines (`:442-612`).

**Writes (server actions):**
- `updateVisitLabourEntry` / `addVisitLabourEntry` — edit/add a `visit_labour_entries`
  row, then re-derive `visits.hours_worked` from the labour rows
  (`syncVisitHoursFromLabour`, `:179`).
- `addVisitMaterialCost` — insert a `visit_extra_charges` row (with the
  legacy-quoted exclusion rule from `lib/quoted-invoicing.ts`).
- `markMaterialReviewComplete` — stamp `visits.cost_capture_reviewed_at` (+ override note).
- `markReadyForInvoice` — stamp `visits.ready_for_invoice` / `invoice_status`,
  reusing `readyInvoiceStatusForVisit` + the zero-line refusal guard.
- `backfillFallbackVisitLabour` — bulk button: for completed visits since 13 May
  with hours but no labour rows, insert a placeholder row (`staff_name "Unknown"`,
  `labour_type "fallback_backfill"`) from `visits.hours_worked`.

**Sections, top to bottom:**
1. Header — Export CSV link + "Backfill Missing Labour" button.
2. Date-range filter (start / end / include-older).
3. Error banner (if any query failed).
4. Four summary tiles — Visits checked, Need review, Labour cost, Material cost.
5. **Review Queue** — cards for visits *with* issues (max 30). Each: property,
   date, status + issue badges, an hours/labour/material/invoice grid, the staff
   materials note, and a collapsible **"Admin fixes"** block containing inline
   forms — edit each labour row, add a labour row, add a material cost, mark
   material review complete, mark ready for invoice — plus Open Job / Labour
   Reconciliation links.
6. **Back-Costing Report** — cards for *all* visits (max 50) with the margin
   breakdown: invoice amount, hours, labour cost, material cost, COGS, gross
   profit, GP margin, margin/hr.

**Status logic** (`lib/cost-capture.ts`): per visit it computes flags —
missing hours, missing labour rows, labour≠visit hours mismatch, missing work
notes, missing material review, "ready but incomplete", "invoiced but missing
back-cost data" — and collapses them to one status
(complete / missing_labour / labour_mismatch / missing_material_review /
ready_for_invoice_with_warnings). This lib is small and clean; keep it as-is.

## Where the 1,237 lines are

- **~230 lines** of inline server-action forms inside the Review Queue "Admin
  fixes" details block (`:900-1131`) — the bulk of the file.
- **~170 lines** of two near-duplicate query builders with fallback variants
  (`:442-612`).
- **~55 lines** of margin math building `costRows` (`:630-685`).
- Two card layouts (Review Queue card + Back-Costing card) repeat similar
  data-grid markup.

## Overlap with other surfaces (this is the real story)

This page re-implements logic that already lives elsewhere:
- **Hours-sync** (`syncVisitHoursFromLabour`) duplicates the complete-visit
  dialog's own hours-sync (dialog `:496-504`).
- **`markReadyForInvoice`** duplicates the dialog's invoice-stamp + zero-line
  refusal, and the **Invoices** page owns the invoice queue that consumes it.
- **Labour correction** (edit/add labour rows) overlaps **Labour Reconciliation**,
  which exists to reconcile labour hours — the page even links to it.
- **Back-Costing Report** (per-visit margin) overlaps the **Profitability** page
  (`property_profitability` view). Two different labour-cost calculations feed
  these two margin views (see below), so they can disagree.

## Concrete problems found

1. **Hardcoded labour rates that are wrong.** `getLabourRate()` (`:122`) matches
   staff by name substring with baked-in rates. A populated `staff_cost_rates`
   table exists (6 active rows) and **disagrees for 4 of 6 staff**:

   | Staff | Page hardcodes | `staff_cost_rates` | Effect on back-cost |
   |---|---|---|---|
   | Fletcher | $43 | **$38** | labour cost overstated ~13% |
   | James | $39 (fallback) | **$44** | understated ~11% |
   | Graham | $39 (fallback) | **$38** | overstated |
   | Hugh | $39 | **$38.50** | slightly overstated |
   | Charles | $39 | $39 | matches |
   | Alex | $35 | $35 | matches |

   So the margin numbers on this page are materially off for several staff, and
   it's a second source of truth for cost vs whatever profitability uses.

2. **A button that fabricates cost data.** "Backfill Missing Labour" inserts
   `Unknown` / `fallback_backfill` rows from `visits.hours_worked`. Those rows
   then read as "complete" (labour hours match) and get costed at the $39
   fallback — the visit looks reconciled but the labour is fictional (unknown
   staff, guessed rate). This is the "backfills silently mask upstream bugs"
   pattern (see the RLS-bug story) turned into a one-click action.

3. **Two margin calculations.** This page computes labour cost from hardcoded
   rates; `property_profitability` computes it differently. They can disagree
   for the same work.

4. Minor: `DEFAULT_COST_CAPTURE_START_DATE` and the rate list in the report
   caption are hardcoded literals; `money()` uses `toLocaleString` (fine in a
   pure server component, but the repo's hydration rule flags the pattern).

## What a simpler version looks like

The page conflates three jobs: **(a) a data-quality checklist**, **(b) an
inline correction console**, and **(c) a margin report**. Split them by who
needs what:

- **Keep as the core: a lean "visits needing attention" list.** Just the Review
  Queue, driven by `lib/cost-capture.ts` (unchanged) — property, date, the one
  status, the specific issues, and a single link to the place that fixes each
  issue (missing/mismatched labour → Labour Reconciliation; missing material
  review → the visit; ready-but-incomplete → Invoices). No inline forms.
- **Drop the inline "Admin fixes" forms** (~230 lines). They duplicate Labour
  Reconciliation and the invoice flow. Correcting labour in two places is how
  the two margin numbers drift. One correction surface.
- **Delete the "Backfill Missing Labour" button.** A missing labour row is a
  signal that completion failed (the exact retry-lockout / RLS strand story) —
  surface it as an issue to chase, don't paper over it with fabricated `Unknown`
  rows.
- **Fold the Back-Costing Report into Profitability**, computed once from the
  real `staff_cost_rates` table, so there's a single margin number.
- **Keep the CSV export** (genuinely useful, standalone).

Net: Cost Capture becomes a short read-only "what's not ready to bill / not
trustworthy yet, and where to fix it" list. Corrections happen on the surfaces
that own that data; margins come from one place.

## Decisions needed (flagged, not guessed)

1. **Labour cost source of truth.** Should cost calculations move to
   `staff_cost_rates` (fixing the drift above), and should the app expose a UI
   to maintain that table? This touches Profitability too. Needs Joe's call on
   which rate is correct (e.g. Fletcher $38 or $43?) before any code changes the
   numbers. → *Blocks the "one margin calculation" simplification.*
2. **The fabricating backfill.** Remove it outright, or replace it with a
   read-only "N visits missing labour" flag that links to the fix? Removing it
   changes an admin habit — Joe should confirm nobody relies on it. → *Blocks
   removing that button.*

Neither blocks writing this audit; both block the corresponding build step.
Everything else in the "simpler version" (drop inline forms, lean the list,
keep CSV) is safe to scope without a decision.
