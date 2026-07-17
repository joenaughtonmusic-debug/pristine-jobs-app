# Brief 03 — New Customer In, Quote Out

**For:** Claude in VS Code (Pristine Jobs repo)
**Date:** 17 July 2026
**Prerequisite:** Brief 02 merged and deployed. Migrations 043 + 044 live.

---

## READ THIS FIRST

**`scripts/*.sql` is not a record of the live database.** It has drifted —
`is_admin()` exists live in no migration; `properties` has 29 columns live vs six
in `001_create_schema.sql`; `033` was never applied. Verify against the live DB.
See `CLAUDE.md`.

**This brief is written from a real walk-through**, not from reading code. The
owner drove a lead through the board on 17 July and hit a wall. Everything below
is observed behaviour.

---

## The finding

**The app cannot send a quote to a customer.**

On `/admin/quotes`, both are disabled:
- **Send Quote from App** — *"Send quote workflow to be wired next."*
- **Create Xero Quote** — *"Xero quote creation to be wired next."*

Only **Copy Proposal Link** works — the owner would paste it into an email himself.

This matters because of the decision recorded in Brief 02: **quotes now originate
in the app, not Xero.** That decision is sound and stands. But the road isn't
finished.

## The diagnosis

The quote builder is **good, and built middle-first**. It has GST breakdown,
monthly-equivalent for subscriptions, internal notes separated from
customer-facing scope, terms with bank details, template pricing, and (as of
Brief 02) automatic linking to the pipeline lead. The owner's read — *"the quote
builder was actually built well, it was just hidden and I didn't use it"* — is
correct.

**It has no entrance and no exit.** You cannot get a new customer in, and you
cannot get a quote out. That is why it was never used: nobody could get a quote
through it. Fixing the two ends is this brief. **Do not redesign the middle.**

---

## The three blockers

### 1. Cannot add a new customer

**Observed:** the quote builder only offers existing customers. The owner had to
invent a property to get through the walk-through — which then left a phantom job
sitting in *Job scheduled* on the board.

This blocks **every new lead**, which is the entire point of the sales board.

**Build:** a "New customer" option in the quote builder's customer selector,
prefilled from the lead where one is linked (`sales_leads.name`, `email`,
`phone`, `address`, `suburb`, `service_needed`). The board already passes
`?lead=<id>` — use it.

Creating the customer means creating a `properties` row.

> ⚠️ **Reuse the existing conversion logic in
> `components/admin-quote-builder-client.tsx`** (the estimate→property
> conversion). Do not invent a second property-creation path — there are already
> two (`new-property-modal.tsx` and the conversion), and a third will drift.
>
> ⚠️ **Do not touch the `billing_type` logic inside it.** It writes
> `'charge_up'` for non-maintenance and `'subscription'` for maintenance. That
> write is the subject of `docs/BILLING_DOUBLE_INVOICE_AUDIT.md`, whose own
> banner says *"UNCONFIRMED — do not apply any billing fix until this is
> resolved"*, and the owner has **parked billing**. Use the logic as-is. Change
> nothing about it. If it looks wrong, it is out of scope — say so and move on.

Once the property exists, write `sales_leads.property_id` (Brief 02 added the
column; the conversion backfill was deferred — this is the natural place).

### 2. Cannot send the quote

**Build the send workflow.** The schema is already there — nothing to migrate:

```
quote_drafts.proposal_status
quote_drafts.proposal_email_subject
quote_drafts.proposal_email_body
quote_drafts.proposal_ready_to_send_at
quote_drafts.proposal_sent_at
quote_drafts.proposal_send_error
quote_drafts.public_accept_token / public_accept_url
quote_drafts.quote_sent_at
```

**Follow the proven pattern** — the same one the board's contact emails use:
the app queues, Make sends. `lib/sales-lead-templates.ts` +
`client_contact_messages` + `sendFollowUpAction` is the reference. **The app must
never send email directly.**

So: **Send Quote from App** opens a modal with a prefilled subject and body
(editable, like the contact modal), containing the `public_accept_url`. On send,
stamp `proposal_ready_to_send_at` and `proposal_status`. Make drains it.

> **This half is not a code task.** A Make.com scenario must exist to drain
> `proposal_ready_to_send_at` and send via Zoho. **The owner has to build it**,
> modelled on the existing "Schedule: Email contact" scenario. Flag this
> explicitly to him — the button will do nothing until that scenario exists, and
> he should not be surprised by silence.
>
> Write `proposal_send_error` back on failure so it's visible in the app rather
> than only in Make.

**Leave `Create Xero Quote` alone.** Quotes originate in the app now — a Xero
quote is redundant. Don't wire it. Consider hiding the button so it stops looking
broken. Ask before removing anything.

### 3. Cannot preview

**Observed:** *"Quote draft saved but no preview… marked quote sent but never saw
means of sending or quote."* The owner has still never seen what a customer sees
— which is the one thing he set out to judge.

**This may be nearly free.** `app/public/quote/[token]/page.tsx` already renders
the customer-facing proposal, and `public_accept_url` already exists (Copy
Proposal Link proves it). A **Preview** button that opens that URL in a new tab
may be the whole feature.

Check whether the token/URL is populated at draft stage or only on send. If only
on send, that's the actual bug — the owner can't see the quote before committing
to it, which is why nobody trusts the builder.

**Do not build a second renderer.** The public page is the preview.

---

## Explicitly out of scope

The owner raised these in the same walk-through. They are **real** and
**recorded** — but they are not this brief. Do not drift into them.

**Brief 04 — the sold→scheduled seam:**
- The "Schedule job" modal tells him to *go to the quote builder* rather than
  doing anything. He dislikes it, correctly — it's an instruction, not an action.
- He wants the existing add-property/schedule modal reused, with staff assignment
  and auto-suggested team members.
- `Mark Recurring Invoice Set Up` needs work.
- Once scheduled, the board card should show the day and time.

**Polish, later:**
- Service choice not carrying from the Create-quote modal into the builder
  (Brief 02 scoped template auto-suggest — check whether this is that, partly done).
- Having to leave the pipeline window at all; he wants to stay on the board.
- Follow-up faint-button + snooze (deferred from Brief 02).
- Invoiced-section lead join (deferred from Brief 02).

**Not a bug:** a job stuck in *Job scheduled* on the board. That's the phantom the
owner created to work around blocker 1. It should be cleaned up — ask him which
lead/property/job to remove rather than guessing.

**Billing.** Parked. Not yours. Not even in passing.

---

## Constraints

- Numbered migration in `scripts/` only if one is genuinely needed — this brief
  should need **no schema change**. If you think it does, stop and ask.
- Transaction-wrap anything that does touch the DB.
- Branch, PR to `main`. **Production deploys from `main`** — a green branch means
  nothing until merged.
- Clean up test rows. Two agents have left live artefacts in this production
  database already.
- Test as admin **and** as staff. Staff can't write leads or properties post-041;
  make sure that's a clean refusal, not a crash.
- If the Supabase schema cache goes stale after any change, the fix is
  `NOTIFY pgrst, 'reload schema';` in the SQL editor.

---

## The acceptance test

Not "the buttons work." This:

> **The owner sends a real quote, from the app, to a real new customer, and sees
> what they see before he sends it.**

That has never happened. Every previous quote went out from Xero.

When it works, the remaining Phase 2 test still stands: accept via the public
link → schedule → complete → **a real Xero invoice via Make, traced back to a
real lead.** Also never happened — once, for a test (INV-2382), never for a real
job.
