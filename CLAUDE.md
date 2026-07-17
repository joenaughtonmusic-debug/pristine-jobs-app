# Pristine Jobs

Custom job-management app for Pristine Gardens — intended to replace fragmented manual systems and become the operational centre of the business. Currently a better fit than adapting a generic CRM/pipeline product.

> Global context about Joe and how to work with him lives in `~/.claude/CLAUDE.md`.

## Business context (Pristine Gardens)

Auckland gardening company, ~7 years. Services: recurring garden maintenance, one-off tidy-ups, hedge trimming, planting, lawn mowing, soft landscaping. Largely stepped back from major landscaping but may take suitable projects when capacity/cashflow justify. Revenue roughly NZD $40–45k/month but fluctuates; **currently in a downturn, minimal work, cashflow is an issue.**

**Strategic direction:** run without depending on Joe for routine admin or field work.
- Estimator owns site visits and quotes (currently Joe — fine near term).
- VA/office support owns customer comms, scheduling, follow-up. (Scheduling is currently hard for her because one-off jobs constantly force schedule shifts.)
- Field staff deliver the work. Joe handles leadership, exceptions, strategy, key decisions.
- Note: Joe is undecided whether he keeps the VA long term.

**Team:** Hugh (senior gardener), Charles (experienced gardener), Alex (casual), Graham (possible estimating contractor, not really onboard yet), Fletcher (landscaping/gardening contractor), VA/office support. Staff availability and sickness make the schedule unstable.

## Pricing & quoting rules

- Customer-facing labour rate: **currently NZD $80/hr incl GST** (dropped from the usual $90 to win work in the current downturn).
- Don't normally show estimated labour hours to customers. Customer quotes describe the work and give a labour price; list plants/significant materials separately where appropriate.
- Add ~25% labour contingency by default unless there's a reason not to.
- Avoid repeatedly starting sentences with "We will." Clear, professional NZ English. Customer copy should feel specific and trustworthy, not AI-generated.
- Internal estimates may show hours, assumptions, risks, profitability. Team instructions should be practical and operational.
- **Maintenance** = price per visit with a frequency, NOT a converted monthly subscription. Frequencies: monthly, every 6 weeks, every 2 months, every 3 months, every 4 months, per visit. Preferred standard blocks: 4 hours and 8 hours.

## Tech stack

Next.js (App Router), PWA, Supabase (DB, auth, storage, RLS), Vercel, Make.com integrations, Zoho email ingestion, Google Calendar integration/blockouts. Planned: direct Xero integration, Android/Tasker SMS relay.

## Main areas

Sales/lead pipeline · Schedule · Estimates Calendar · VA Actions · Communications Hub · Properties · Quotes & quote templates · Quoted Jobs · Invoices · Labour Reconciliation · Profitability reporting · Admin Enquiries · Job Board · Team Hub.

## Sales pipeline direction (current focus)

Visually simple, card-based pipeline — simple and easy to use without visual clutter.
- Collapsed card: customer name, service required, suburb.
- Expanded: contact details, full enquiry, outcome requested, notes, current stage, follow-up requirements, communication history.
- Actions like "Contact" should behave like **work to be completed and ticked off**, not a static "Contacted" status.
- Eventually the system generates an appropriate customer response from the service + enquiry; initially the VA reviews/edits then clicks send. Fully automatic messages are NOT the first priority.
- **New website leads should ideally be added straight to the sales pipeline** (avoid relying on Zoho for those).

## Communications Hub

Receives messages via Zoho + Make.com, stores in Supabase. **Joe is unsure about this hub — it's messy.** Possibly better to filter in Zoho first. Near-term need: a way to flag important customer communication. AI categories: quote request, scheduling, maintenance query, invoice/payment, complaint, general, internal note. AI assists with classification and draft responses but **must not confidently invent missing information.**

## Schedule

Draft and Confirmed states. Actions: Confirm, Contact Client, record scheduling notes, assign staff, show address/suburb, convert accepted quotes into scheduled work. Joe wants a master scheduling view while controlling which staff see each job.
- VA has asked for drag-and-drop + recurring events. Joe already has this in Google Calendar and **doesn't want the hassle of rebuilding it in-app unless it's genuinely easy.**

## VA workflows

VA should be able to: process new enquiries; generate + send reviewed customer responses; arrange site visits; schedule accepted quotes; handle customer schedule changes; triage communications; escalate urgent/uncertain matters; check invoice readiness; check staff hours are recorded; follow up incomplete actions. Goal: kill the current loop where the VA forwards info to Joe, waits, contacts the customer, then needs Joe to follow up again.

## Current goals for this app

Standardise quotes across properties and job types; streamline quoting and invoicing; build the sales pipeline to take leads from lead → customer, kept simple and uncluttered.
