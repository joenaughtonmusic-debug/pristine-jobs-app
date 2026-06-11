# Pristine Jobs Page Audit

This audit covers the admin-facing routes in the Pristine Jobs repository, with notes on adjacent team/staff routes where they affect the admin operating flow. It focuses on purpose, ownership, information flow, current fit, and recommended product direction. No code or database changes are included here.

## Admin Page Index

| Page | Route | Current Group | Recommendation |
| --- | --- | --- | --- |
| Operating Dashboard | `/admin` | Dashboard | Expand |
| Enquiries | `/admin/enquiries` | Work Pipeline | Expand |
| Estimates Calendar | `/admin/estimates-calendar` | Work Pipeline | Expand |
| Quotes | `/admin/quotes` | Work Pipeline | Simplify |
| Quoted Jobs | `/admin/quoted-jobs` | Work Pipeline | Merge |
| Schedule | `/admin/schedule` | Work Pipeline | Expand |
| Invoices | `/admin/invoices` | Work Pipeline | Expand |
| Properties | `/admin/properties` | Work Pipeline | Expand |
| Communications Hub | `/admin/communications` | Communications | Expand |
| Communication Detail | `/admin/communications/[id]` | Communications | Expand |
| Team Notes | `/admin/internal-notes` | Communications | Merge |
| Admin Actions | `/admin/actions` | Communications | Merge |
| Team Job Board | `/admin/job-board` | Team | Expand |
| Labour Reconciliation | `/admin/labour-reconciliation` | Team | Expand |
| Template Settings | `/admin/quote-templates` | Settings | Expand |
| Profitability | `/admin/profitability` | Settings | Hide behind advanced settings |

## `/admin` - Operating Dashboard

### Purpose
Present Pristine Jobs as one operating pipeline: lead intake, quote or estimate, scheduling, job completion, invoicing, and team exceptions.

### Primary User
Joe, VA.

### Inputs
Counts and summary signals from admin enquiries, communications, quote drafts, visits, staff daily timesheets, and job labour entries.

### Outputs
Navigation into the next operational queue: enquiries, estimates calendar, schedule, invoices, communications, and labour reconciliation.

### Current Strengths
The dashboard now frames the system as a pipeline instead of a set of unrelated tools. It gives each area a purpose, a likely next action, and a target page. It also uses communication classification helpers so intake counts better match operational reality.

### Current Weaknesses
The counts are useful but still high-level. They do not yet show ownership, urgency, ageing, blocked items, or the exact reason something needs attention. Some cards link to broad pages where the user must still work out what to do.

### Recommended Improvements
Add queue ageing, owner labels, "oldest item" signals, and a short list of top blockers per pipeline stage. Treat dashboard cards as operational work queues, not just links.

### Page Direction
Expanded.

## `/admin/enquiries` - Enquiries

### Purpose
Capture and review new customer enquiries, especially manually created phone or admin leads.

### Primary User
VA, Joe.

### Inputs
Admin enquiry rows containing customer name, contact details, suburb, address, job type, budget, notes, status, and linked communication counts.

### Outputs
Create a new enquiry, archive an enquiry, open related communications, and trigger Joe's new lead email notification when configured.

### Current Strengths
The page is simple and fast for manual intake. The qualification script gives the VA a consistent phone-flow prompt. Enquiries can be tied back to communications, which is a good foundation for a single intake record.

### Current Weaknesses
The page does not yet feel like the start of the whole job pipeline. There is no direct "book estimate", "create quote", "create property", or "convert to job" action on the enquiry card. Status values are broad, and "Delete" behavior appears to be archival rather than destructive deletion, which could confuse users.

### Recommended Improvements
Make the enquiry card the starting point for lead progression. Add explicit next actions: qualify, schedule estimate, create quote, create property, ignore, or close. Show source and ownership more clearly.

### Page Direction
Expanded.

## `/admin/estimates-calendar` - Estimates Calendar

### Purpose
Schedule estimator availability and estimate visits without mixing Google Calendar blockouts into the main work schedule.

### Primary User
VA, Estimator, Joe.

### Inputs
Properties, the estimator staff record, scheduled estimate jobs, records from the estimates table, estimate calendar blocks, Google Calendar blockouts, unscheduled enquiries, and approved quote request communications.

### Outputs
Create or update estimate appointments, block estimator availability, mark enquiries as scheduled, mark quote-request communications as handled, and send Joe accepted-lead notifications.

### Current Strengths
This is the right place for estimate availability. Keeping Google Calendar blockouts here avoids polluting the work/staff schedule. The page also surfaces approved quote requests and unscheduled leads, so it is close to a true estimate dispatch board.

### Current Weaknesses
Estimate data appears to live in more than one shape: scheduled estimate jobs and separate estimate records. The estimator is inferred from a staff name, which creates hidden configuration knowledge. Creating or handling a lead can still require the user to understand how enquiries, estimates, properties, and quotes relate.

### Recommended Improvements
Make estimate records the single first-class object for this stage, then link to scheduled jobs only when needed. Replace hard-coded estimator assumptions with a setting or role. Add clearer "lead to estimate to quote" state transitions.

### Page Direction
Expanded.

## `/admin/quotes` - Quotes

### Purpose
Build customer quotes, manage quote drafts, prepare Xero quote data, send proposals, process acceptance, and coordinate quote follow-up work.

### Primary User
Joe, Estimator, VA.

### Inputs
Active properties, scheduled jobs, estimates, active quote templates, staff, and quote drafts with Xero, proposal, acceptance, and recurring invoice setup fields.

### Outputs
Create and edit quote drafts, calculate line items, generate public acceptance links, prepare Xero quote status, queue proposal emails, mark quotes accepted or declined, convert accepted quotes to properties/jobs, and track recurring invoice setup.

### Current Strengths
This page holds the most complete quote lifecycle. It understands estimates, templates, scheduled jobs, quote acceptance, Xero status, proposal sending, and recurring invoice setup. It is valuable because it keeps quote operations visible.

### Current Weaknesses
It carries too many jobs at once. Quote building, proposal sending, Xero staging, acceptance review, schedule creation, and recurring invoice follow-up all compete for attention. Maintenance package architecture is still constrained by the current template shape, while the UI concept now points toward separate garden and lawn service components.

### Recommended Improvements
Split the experience into a focused quote builder plus an operations queue for accepted/sent/follow-up quotes. Keep the customer-facing quote combined, but model maintenance and lawn components separately internally when the database supports it.

### Page Direction
Simplified.

## `/admin/quoted-jobs` - Quoted Jobs To Invoice

### Purpose
Track quoted scheduled jobs that need to be converted into invoices after the work is complete.

### Primary User
VA, Joe.

### Inputs
Scheduled jobs where `invoice_method = quoted`, quote draft type, Xero quote number, quoted scope, quoted materials, scheduled date, and quoted invoice conversion status.

### Outputs
Mark quoted jobs as ready to convert, then mark them as converted.

### Current Strengths
The page gives a direct operational checklist for quoted jobs that need invoicing. It shows scope, materials, quote type, and Xero quote reference.

### Current Weaknesses
It overlaps heavily with `/admin/invoices`, which now also understands quoted work, Xero invoice status, actual invoice amount, and app preview amounts. Keeping this as a separate page risks duplicate invoice tracking and missed status updates.

### Recommended Improvements
Merge the quoted-job conversion queue into the invoices page as a quoted/fixed-price invoice tab or filter. Keep this route as a redirect or advanced legacy view until the merged workflow is trusted.

### Page Direction
Merged with `/admin/invoices`.

## `/admin/schedule` - Schedule

### Purpose
Manage the main work and staff schedule for scheduled jobs, assigned staff, visits, client adjustment requests, internal job notes, and scheduling queue items.

### Primary User
VA, Joe.

### Inputs
Scheduled jobs, properties, active staff, multi-staff assignments, visits, property service templates, scheduling queue items, client adjustment communications, and open internal job notes.

### Outputs
Create and update scheduled jobs, reassign staff, update multi-staff assignments, edit property and scheduling details, send client scheduling messages, mark communications handled, and reveal internal notes on job cards.

### Current Strengths
This is the operational heart of the app. It now shows important staff-facing billing cues, internal note badges, suburb/address visibility, quoted and charge-up signals, and staff reassignment support. Removing Google Calendar blockouts from this page keeps it focused on real work/staff scheduling.

### Current Weaknesses
The component has become very broad. Scheduling, property maintenance, client communication, staff assignment, job creation, and queue triage are all mixed. The scheduling queue and client adjustment workflows still feel like attached side channels rather than first-class schedule states.

### Recommended Improvements
Keep this as the main dispatch board, but separate supporting workflows into clearer panels: unscheduled work, client changes, staff allocation, and property setup. Add stronger guardrails for completed visits and scheduling conflicts.

### Page Direction
Expanded.

## `/admin/invoices` - Invoices

### Purpose
Review visits for invoicing, compare app preview charges against actual Xero synced invoice data, and manage invoice status exceptions.

### Primary User
VA, Joe.

### Inputs
Visits, scheduled jobs, properties, extra charges, invoice notes, app invoice status, Xero invoice number, Xero invoice amount, sent/paid timestamps, and invoice error fields.

### Outputs
Update invoice notes, exclude visits from invoicing, reset status to ready, mark not ready, and inspect invoice status tabs: Needs Review, Draft Created, Authorised, Sent, Paid, Excluded, Error, and All.

### Current Strengths
The page now treats Xero synced data as the primary invoice display when available. It separates Authorised from Sent, shows actual Xero amount versus app preview, and warns when the amounts differ.

### Current Weaknesses
The page is still partly an invoice review board and partly a read-only Xero status monitor. Users need to understand which actions happen in app, in Make.com, and in Xero. Quoted job conversion also exists on another page.

### Recommended Improvements
Make this the single invoice operations page. Add explanatory state text for each status, merge quoted-job conversion into this board, and show the next action per invoice.

### Page Direction
Expanded.

## `/admin/properties` - Properties

### Purpose
Manage customer property records and service metadata.

### Primary User
VA, Joe.

### Inputs
All properties with client details, address, service type/frequency, Xero contact status, invoice handling notes, and other property fields through the property dialog.

### Outputs
Add and edit properties.

### Current Strengths
The page is simple and has a clear card-based property list. It centralizes property editing and surfaces Xero linkage and service metadata.

### Current Weaknesses
The card display is compact and can hide important scheduling context such as suburb unless the edit dialog is opened. Properties are used across leads, estimates, quotes, schedule, invoices, labour, and profitability, but this page does not yet act like a customer/property command center.

### Recommended Improvements
Turn each property into a richer record with current service package, next scheduled job, open notes/actions, invoice handling, quote history, and profitability signal. Keep the list simple, but add a detail view.

### Page Direction
Expanded.

## `/admin/communications` - Communications Hub

### Purpose
Triage inbound and manually created communications into action inbox, organic leads, customer messages, aggregator leads, receipts/admin, ignored, and all.

### Primary User
VA, Joe.

### Inputs
Communications with source, category, source category, status, ignored flag, requires action, linked enquiry, customer details, subject/body, and classification helper output.

### Outputs
Create a communication, open the detail view, and apply quick actions: mark ignored, move to inbox, mark aggregator lead, mark organic lead, mark customer message, or mark no action required.

### Current Strengths
The classification helper gives the page a useful inbox model. Quick actions make triage fast. Aggregator leads and receipts/admin noise can be separated from real customer work.

### Current Weaknesses
The communications record is not yet fully connected to downstream workflow creation. A lead-like communication can recommend "Create Enquiry", but the detail flow still has gaps. There is overlap with Enquiries and Admin Actions.

### Recommended Improvements
Make Communications the intake source of truth, then let users create an enquiry, estimate, action, or customer reply from the same detail page. Show a clear audit trail of what happened to each message.

### Page Direction
Expanded.

## `/admin/communications/[id]` - Communication Detail

### Purpose
Review a single communication, edit triage fields, draft or send replies, and complete recommended actions from communication metadata.

### Primary User
VA, Joe.

### Inputs
One communication record, linked enquiry, metadata, triage fields, raw message body, optional reply draft, and Make.com webhook configuration for sending replies.

### Outputs
Save triage updates, mark no action required, ignore, assign urgent review to Joe, send replies through the configured webhook, complete schedule/estimate metadata actions, and link to related enquiries.

### Current Strengths
The page exposes the full context for a communication and supports reply sending through the existing webhook pattern. It is the natural place for VA triage.

### Current Weaknesses
Some actions are still partly manual or TODO-shaped, especially creating enquiries directly from a communication. Metadata is powerful but can feel technical to non-developers. Duplicate notification prevention and status changes depend on specific fields rather than a unified workflow event model.

### Recommended Improvements
Replace raw operational metadata with clear action cards: create enquiry, schedule estimate, assign action, reply, ignore. Keep raw metadata hidden behind an advanced/debug area.

### Page Direction
Expanded.

## `/admin/internal-notes` - Team Notes

### Purpose
Review and complete internal notes submitted from jobs or visits.

### Primary User
VA, Joe, Team leads.

### Inputs
Internal job notes, linked scheduled job ID, property address, submitting staff name, created date, status, completion metadata, and linked property details.

### Outputs
Mark a note completed and open the linked job where available.

### Current Strengths
The page is focused and easy to understand. It keeps staff-submitted notes from disappearing inside individual job records.

### Current Weaknesses
It overlaps with Admin Actions and schedule-card note badges. Notes have status, but not assignment, priority, due date, or notification flow. A note that needs work can still require someone to remember to create a separate action.

### Recommended Improvements
Merge the operational follow-up part of Team Notes into Admin Actions, or make notes automatically create linked actions when they require follow-up. Keep the notes route as a filtered view if useful.

### Page Direction
Merged with `/admin/actions`.

## `/admin/actions` - Admin Actions

### Purpose
Track ad hoc admin tasks, follow-ups, reminders, and VA work that does not yet belong to a stronger workflow.

### Primary User
VA, Joe.

### Inputs
Admin actions, linked properties, active properties, title, notes, priority, status, category, assignment, and due date where present.

### Outputs
Create actions and update action status through open, in progress, waiting on client, and done.

### Current Strengths
It provides a simple general-purpose task board and gives the VA somewhere to park work that would otherwise live in memory or chat.

### Current Weaknesses
Because it is generic, it can duplicate internal notes, communication follow-ups, invoice exceptions, and lead tasks. If actions are created manually rather than from workflow events, the system still relies on Joe or the VA remembering to create them.

### Recommended Improvements
Turn Admin Actions into the shared task layer for Communications, Team Notes, Invoices, Schedule, and Enquiries. Tasks should be generated from workflow events where possible, with manual creation as a fallback.

### Page Direction
Merged as a cross-page task layer, while preserving the route.

## `/admin/job-board` - Team Job Board

### Purpose
Manage overflow, unscheduled, quick, and optional jobs that are separate from the main schedule.

### Primary User
VA, Joe, Team.

### Inputs
Job board items, optional linked property, suburb, preferred date/time, assigned staff, status, priority, active properties, active staff, and staff responses.

### Outputs
Create job board items, assign staff, update status, and view team responses such as available, claimed, or not available.

### Current Strengths
The page gives overflow work a home without polluting scheduled jobs. Staff response visibility is a strong foundation for lightweight coordination.

### Current Weaknesses
It is intentionally separate from scheduling, so there is no conversion path yet from claimed item to scheduled job. There are no notifications, no due reminders, and no conflict checks against the main schedule.

### Recommended Improvements
Keep Phase 1/2 simple, then add optional conversion to scheduled job, staff notifications, and conflict visibility. Make the distinction between "job board item" and "scheduled job" very clear.

### Page Direction
Expanded.

## `/admin/labour-reconciliation` - Labour Reconciliation

### Purpose
Compare staff daily timesheet totals against job labour allocations for a selected date range.

### Primary User
VA, Joe.

### Inputs
Staff daily timesheets, job labour entries, staff/date keys, day status, status notes, property labels, job type, billable flag, and hours worked.

### Outputs
Read-only reconciliation table showing daily hours, job hours, differences, day status, allocation warnings, and labour entry details.

### Current Strengths
The page now correctly includes timesheet rows even when there are no job allocations, including public holidays and leave days. It also preserves landscaping entries where scheduled job ID is null.

### Current Weaknesses
It is read-only, so resolving issues requires the user to go elsewhere. It does not yet provide filters by staff, exception type, or payroll period beyond date range. Non-worked statuses are clearer now, but payroll/export workflow is still not explicit.

### Recommended Improvements
Add staff and exception filters, payroll-period shortcuts, export, and links back to the staff labour entry page or the affected job. Consider turning exceptions into Admin Actions automatically.

### Page Direction
Expanded.

## `/admin/quote-templates` - Template Settings

### Purpose
Manage reusable quote templates and present the conceptual flow for combined maintenance packages with separate garden and lawn service components.

### Primary User
Joe, Estimator.

### Inputs
Quote templates with category, customer scope, internal notes, terms, frequency, labour pricing, greenwaste, sprays, fertiliser, stump paste, and active status.

### Outputs
Edit existing template fields and preview the intended maintenance quote architecture at a UI concept level.

### Current Strengths
Existing template functionality remains intact. The new concept makes the future architecture clearer: customer-facing packages can be combined while internal components remain separate.

### Current Weaknesses
The conceptual maintenance quote flow is not backed by a full component-based schema yet. Lawn and garden services still rely on current template/pricing fields, so missing data must be shown as "Needs review" instead of guessed.

### Recommended Improvements
When ready, add service-component data structures for garden and lawn maintenance. Keep pricing review explicit, and avoid hardcoding Pristine-specific assumptions into the UI.

### Page Direction
Expanded.

## `/admin/profitability` - Profitability

### Purpose
Show property-level profitability and surface unlinked landscaping labour that is not included in profitability totals.

### Primary User
Joe.

### Inputs
`property_profitability` view, `profitability_summary` view, property service metadata, and unlinked landscaping labour entries.

### Outputs
Read-only financial table and summary metrics.

### Current Strengths
This page makes margin and labour-cost problems visible. The unlinked landscaping labour section is especially useful because it shows where data cleanup is needed before profitability can be trusted.

### Current Weaknesses
It is advanced and interpretation-heavy. The page depends on correct Xero revenue, labour links, service metadata, and cost assumptions. It has no action path for fixing low margin, missing links, or pricing problems.

### Recommended Improvements
Keep this behind Settings or an advanced/Joe-only area. Add remediation links: open property, inspect labour, review template, or create price review action.

### Page Direction
Hidden behind advanced settings until it has clearer operational actions.

## Adjacent Team and Staff Pages

These are not admin routes, but they affect admin workflow.

### `/labour` - Staff Labour

The staff labour entry page is a key input to Labour Reconciliation and Profitability. It should remain a team-facing page, but admin navigation correctly links to it because VA/Joe may need to inspect staff-entered hours. Its main product need is strong confirmation that daily status, total hours, job allocations, landscaping fallbacks, and notes are saving exactly as staff expect.

### `/team/job-board` - Team Job Board

This is the staff-facing companion to `/admin/job-board`. It should stay simple and mobile-first. The main future improvement is controlled claiming/availability feedback plus optional notifications, without turning job board items into scheduled jobs too early.

### `/jobs` and `/jobs/[id]` - Staff Jobs

These pages drive job attendance, completion, notes, and billing guidance. They are critical because admin schedule decisions become staff behavior here. Recent quoted/fixed-price and charge-up/time-flexible guidance reduces billing ambiguity. The next improvement is making staff instructions even more consistent between schedule cards and job detail.

## Workflow Gaps

### Duplicate Workflows

- Communications, Enquiries, and Admin Actions all handle lead or follow-up work, but they are not yet one unified intake workflow.
- Team Notes and Admin Actions both represent internal follow-up, but notes do not automatically become assigned actions.
- Quoted Jobs and Invoices both deal with quoted/fixed-price billing completion. This should become one invoice queue.
- Estimates exist across scheduled jobs, the estimates table, enquiries, quote requests, and calendar blocks. The business concept is clear, but the data flow is split.
- Job Board and Schedule both represent work allocation, but Job Board intentionally stays unscheduled. That distinction is useful, but future conversion needs to be explicit.

### Missing Workflows

- A communication that looks like a real lead should be convertible to an enquiry without manual re-entry.
- An enquiry should have an obvious next action: schedule estimate, create quote, create property, ignore, or close.
- Estimate completion should naturally lead to quote creation with the original enquiry/property context carried forward.
- Accepted quotes should produce a clear operational checklist: create property if needed, schedule first job, set invoice mode, prepare recurring invoice if required, and confirm customer communication.
- Invoice exceptions should be assignable or generate Admin Actions.
- Labour reconciliation issues should link directly to the staff/day/job records needed to fix them.
- Property records should show open operational context: upcoming jobs, open notes, invoice handling, active quote, and profitability concerns.

### Places Where Users Must Remember Information

- Joe or the VA must remember whether a communication has already become an enquiry when the direct conversion path is missing.
- The estimator assignment appears to rely on staff naming/configuration knowledge rather than a visible setting.
- Quote acceptance follow-up requires understanding several statuses across quote drafts, scheduled jobs, and recurring invoice setup.
- Admin must remember whether quoted jobs are handled on Quoted Jobs or Invoices.
- Team Notes requiring action need someone to remember to make or complete the corresponding Admin Action.
- Unlinked landscaping labour requires someone to remember the relationship between job names/codes, properties, and scheduled jobs.
- Xero invoice state still requires admin to know what Make.com and Xero are responsible for versus what the app controls.

### Areas Creating Unnecessary Owner Dependency On Joe

- Quote pricing and maintenance package decisions still depend heavily on Joe's knowledge of service components and pricing rules.
- Profitability interpretation is Joe-dependent because the page shows numbers but not recommended actions.
- Lead triage emails notify Joe, but the system still needs clearer delegation and ownership so Joe does not become the default human router.
- Accepted quote setup and recurring invoice setup need stronger checklists to reduce the need for Joe to remember each operational step.
- Estimate scheduling depends on implicit estimator configuration, which should become visible and configurable.
- Communications and Actions need stronger assignment, due dates, and generated next steps so VA work does not rely on Joe explaining what to do next.

## Overall Recommendation

Pristine Jobs is close to becoming a coherent operating system. The strongest next product move is not adding more standalone pages. It is connecting the existing pages into a small number of explicit workflows:

1. Lead enters through Communications or Enquiries.
2. Lead becomes an Estimate or Quote.
3. Accepted work becomes Scheduled Work or Job Board overflow.
4. Completed work becomes Invoice Review.
5. Exceptions become assigned Admin Actions.
6. Labour and profitability feed back into pricing and operations.

The current grouped navigation is the right direction. The next layer should be workflow-generated actions, clearer state transitions, and fewer places where Joe or the VA must remember the relationship between records.
