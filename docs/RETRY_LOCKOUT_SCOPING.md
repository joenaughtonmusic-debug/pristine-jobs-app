# Complete-Visit Retry Lockout — Fix Scoping

Investigation only (26–27 July 2026). No code changed. Recommends one fix.

## The bug, precisely

`components/complete-visit-dialog.tsx` `handleSubmit` completes a visit with a
**duplicate guard up front** and then **8 unwrapped sequential writes** from the
crew member's phone — no transaction. If any write after the first fails
(flaky mobile connection, a constraint, an RLS refusal), the visit row already
exists but the job is not finished, and the guard then blocks every retry.

**The guard** (`complete-visit-dialog.tsx:252-263`):

```ts
const { data: existingVisit } = await supabase
  .from("visits").select("id").eq("scheduled_job_id", jobId).limit(1).maybeSingle()
if (existingVisit) { setError("This job has already been completed."); return }
```

It keys off **any** visit row for the job. So the moment write #1 (the visit
insert) succeeds, a retry is refused — even if writes #2–#8 never ran.

**The write sequence** (all after photo uploads to storage, which happen first
and self-clean on failure):

| # | Line | Write | On failure |
|---|------|-------|-----------|
| 1 | `:401` (`:420` fallback) | insert `visits` → `createdVisit` | aborts; nothing stranded yet |
| 2 | `:441` | insert `job_labour_entries` (primary) | **strands** — visit exists, guard now trips |
| 3 | `:486` | insert `visit_labour_entries` (all crew) | strands |
| 4 | `:502` | update `visits.hours_worked` | strands |
| 5 | `:521` | insert `job_labour_entries` (helper loop) | strands |
| 6 | `:555` | update `visits` invoice stamp (`ready_for_invoice`, `invoice_status`) | strands |
| 7 | `:588` | insert `job_photos` (walk-around) | non-blocking by design (surfaces a warning) |
| 8 | `:611` | update `scheduled_jobs.status = 'completed'` | strands |

**Why it costs money.** The invoice queue (`v_invoice_queue`) filters on
`visits.ready_for_invoice = true`, which is only stamped at write #6. A strand
anywhere in #2–#5 leaves the visit at `ready_for_invoice = false` /
`invoice_status = 'not_ready'` → it **never enters the invoice queue → never
invoices**, silently. And write #8 hasn't run, so the job still shows
`status = 'scheduled'` — it looks un-done on the schedule, the crew try again,
hit "already completed", and give up. Admin sees a "scheduled" job that's
actually finished and quietly unbilled. (This is the same shape as the 17 July
strand that reconciliation caught by hand.)

The RLS fix (migration 062) removed the *RLS* trigger for strands #2/#5, but the
lockout class is untouched: any non-RLS error (network drop mid-sequence is the
common one) still strands and locks out.

## Options

**A. Smart guard / resume path (keep the 8 writes).** Replace the blunt
"any visit exists → block" with: if the existing visit's job is
`status = 'completed'` **and** invoice-stamped → truly done, block; otherwise
it's a strand → resume the missing writes idempotently.
- *Pros:* no DB/RPC, smallest surface, directly unblocks the crew.
- *Cons:* resume must be idempotent across five tables — detecting which of the
  labour/stamp/status writes already landed is fiddly, and getting it wrong
  **double-inserts labour rows** (double-counted hours → the exact
  profitability/billing harm we're trying to prevent). Still non-atomic, so a
  resume can itself strand again. Medium risk, mostly in the idempotency logic.

**B. Compensating rollback on the client (keep the 8 writes).** On any failure,
delete what was written so a retry starts clean.
- *Pros:* logic stays in TypeScript.
- *Cons:* the rollback is itself a sequence of deletes over the same flaky
  mobile connection — it can fail partway too, leaving a *worse* half-deleted
  mess. Not atomic. **Rejected** — it re-creates the failure mode it's meant to
  cure.

**C. One transactional RPC (recommended).** Move the DB writes into a single
Postgres function called once from the dialog; all-or-nothing. Photo uploads
stay client-side before the call (storage can't join a DB transaction — they
already run first and self-clean). Keep the business logic (hours totals,
`readyInvoiceStatusForJob`, the zero-line refusal from `lib/quoted-invoicing.ts`,
materials note) computed in TypeScript and **passed into** the RPC as values, so
the function is a thin atomic writer, not a re-implementation of the rules in SQL.
- *Pros:* eliminates the strand class entirely — either the whole completion
  commits (guard then correctly blocks) or nothing is written (retry is clean).
  No lockout possible. One round-trip instead of eight → far more robust on the
  flaky mobile connections that trigger this. Runs `SECURITY DEFINER`, so it also
  sidesteps RLS. Fixes the root cause, not the symptom.
- *Cons:* biggest change — a migration (the function) plus rewiring the dialog to
  a single call, and a full staging acceptance pass (the three completion shapes
  again). The invoice-stamp's zero-line refusal currently reads back the inserted
  visit-labour lines; either compute the refusal in TS after passing lines in, or
  do that one check inside the function. Effort is real; residual risk after it
  ships is low.

## Recommendation

**Option C — the single transactional RPC.** The bug is non-atomicity; only C
removes it. A/B patch the symptom and both carry a live double-count risk on
retry (A) or a worse-mess risk (B). C is more work up front but it's the fix the
lockout actually needs, it makes completion resilient on bad connections (the
real-world trigger), and it collapses cleanly with the completion flow we already
understand. Scope when building: one migration for the function + dialog rewire +
re-run the three-shape acceptance suite on staging (return=minimal to match the
app), then a prod live-fire.

## Decision needed before building

None blocks the scoping. One choice to confirm at build time, not now:
whether the RPC is **"thin"** (writes only; TS passes in the computed
`invoice_status` incl. the zero-line refusal — my recommendation, least SQL
duplication) or **"fat"** (re-derives the invoice decision in SQL). Both are
atomic; the thin version keeps the settled billing logic in one place
(`lib/quoted-invoicing.ts`).
