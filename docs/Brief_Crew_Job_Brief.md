# Brief — Quote scope + materials land on the scheduled job (the "Crew Brief" / Team View)

## The goal in one sentence
When a job is scheduled from an accepted quote, the quote's **customer-facing scope**
and its **materials** should be carried onto the scheduled job, so the crew can see
**what they're doing and what to bring** when they're on the job.

## Why now
The sold→scheduled seam (PR #13) already links the scheduled job to its quote
(`quote_drafts.first_scheduled_job_id`, and the job carries `quoted_scope`,
`invoice_method`, `quoted_amount`). So the connection exists — this brief is about
making sure the **scope and the materials** actually flow across and are **visible
to the crew** on their job view, not just stored.

## What to build

### 1. Carry scope + materials from quote → scheduled job
When a job is created from an accepted quote (the schedule flow built in PR #13):
- The quote's **customer-facing scope** should populate the job's scope/notes field
  (some of this may already happen via `quoted_scope` — CHECK what's already
  carried before adding anything, per the usual "look at the live thing first"
  rule).
- The quote's **materials** — the line items that are materials/plants/consumables,
  or a dedicated "included materials" field if one exists on the quote — should
  land on the job in a form the crew can read as a "bring these" list.

**Investigate first, then report before building:**
- What does the scheduled job ALREADY receive from the quote today? (scope? any
  materials? just the amount?) The schedule modal already showed an "Included
  Materials" field and a "Quoted Scope / Job Notes" field — so some of this
  structure may already exist. Confirm what's populated automatically vs left blank.
- Where do "materials" live on a quote? Line items with a materials category?
  A separate field? This determines what we copy.

### 2. Make it visible to the crew
The crew sees jobs on their staff jobs view / Team Board. The scope and materials
need to show **there**, on the job the crew actually opens — not only in the admin
schedule. Confirm where the crew views a job and ensure scope + materials render on
that view.

## Deliberate scope boundaries (respect these — anti-over-build)
- **This is a STARTING brief, not a full crew runbook.** The owner's real "Team
  View" is richer than the customer scope — it includes crew sequence, site risks,
  tools, order of operations (see the Sandspit example in Backlog_Notes). We are
  NOT building that here. We're carrying across what the quote already knows (scope
  + materials) so the crew has a baseline. The owner adds crew-specific notes on top
  manually. **Do not build a structured crew-sequence / site-risk / tools system in
  this brief** — that's a separate, bigger piece.
- Don't invent new data the quote doesn't have. Carry what exists; don't build a
  new materials-entry system unless the investigation shows materials aren't
  captured anywhere (in which case, report that as a finding, don't silently build
  it).
- No changes to pricing, invoicing, or the scheduling seam itself — this is purely
  about surfacing scope + materials on the job for the crew.

## Acceptance check
- Schedule a job from an accepted quote → open that job as the crew would → the
  customer scope and the materials list are visible there.
- Nothing about pricing, invoicing, or card-advancement changes.
- Report what was already flowing vs what this brief added.

## Process
- Show the plan before building. Lead with what the job ALREADY receives from the
  quote today (investigation result), so we don't rebuild existing plumbing.
- Verify against the live DB / a real scheduled job, not just typecheck.
