# Pristine Jobs — Operating Manual (as built, 2 August 2026)

This describes what the app **actually does today**, traced from the code and
the live production database — not what any brief or spec intended. Where the
code does something surprising or half-finished, it's flagged in
[Section 7](#7-things-that-will-bite-you--flags-from-the-code) rather than
smoothed over.

Structured by workflow, not by page. Two main cycles:
- **[Workflow A](#workflow-a--new-customer--one-off-job-lead--paid)** — a new customer / one-off job, lead → paid.
- **[Workflow B](#workflow-b--recurring-maintenance-visit-cycle)** — the recurring maintenance visit cycle.

Then the supporting workflows (crew day, labour, capture, team board, customer
photos), a reference of the state fields, and the flags.

---

## Who does what

The app only technically enforces **two** roles: an **admin** session (office
— everything under `/admin` and the sales pipeline) and **crew** (field staff,
who see only their own jobs). It does **not** distinguish "Joe" from "the VA" —
both use an admin login. So the actor labels below (**Joe**, **VA**, **Crew**)
are the *intended* division of labour, not a rule the software enforces. Anyone
with an admin login can do any office step.

- **Joe** — estimating and quoting (site visits, pricing, sending proposals),
  plus anything involving money or billing decisions.
- **VA** — office admin: lead triage, contacting customers, scheduling,
  invoice readiness, photo emails, chasing.
- **Crew** — in the field: start job, complete visit, photos, log hours.

Production URL: **https://v0-landscaping-job-app.vercel.app**

---

## Workflow A — new customer / one-off job (lead → paid)

A lead is a row in `sales_leads`. It moves through **six visible columns** on
the Sales Pipeline board: **New lead → Contacted → Visit booked → Quote → Job
scheduled → Job completed**. Under the hood there are more status values than
columns (several collapse into "Quote"), but the six columns are what you work
from.

Two separate records run this workflow and only partly stay in sync: the **lead
card** (`sales_leads`) and, once quoting starts, the **quote draft**
(`quote_drafts`). The seam between them is the single biggest gotcha in the app
— see Step 5 and [Section 7](#7-things-that-will-bite-you--flags-from-the-code).

### Step 1 — A lead arrives · VA · Sales Pipeline (`/sales-pipeline`)

Leads enter four ways, all landing in the **New lead** column (except 1d):

- **1a. Website form** (no human) — the website posts to the app automatically;
  the lead appears in New lead and Joe gets a notification email.
- **1b. Paste box** (VA) — for Messenger/Bark enquiries. Click **"Paste an
  enquiry"**, paste the message, pick the source, click **"Extract to tray"**.
  The AI reads it into a pending card. Review it with **"Review & approve"**,
  fix anything wrong, then **"Approve → add to board"**. Junk → **"Dismiss"**
  (recoverable for 30 days with **"Restore"**). Approval is blocked until the
  card has a name and a phone or email.
- **1c. Manual** (VA/Joe) — **"Add lead"** → fill in → **"Save lead"**.
- **1d. Existing customer** (VA/Joe) — **"Add existing customer"** → pick the
  property and service → **"Add at Visit booked"**. This shortcut drops the
  lead straight into the **Visit booked** column (skips New/Contacted) — use it
  for repeat customers who already need a quote.

> ⚠️ The **Admin Enquiries** page (`/admin/enquiries`) is a **separate list**
> (a different table, `admin_enquiries`) that does **not** feed the sales
> pipeline. If you want a lead on the board, use the pipeline, not that page.
> See [Section 7](#7-things-that-will-bite-you--flags-from-the-code).

### Step 2 — Contact the customer · VA · Sales Pipeline

On a **New lead** card, click **"Contact"** → a draft email opens → review it →
**"Send + mark contacted"**. This queues the email (the automation sends it),
moves the card to **Contacted**, and sets a follow-up reminder for 2 days out.

⚠️ **Sends a real customer email on click.** Never click twice — if the page
stalls, check the card's activity thread before retrying.

If the customer doesn't reply, a **"Send follow-up"** button appears when the
follow-up is due. Same review-then-send. (For jobs handled by phone, use
**"Advance stage (no action)"** in the card drawer to move it on without
sending anything.)

### Step 3 — Book and do the site visit · Joe · Sales Pipeline

On the **Contacted** card, **"Confirm visit"** → enter the agreed date/time →
card moves to **Visit booked**. Joe does the visit in person. Afterwards,
**"Move to quote"** moves the card to the **Quote** column.

(Site visits can also be booked as calendar entries on the Estimates page,
`/admin/estimates-calendar` — a two-week estimate calendar. That page can also
start a quote via **"Create Quote"**.)

### Step 4 — Build and send the quote · Joe · Quotes (`/admin/quotes`)

From the **Quote** card, **"Create + send quote"** → **"Open quote builder →"**
(this deep-links into the quote builder with the lead attached).

In the builder: pick the property (or **new customer**), set the title and
pricing, add line items, then **"Save Draft"**. To send: **"Send Proposal"** →
review → **"Send"**. The proposal is queued and the automation emails it on its
next run ("Queued — Make.com sends it on its next run").

> The quote draft has its own status track. It stays `draft` in one field even
> after sending — "sent" is recorded on a *different* field. Don't judge
> whether a quote went out by the word "draft".

### Step 5 — Quote accepted · Joe (or customer) · two places ⚠️

**This is the step that catches people.** There are three ways a quote gets
marked accepted, and they update *different* records:

1. **Customer clicks Accept** on the emailed proposal link → updates **both**
   the quote draft and the lead card. Nothing else to do. ✅
2. **Joe clicks "Mark Accepted Manually"** in the quote builder → updates the
   **quote draft only**. The board card does **not** learn it was accepted.
3. **Joe clicks "Mark accepted"** on the board card → updates the **lead card
   only**.

⚠️ **If you accept via the builder (path 2), you must ALSO click "Mark
accepted" on the board card** — otherwise the card never shows accepted and the
**"Schedule job"** button stays locked. (Path 1, the customer accepting online,
is the only one that needs no second click.)

If it's a brand-new customer, use **"Convert to Property"** in the builder to
create their property record before scheduling.

### Step 6 — Schedule the job · VA · Schedule (`/admin/schedule`)

Two routes, both end the same:
- From the builder, the **"Schedule …"** button (labelled by job type) opens the
  schedule form pre-filled from the quote.
- From the board card, **"Schedule job"** links into the schedule with the quote
  attached.

Fill in date, staff, duration, then **"Create Job"**. This creates the
scheduled job and moves the board card to **Job scheduled**. The job's billing
method is set automatically from the quote: **maintenance → charge-up**,
**one-off / landscaping → quoted**.

Then, on the job's card in the schedule:
- **"Confirm Schedule"** (checkbox) — flips it from "Schedule Draft" to
  "Schedule Confirmed".
- **"Contact Client" → "Send Email"** — tells the customer their day/time
  (⚠️ real customer email), or **"Mark Contacted"** if you did it by phone.

### Step 7 — Crew does the job · Crew · My Jobs (`/jobs`)

Covered in full in [Workflow B, crew section](#crew-day--crew--my-jobs-jobs).
In short: the assigned crew member opens the job, **Start Job**, then
**Complete Visit** (hours, notes, photos). Completing creates a `visits` row.

### Step 8 — Make the visit ready to invoice · VA · Cost Capture (`/admin/cost-capture`)

A completed visit does **not** invoice on its own. The office reviews it on
Cost Capture — check hours and materials look right — then **"Mark ready for
invoice"**. That's the button that queues a real Xero invoice.

The app decides automatically:
- Normal charge-up and quoted jobs → queued as **ready**.
- Non-billable and old hand-quoted (legacy) jobs → **excluded** (correct — they
  don't invoice here).
- A visit that would produce an empty or unpriced invoice → **error** (blocked
  on purpose, with the reason shown), rather than sending a bad invoice.

### Step 9 — Invoice created and tracked · VA · Invoices (`/admin/invoices`)

Once a visit is "ready", the automation creates the Xero invoice and writes the
invoice number and status back onto the visit. The Invoices page shows this as
tabs: **Needs Review → Draft Created → Authorised → Sent → Paid** (plus
**Excluded**, **Error**, **All**).

Actions on a visit here:
- **"Reset to Ready"** — re-queue a visit stuck in **Error** or **Processing**.
  ⚠️ Only after checking Xero doesn't already have a draft for it, or you'll get
  a duplicate. (This is Joe's call, not routine.)
- **"Exclude"** — take a visit out of invoicing (with a reason).
- **"Mark Not Ready"** — pull a visit back out of the queue.

The page also flags visits that look **stuck** (over an hour "processing" with
no Xero number) or **never invoiced** (charge-up work sitting unready over 21
days) — these are the automation silently dropping something; tell Joe.

### Step 10 — Mark it paid · VA · Sales Pipeline (Invoiced jobs section)

Below the pipeline board is an **"Invoiced jobs"** list of everything with a
Xero invoice number. Tick a job **paid** when the money's in — this is
**app-only tracking and never touches Xero** (it's just so you can see at a
glance what's outstanding). **"Clear paid (n)"** archives the ticked ones off
the list.

---

## Workflow B — recurring maintenance visit cycle

### ⚠️ There is no automatic recurrence

**This is the most important thing to know about maintenance.** A property's
"service frequency" (monthly, 6-weekly, etc.) is **display only** — a label on
the card. **Nothing in the app generates the next visit.** Every repeat
maintenance visit is **added by hand** on the schedule. The frequency does not
schedule anything; it just tells you how often it *should* happen.

### The cycle

1. **Add the visit · VA · Schedule (`/admin/schedule`).** In **Quick Add Job**,
   find the property, click **"Add"**, set the date/staff/duration, pick the
   **Job Type** and **Invoice Method** (for existing maintenance customers this
   defaults from the property), then **"Create Job"**.
   - **Speed tag**: each job carries a speed (orange/yellow/green) for the crew.
     Lawn-mowing jobs show orange automatically; others take the property's
     speed unless overridden on the job.
2. **Confirm & notify · VA.** **"Confirm Schedule"**, then **"Contact Client"**
   if the customer expects a heads-up.
3. **Crew does the visit · Crew.** Start Job → Complete Visit (see crew section).
4. **Invoice per visit · VA.** Charge-up maintenance invoices **per visit** via
   Cost Capture → Invoices, exactly like Step 8–9 above. **Subscription**
   maintenance does **not** invoice through the app — those customers have a
   repeating invoice set up by hand in Xero; the app never creates it.
5. **Repeat.** When the frequency says it's due again, go back to step 1 and add
   the next visit by hand.

> Billing types you'll see on maintenance properties: **charge_up** (invoiced
> per visit through the app) and **subscription** (billed by a Xero repeating
> invoice, by hand — the app deliberately stays out of it). A small number use
> **fixed_recurring** (a fixed per-visit price).

---

## Supporting workflows

### Crew day · Crew · My Jobs (`/jobs`)

The crew member sees only the jobs assigned to them for the week. Open a job:

1. **"Start Job"** → job goes in-progress.
2. **"Complete Visit"** → the completion form:
   - Hours worked, primary worker, greenwaste bags, work notes (required).
   - **Materials used** — tap a quantity against the priced items (spray, stump
     paste, fertiliser); these bill automatically. Anything else goes in the
     **"Other materials"** note (a note for the office — it never holds up the
     invoice).
   - **"+ Add helper"** for extra staff on the job.
   - **Rental properties**: at least one photo is required to complete, and a
     **walk-around report** section lets the crew log issues (photo + severity +
     note) they spot.
   - **"Complete"** saves the visit, the labour, any material charges, the
     photos, and marks the job completed.
3. **Photos** can be added on the job page any time — set the **type** to
   **After** or **Completion** for anything that should reach the customer's
   photo page or a PM report.

### Logging hours · Crew · Landscaping Labour (`/labour`)

Crew log their own hours here: **"Save Job Labour"** against a job,
**"Save Misc Work"** for unscheduled work, and **"Save Staff Total Hours"** for
the day's timesheet (with sick/leave/public-holiday options). The daily total
and the job hours are what the office reconciles.

### Checking hours line up · VA · Labour Reconciliation (`/admin/labour-reconciliation`)

A **read-only** report comparing each staff member's daily total against the
hours they logged against jobs. It flags mismatches (missing daily hours, over/
under-allocated). No buttons — chase the staff member if a day looks wrong.

### Voice/quick notes · Joe or VA · Capture (`/capture`)

Record a voice note or type one; the AI sorts it. Notes it reads as a **VA
task** automatically appear on the **Admin Actions** page assigned to the VA
(and email her). Other notes just sit in the capture list. (This is how Joe
offloads "get the VA to ring X" without messaging.)

### Overflow jobs · VA posts, Crew claims · Job Board

- **Admin** (`/admin/job-board`): **"Add Item"** to post a small/overflow job.
- **Crew** (`/team/job-board`): **"Available" / "Claim job" / "Not available"**
  to respond. Claiming assigns it to them.

### Customer photos · VA · two surfaces

Both consume the **After/Completion** photos the crew take:

- **Photo email** (on the **Admin Actions** page, "Photo emails to review"):
  for opted-in properties, the VA reviews a visit's photos, hides any that
  shouldn't go out, and sends the customer a link to their photo page. PM
  properties copy Joe. (Opt in per property with "Send photos to customer" on
  the property screen.)
- **Public photo page** (`/v/{token}`): the link customers receive — a clean
  page of that visit's photos, no prices or names. Also printable on invoices.
- **PM Reports** (`/admin/pm-reports`): sends a property manager a PDF of the
  crew's walk-around **issue** photos.

---

## Reference — the fields that carry workflow state

These are the real state values in production today (2 Aug 2026), so you know
what you'll actually see.

**Lead stage** (`sales_leads.status`): `new → contacted → visit_booked →
estimate_done → quote_sent → follow_up_due → scheduled → completed`, plus
`lost`. (`won` exists in the code but see [Section 7](#7-things-that-will-bite-you--flags-from-the-code).)

**Job billing method** (`scheduled_jobs.invoice_method`) — how it invoices:
`charge_up` (most jobs), `subscription`, `quoted`, `fixed_recurring`.

**Job status** (`scheduled_jobs.status`): `scheduled → in_progress →
completed`, plus `cancelled`.

**Schedule confirmation** (`scheduled_jobs.schedule_confirmation_status`):
`draft` / `confirmed`.

**Invoice lifecycle** (`visits.invoice_status`): `not_ready → ready →
processing → draft_created → authorised → sent → paid`, plus `excluded` and
`error`.

**Property billing type** (`properties.billing_type`): `charge_up` or
`subscription`. The detailed per-job-type billing lives in
`property_billing_lines`.

---

## 7. Things that will bite you — flags from the code

Everything here is confirmed in the code or the live database. These are not
guesses; where intent is genuinely unclear it says so.

### Workflow gotchas (will affect daily use)

1. **Accept a quote in the builder → you must also "Mark accepted" on the board.**
   Builder-accept and board-accept update different records; only the customer
   accepting online updates both. Until the board card shows accepted, the
   "Schedule job" button stays locked. *(Step 5.)*

2. **No auto-recurrence for maintenance.** Every repeat visit is added by hand.
   Service frequency is a label, nothing more. *(Workflow B.)*

3. **The Admin Enquiries page is a dead end for the pipeline.** It reads a
   separate table (`admin_enquiries`) with no code path into `sales_leads`.
   Confirm with Joe whether it's still used at all — the paste box appears to
   have superseded it. Nothing you enter there reaches the board.

4. **Two customer-photo prerequisites are easy to miss:** photos must be typed
   **After** or **Completion** to reach customers, and there are currently
   **zero "after" photos in production** (crew have been using "completion" and
   "before"). If a photo feature "shows nothing", check the photo type.

### Half-built or non-functional (don't rely on these)

5. **"Schedule Job" button in the schedule's "Ready To Schedule" queue does
   nothing.** It has no action wired to it (`admin-schedule-client.tsx:1904`).
   Also, that queue (`scheduling_queue`) has **no code in this app that fills
   it** — rows would have to come from something outside the repo. Treat the
   whole "Ready To Schedule" panel as non-working today.

6. **"Edit details" on a lead card is disabled** ("Coming in a later slice",
   `pipeline-row.tsx:488`). You can't edit a lead's details from the board yet.

7. **"Notify assigned staff" on the schedule is a disabled placeholder**
   (`admin-schedule-client.tsx:1569`, marked TODO). It does nothing.

8. **The Invoices page can show a raw "TODO" line** instead of an "Open Job"
   link for a visit with no linked job (`invoices/page.tsx:1399`). Cosmetic, but
   it's developer text leaking to the screen.

9. **`whoami` page** (`/whoami`) is a leftover debug screen, not linked
   anywhere. Harmless, ignore it.

### Data-model gotchas (matter if you ever read the database directly)

10. **Crew see admin controls on the job page.** The job detail page hardcodes
    admin mode on (`jobs/[id]/page.tsx:70`), so crew can see "Edit Completed
    Visit" and photo "Delete". Likely unintended — flag before relying on the
    job page as a crew-only surface.

11. **`completed_by_staff_id` on a visit points at the profile/login id, not
    the `staff_members` id**, despite the name. Don't join it to
    `staff_members`.

12. **Two billing columns disagree.** `scheduled_jobs.billing_mode` and
    `invoice_method` don't match in the data (4 vs 38 "subscription"). The
    automation routes on **`invoice_method`** — treat that as the authoritative
    one.

13. **`job_type` on jobs is effectively unused** — 194 of 195 jobs are the
    placeholder value `job`; only 1 has a real type. The job-types feature is
    built but historic jobs weren't backfilled, so don't rely on this field for
    reporting yet.

14. **`won` lead status is defined but nothing sets it** in the normal flow
    (accepted quotes go straight to `scheduled`). Don't document or expect a
    "won" stage without checking with Joe whether it's still meant to exist.

### Docs in this repo that contradict the code (don't trust these)

15. **`docs/PAGE_AUDIT.md` is significantly stale.** It documents a
    **Communications Hub** (`/admin/communications`) in detail — **that page was
    removed** and the route doesn't exist. It also **omits** four live pages
    (cost-capture, pm-reports, team-hub, and misses others). Treat PAGE_AUDIT as
    unreliable until refreshed.

16. **`CLAUDE.md` still describes the Communications Hub** as a live feature
    ("receives messages via Zoho + Make, AI categories…"). It's gone; the table
    it describes has no such columns. Historical, not current.

17. **`CLAUDE.md` gives the wrong path for the sales pipeline** — it says
    top-level `sales-pipeline/`, but the code is at `app/(app)/sales-pipeline/`.
    Minor, but the file path is wrong.

18. **`non_billable` billing is a real code path with zero live data** — it's
    supported but no job has ever used it. Don't expect to see it in reports.

---

*Written 2 August 2026 from the code and live production database. If a step
here doesn't match the screen, the code changed after this date — trust the
screen and get this file updated.*
