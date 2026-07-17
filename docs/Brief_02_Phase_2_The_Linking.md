# Brief 02 — Phase 2: The Linking

**For:** Claude in VS Code (Pristine Jobs repo)
**Date:** 17 July 2026
**Prerequisite:** Brief 01 complete (041 + 042 applied, gate live). Confirmed.

---

## READ THIS FIRST

**`scripts/*.sql` is not a record of the live database.** Migrations are pasted
into the SQL editor by hand and the folder has drifted. `is_admin()` exists live
in no migration. `properties` has 29 columns live; `001_create_schema.sql`
creates six. `033` was never applied. `scheduling_queue` reads like a report but
is a table.

**Every schema fact in this brief was read from the live database on 17 July 2026.**
Where this brief and `scripts/` disagree, this brief is right. If you need a
column that isn't listed here, stop and ask.

**Do not trust `visits.xero_invoice_number`.** It contains at least one invoice
number (INV-2295) that does not exist in Xero. It is not a reliable signal for
anything. Use `scheduled_jobs.xero_invoice_number`.

---

## The problem in one line

`sales_leads` has **zero foreign keys**. It is the only island in an otherwise
fully-wired schema.

## The insight that makes this small

`quote_drafts` already carries the whole downstream chain:

```
quote_drafts.property_id            -> properties.id
quote_drafts.scheduled_job_id       -> scheduled_jobs.id
quote_drafts.first_scheduled_job_id -> scheduled_jobs.id
quote_drafts.estimate_id            -> estimates.id
```

And `scheduled_jobs` carries the invoice:
`xero_invoice_id`, `xero_invoice_number`, `xero_invoice_status`,
`invoice_paid_in_app_at`, `invoice_archived_at`.

So **one link — lead → quote — inherits property, job, and invoice for free.**
A second, lead → property, is needed only for add-existing-customer, which
enters at Visit booked with no quote yet.

**Two columns. Not three.** Don't add a job link — it would be a third path to
the same row and they will drift.

---

## The migration

`scripts/043_link_sales_leads.sql`. Transaction-wrapped (`BEGIN;`/`COMMIT;` —
041's failure mode is instructive).

```sql
ALTER TABLE sales_leads
  ADD COLUMN property_id    uuid REFERENCES properties(id),
  ADD COLUMN quote_draft_id uuid REFERENCES quote_drafts(id);

CREATE INDEX ON sales_leads (property_id);
CREATE INDEX ON sales_leads (quote_draft_id);
```

Both nullable — a new website lead has neither.

**No backfill.** `sales_leads` has 0 rows as of 15 July. Verify that's still true
before assuming it.

**RLS:** 041 gave `sales_leads` `authenticated SELECT, admin write`. New columns
inherit table policies — nothing to add. But see the stale-comment note below.

---

## What to build

### 1. Add existing customer — trivial, do it first

`components/add-existing-customer.tsx` → `createExistingCustomerLead(propertyId, input)`
in `app/(app)/sales-pipeline/actions.ts` → `buildExistingCustomerLeadRow()` in
`lib/sales-lead-manual.ts`.

The action **already receives `propertyId`** and already fetches the property
server-side from trusted data. It copies `client_name` / `client_email` / `phone`
/ `suburb` / `address_line_1` into the lead's text fields and throws the ID away.

Set `property_id` on the row. That's the whole change. Start here — it proves the
column end-to-end in about ten lines.

### 2. Create quote — the real work

Currently deep-links to the quote builder. It should create the `quote_drafts`
row and store `quote_draft_id` back on the lead.

Prefill from the lead: `name`, `email`, `address`, `suburb`, `service_needed`,
`message`. Note `quote_drafts.customer_name` and `quote_title` are both `NOT NULL`.

**`quote_drafts.quote_type`** is `NOT NULL DEFAULT 'one_off'`, CHECK
`('maintenance','one_off','landscaping')`. The lead has no equivalent field —
decide whether the user picks it at creation or it defaults. Ask before assuming.

**If the lead has `property_id`** (came via add-existing-customer), carry it onto
`quote_drafts.property_id`. Don't make the user re-pick a property we know.

### 3. Invoiced section — currently empty

`components/invoiced-jobs-section.tsx`. The join is now:

```
sales_leads.quote_draft_id
  -> quote_drafts.first_scheduled_job_id (or .scheduled_job_id — see below)
    -> scheduled_jobs.xero_invoice_number / xero_invoice_status
                     / invoice_paid_in_app_at / invoice_archived_at
```

**⚠️ `quote_drafts` has two job links** — `scheduled_job_id` and
`first_scheduled_job_id`, both FKs to `scheduled_jobs.id`. I don't know which is
authoritative. **Read the code before choosing**, and say which you picked and
why. Guessing here produces a section that's subtly wrong rather than obviously
empty, which is worse.

The app-only paid checkbox and clear-paid archive already exist and must keep
working. `invoice_paid_in_app_at` does **not** touch Xero — don't change that.

### 4. Backfill `property_id` on conversion

When a quote is accepted and a property is created, the lead should end up with
`property_id` set — not only `quote_draft_id`. Otherwise leads that arrived from
the website never get a property link, and every property lookup goes through the
quote.

The property is created in the estimate→property conversion in
`components/admin-quote-builder-client.tsx`. Find where an accepted quote becomes
a property and write `sales_leads.property_id` at the same time.

**Note:** that same function contains the `billing_type: 'charge_up'` write that
the billing audit is about. **Do not touch it.** Billing is parked by the owner
and the audit's premise is unconfirmed. Add the link, change nothing else.

### 5. The prize — the Xero path for a real job

**The Phase 0 invoice engine has fired exactly once, for a test (INV-2382).**
Never for a real job. Everything above exists to make this possible.

Once 1–4 work, walk one real lead the whole way: lead → contact → visit → quote →
accept → schedule → complete → invoice. Confirm Make builds the Xero invoice at
SUBMITTED and the invoiced section shows it.

**This is the acceptance test for Phase 2.** Not "the columns exist" — a real
invoice, for a real job, traceable back to a real lead.

---

## Things I know are wrong or unclear

**Stale comment in `actions.ts`:**
> `// sales_leads RLS is authenticated-role, no user_id column`

Was true; isn't now. 041 made `sales_leads` admin-write. It still works because
`sales-pipeline/layout.tsx` is `is_admin()`-gated, so only admins reach the board.
But the comment will mislead. Fix it.

**`sales_leads.status` CHECK allows ten values:**
`new, contacted, visit_booked, estimate_done, quote_sent, follow_up_due, won,
lost, scheduled, completed`

The board has six stages. `038_reconcile_sales_lead_board_stages.sql` reconciled
them. Confirm which are live before adding logic that keys off status.

**`sales_leads.quote_value` (numeric)** duplicates `quote_drafts.total`. Once
linked it's derivable. Don't delete it — the board reads it — but don't write to
both from the same action or they'll disagree. Say which wins.

**The old path.** `admin_enquiries → estimates → quote_drafts` does similar work.
Joe has decided the board **replaces** it. So copy that pattern rather than
inventing one — `estimates` is already linked to enquiries, properties and quote
drafts, and that's the shape to follow. **Do not delete the old path.** It runs,
holds real data, and the board hasn't carried a real lead yet. Retire after.

---

## Constraints

- Numbered migration in `scripts/` (next is `043`), transaction-wrapped. Joe
  pastes it in manually. Migrations do not auto-apply.
- **Verify against the live DB before and after.**
- Clean up test rows. Two agents have left live artefacts in this production
  database already.
- Branch, PR to `main`. Production deploys from `main` — `pipeline-slice-1`
  being green means nothing until it's merged. That bit us this week.
- **Test as admin and as staff.** Staff can't write leads post-041; make sure
  that's a clean refusal, not a crash.

---

## Out of scope

- **Billing / `billing_type` / the double-invoice question.** Parked. The audit's
  own banner says do not fix. Don't touch it even in passing.
- The 10am invoice review page — next brief, needs this one.
- Photos, follow-up email, voice-to-quote.
- Retiring the old enquiries path.

---

## The honest caveat

**The board has ~2 real leads as of 17 July** (owner's count; `sales_leads` had 0
rows on 15 July, so it has just started being used). Verify the count before
assuming an empty table — the migration is additive and nullable either way, but
don't write a backfill on the assumption of zero.

Build 1 and 2 first, get a real lead through, then do 3 and 4.

---

## Context the owner supplied — read this, it reframes the work

**The quote builder is well-built and unused.** The owner's words: *"the quote
builder was actually built well, it was just hidden and I didn't use it."*
Confirmed against the code. `/admin/quotes` already has:

- Proposal system — `proposal_status`, `proposal_email_subject`,
  `proposal_email_body`, `proposal_ready_to_send_at`, `proposal_sent_at`,
  `proposal_send_error`. The owner thought this was lost. It isn't.
- **Public accept link** — `public_accept_token` / `public_accept_url`, served by
  `app/public/quote/[token]/page.tsx`. Customers accept online.
- Quote-side follow-up ladder — `followup_3day/7day/14day_sent_at`
- Acceptance capture — `accepted_customer_name`, `acceptance_notes`,
  `quote_accepted_at`, `quote_declined_at`
- Recurring invoice flags — `recurring_invoice_required`, `..._setup_status`

**Quote templates exist** — `/admin/quote-templates`, `quote_templates` table with
`default_line_items`, `category`, and pricing already modelled for labour,
greenwaste, sprays, fertiliser, stump paste. `quote_drafts.quote_template_id`
links them.

**So Phase 2 is not "add two columns."** It is *connecting the board to a quote
system that already exists and has never been used from the board.* Build with
that in mind — do not rebuild anything in `/admin/quotes`. Reuse it.

### Additional scope: template auto-suggest

When "Create quote" runs, suggest a `quote_template_id` from
`sales_leads.service_needed`, and prefill from the template rather than starting
blank. `quote_templates.category` is the likely mapping key — check it.

Keep it a **suggestion, not a decision**: prefill, let the user override. A wrong
template silently applied is worse than a blank form. If the mapping is
ambiguous, prefill nothing and let them pick.

---

## Follow-up UX — owner-agreed scope, build this

Follow-ups stay **prompted-manual**. Do not automate sending (see the NOT-in-scope
section). Two changes the owner asked for:

### A. Button visible from the start, faint until due

`components/pipeline-row.tsx` currently renders the button only when due:

```ts
{followUpBadge?.kind === "due" ? <ActionButton label="Send follow-up" /> : null}
```

Instead: show it whenever the lead is in a follow-up stage (contact or quote
ladder), **faint/muted before the due date, normal once due**. Same button, same
action — it just stops appearing out of nowhere. The owner should be able to
follow up early if he wants to.

Don't invent a new colour system — `BOARD_STAGE_COLORS` and the existing badge
palette (`bg-orange-100 text-orange-800` / `bg-gray-100 text-gray-600`) are the
vocabulary.

### B. Snooze — "Follow up again in X days"

**Why this matters.** `getFollowUpBadge()` is a pure timer over
`next_follow_up_at`. **The app has no knowledge of inbound replies at all** — no
email, phone or SMS awareness. The only way a badge stops nagging today is a
stage advance or a send. So a lead that replies *"sounds good, ask me in spring"*
has no honest resting state: the badge nags forever, and the only escape is
marking it Lost, which is a lie.

Add a snooze control next to the follow-up button: pick a number of days, write
`next_follow_up_at = now() + N days`, log it to the `notes` activity thread like
every other transition. **No status change** — snoozing is not a stage move and
must not pretend to be.

Keep `hasFollowUpRemaining()` semantics intact — snoozing shouldn't consume a
rung of the 3/7/14 ladder.

This is small, and it's the difference between a timer that nags and one the
owner can steer.

---

## Known defect — small, worth fixing here

`components/pipeline-row.tsx`:

```ts
// Red "needs action" dot: display-only for now — shown on the four stages
// whose card carries a primary action (columns 1–4).
const needsAction = stageIndex <= 3
```

**Owner's decision: delete it.** The dot is decoration — it shows on every lead
in columns 1–4 regardless of whether anything is due, so it carries no
information. Remove it rather than wiring it up.

---

## Nav badge counts — owner-requested, build if cheap

The owner's read: *"the app has too many pages"*. He does not want new pages for
things that need attention — he wants **a small count next to the existing nav
item**, e.g. `Internal notes (1)` when there's one unread.

Do this **only where the count is real and cheap** — an actual query for an
actual open-item count. Do not invent a notification framework, and do not add a
badge anywhere the number would be approximate or always-on. A wrong badge is the
red dot again.

Start with one, in `components/mobile-nav.tsx` / the nav config, and let him look
at it before doing more. Suggest `internal_job_notes` where `status = 'open'` —
he named it, and the data is already there.

If this turns out to be more than a small job, drop it and say so — it is not
worth delaying the linking.

---

## ✅ DECIDED: quotes originate in the app, not Xero

The owner's call, 17 July: **bypass Xero for quoting. Do it all in the app.**

- Quotes are **built, sent, and accepted in the app** — `/admin/quotes` +
  `app/public/quote/[token]`.
- **Invoicing stays in Xero.** Unchanged. The app still never calls Xero
  directly; Make does.
- This is already the proven path: the Phase 0 engine builds the Xero invoice
  **from `quote_drafts` line items** (INV-2382). App quote → Xero invoice works.

**What this means for this brief:** "Create quote" on the board is **real**, not
decoration. Build it properly. It is the entry point to the flow the business now
runs on.

**What it means downstream:** once quotes leave Xero, **Xero stops notifying the
owner of acceptances**. The board becomes the only place an acceptance surfaces.
That is intended — but it raises the bar on the board being correct.

**The real risk is behavioural, not technical.** The owner has never used the
quote builder. All of this depends on him actually using it. He is sending one
real quote from the app before this brief is built; if the builder or the
proposal turns out to need work, that becomes Brief 03 and takes priority.

---

## Explicitly NOT in scope — but asked about, so recorded

**Automatic follow-up sending.** Follow-ups currently work: `getFollowUpBadge()`
flags due, "Send follow-up" opens a prefilled draft
(`lib/sales-lead-templates.ts`), `sendFollowUpAction` queues into
`client_contact_messages` for Make. Both ladders exist (2-day contact,
3/7/14-day quote). It is **prompted-manual by design** — Phase 1 spec §7:
*"Advancement is manual — nothing moves on inbound replies."*

The owner asked about this. Making it automatic is a **design change requiring
his explicit decision**, not a Phase 2 task. Do not build it in this brief.

**Voice-to-Quote feeding the Create Quote column.** The owner wants this once the
voice tool proves reliable. It is Brief 05+ and needs this brief first. But it is
the reason `quote_draft_id` is the right link: the voice tool will produce a
`quote_drafts` row, and the lead should point at it the same way. **Don't design
anything that assumes quotes are only ever created in-app.**

**Notifications — decided, do not build.** New website leads already reach the
owner: the WordPress form emails him and Zoho notifies his phone. That gap is
closed with no code.

Two mechanisms exist and should be left alone in this brief:

- `lib/lead-notifications.ts` (`sendLeadNotificationToJoe`, actions `created` /
  `accepted`) — wired only to the old enquiries path. The owner says that path
  "was never used enough for it to be checked", so this is **plausibly untested
  and may never have delivered to anyone**. Its recipient is hardcoded to
  `joenaughtonmusic@gmail.com`. If ever revived: prove it sends, and make the
  address an env var. Don't wire it to the board.
- `admin_actions` + `lib/admin-actions.ts` — a real in-app task system with a
  page at `/admin/actions`, de-duped, already raised by `/admin/quotes` for
  accepted quotes with no `first_scheduled_job_id`. **Wiring the board to it is
  deferred**, pending evidence the owner actually uses that page.

The reasoning, which should survive this brief: the board has ~2 leads and the
owner is the bottleneck. Nothing is being missed because he checks it. Adding
alerts before knowing what actually slips produces a wall of noise he'll learn to
ignore — the red dot problem at scale. Revisit when volume justifies it, and
notify the things that *demonstrably* got missed, not the things we'd guess.
