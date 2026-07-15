# Pristine Jobs — Lead-to-Invoice Pipeline Build Brief

A single source of truth for building the full lead → estimate → quote → job → invoice pipeline
in VS Code (Claude Code). It is grounded in the current repo and the seven Make.com scenarios.

**How to use this doc:** confirm the decisions in Section 0 first (they shape everything).
Then run the phases in Section 4 in order — each phase is one coherent, testable chunk with a
ready-to-paste prompt. Section 3 lists cross-cutting rules that *every* phase must honour, so no
notification or step gets dropped. Keep this file open in the repo (e.g. `docs/PIPELINE_BUILD_BRIEF.md`)
and point Claude Code at it in each prompt.

---

## 0. Decisions to confirm before starting

These four choices determine the shape of the build. Recommended defaults are given; change them if you disagree, but lock them before Phase 0.

1. **One lead record — LOCKED.** Today leads split across `sales_leads` (website form), `admin_enquiries` (manual/phone), and inbound email in `communications`.
   - **Decision:** `sales_leads` is the single pipeline. Every channel funnels into it and each lead starts its journey there. `admin_enquiries` and inbound-email leads become *ways to create a `sales_leads` row*, not parallel systems; `communications` stays as the message log linked to a lead.
   - **Pipeline UI:** a Kanban board where each lead is a card showing **name · suburb · service**, moved across columns matching the status machine (`new → contacted → visit_booked → estimate_done → quote_sent → follow_up_due → won → lost`).
   - **Starting column:** every lead starts at `new`, regardless of `source`. *(Superseded in Slice 2.5: the earlier rule that Bark/Buildercrack enter at `contacted` is dropped — there is no source-based stage routing.)*

2. **Fixed-price invoice is built from the quote, at `SUBMITTED`.** The existing "Pristine App to Xero Invoice" scenario builds per-visit invoices at `DRAFT`. The fixed-price invoice must instead use the accepted quote's line items and post at Xero status `SUBMITTED` (Awaiting Approval).
   - **Recommendation:** trigger it off the `scheduled_jobs` row (where `invoice_method = 'quoted'` and work is complete), build line items from the linked `quote_drafts.line_items`, and store the resulting Xero invoice id/number/status back on `scheduled_jobs`.

3. **Stop the per-visit leak with belt *and* braces.** For a `quoted` job, visits must never turn into their own invoice.
   - **Recommendation:** (a) in-app, auto-set those visits to `invoice_status = 'excluded'` so they never enter the queue; **and** (b) add a filter to the existing invoice scenario so it ignores visits whose job `invoice_method = 'quoted'`. Two independent guards.

4. **Notifications reuse the two patterns you already have.** Joe's email alerts go through the existing lead-notification webhook (`sendLeadNotificationToJoe`); client-facing sends go through the `client_contact_messages` queue that the "Schedule: Email contact" scenario drains via Zoho.
   - **Recommendation:** notify Joe on: new lead, quote accepted, and invoice awaiting approval. Client sends: first-contact template, follow-ups, and visit confirmation. (Full list in Section 3.)

---

## 1. Target end-to-end pipeline (the end goal)

A lead arrives from **any** channel (text, email, website form, phone, Bark, Buildercrack, BNI, Facebook, etc.) and lands as one `sales_leads` row. From there:

1. **Lead in** → row created, `source` set, Joe notified.
2. **Contact** → VA sends the pre-filled "thanks for getting in touch, when suits for a look?" template; status → `contacted`.
3. **Follow up** → if no reply in 2 days, follow-up message queued; status → `follow_up_due`.
4. **Book visit** → estimate appointment created in the estimates calendar and confirmed with the client; status → `visit_booked`.
5. **Visit done** → status → `estimate_done`.
6. **Quote produced** → `quote_drafts` row created *linked to the lead*; sent to client; status → `quote_sent`.
7. **Accept / decline** → public quote page; if no reply, 3/7/14-day follow-ups; on accept status → `won`, on decline → `lost`.
8. **Schedule job** → accepted quote creates a `scheduled_jobs` row (already wired) carrying `quoted_amount` and the quote link.
9. **Job done** → visit(s) recorded.
10. **Quote → invoice** → for `quoted` jobs, the quote becomes a Xero invoice at `SUBMITTED`, linked to the original quote and job. No stray per-visit invoice.

The whole chain must be *linked by data* (foreign keys), so a lead carries through automatically instead of being re-keyed at each stage.

---

## 2. The data-model spine (the backbone of the build)

The single biggest gap: the first half of the pipeline is unlinked islands. **Migrations are numbered sequentially; the last is `033`, so start at `034`.** Verify live column names before any foreign key (`scheduled_jobs` is the live jobs table; `admin_enquiries` is the real enquiry table).

**Already linked (from migration 009 — don't rebuild):** `estimates.quote_draft_id` ↔ `quote_drafts.estimate_id`, `estimates.enquiry_id` → `admin_enquiries`, `estimates.communication_id` → `communications`, `estimates.converted_property_id` → `properties`. `quote_drafts.property_id` is already nullable. The estimate → quote link exists; what's missing is the link from that chain up to the pipeline (`sales_leads`).

| New link to add | Where | Purpose |
| --- | --- | --- |
| `estimates.sales_lead_id` → `sales_leads(id)` (nullable) | estimates | the key missing link — ties the estimate→quote chain to its pipeline lead |
| `sales_leads.property_id` → `properties(id)` (nullable) | sales_leads | connects a lead to a created property |
| `communications.sales_lead_id` → `sales_leads(id)` (nullable) | communications | inbound email/message log attaches to the lead |
| `scheduled_jobs.xero_invoice_id` / `xero_invoice_number` / `xero_invoice_status` | scheduled_jobs | stores the fixed-price invoice result + lets status sync back |

Because the estimate already links to its quote, a quote reaches its lead via `estimate`. A direct `quote_drafts.sales_lead_id` is optional convenience only.

Also confirm/normalise the existing quoted-path fields: `scheduled_jobs.invoice_method` (`quoted` / `subscription` / `non_billable`), `billing_mode`, `quoted_amount`, `quoted_scope`, `quoted_materials`, `quoted_invoice_status` (add a `ready_to_convert` value alongside `converted`).

Once these exist, "a lead's journey" is a single joined query, and every downstream automation can find the lead it belongs to.

---

## 3. Cross-cutting rules every phase must honour

Put this block at the top of every Claude Code prompt so nothing is dropped.

**Repo conventions (from `docs/CODING_AGENT_RULES.md`):**
- Verify real DB table/column names before creating foreign keys (`scheduled_jobs` is the live jobs table, not `jobs`).
- RLS uses `auth.uid()`. Client-side inserts must include `user_id` (`supabase.auth.getUser()`), or do the insert server-side.
- Only add `"use server"` to modules that export server actions, not to plain server components.
- Dynamic App Router pages: support async `params` (await when it's a Promise).
- Use deterministic date formatting (`toISOString()`), not `toLocaleString()`, in text rendered on both server and client (hydration).
- TypeScript passing ≠ working. Do a real runtime check of list/create/detail flows before calling a phase done.

**The Make.com boundary (do not re-implement in the app):**
- The app never calls Xero or sends email directly. It sets flags/statuses and writes queue rows; Make.com does the outside-world action and writes results back.
- Client sends: app inserts a row into `client_contact_messages` (subject, body, recipient, status); the "Schedule: Email contact" scenario sends it via Zoho and flips `status` to `sent`.
- Joe alerts: app calls the lead-notification webhook (`NEXT_PUBLIC_LEAD_NOTIFICATION_WEBHOOK_URL`) via the existing `sendLeadNotificationToJoe` helper.
- Multi-channel intake: every channel POSTs to the existing public endpoint `/api/public/sales-leads` (secret header `x-pristine-leads-secret`). New channels = new Make scenarios pointing at that one endpoint; the app side already accepts them.

**Notifications & sends checklist (must all exist at the end — do not drop any):**
- New lead created (any channel) → notify Joe. *(exists: `sendLeadNotificationToJoe`)*
- First-contact template send to client → `client_contact_messages`. *(template exists: `getContactDraft`)*
- No reply after 2 days at contact stage → follow-up send + status `follow_up_due`. *(field: `next_follow_up_at`; template: `getFollowUpDraft`)*
- Visit booked → confirmation send to client. *(new)*
- Quote sent → 3 / 7 / 14-day follow-ups if no response. *(fields exist: `followup_3day/7day/14day_sent_at`)*
- Quote accepted → notify Joe + auto-create scheduled job. *(partly exists)*
- Invoice created & awaiting approval → notify Joe. *(new)*

---

## 4. Phased build plan (run in order)

Each phase is independently shippable and testable. Paste the prompt into Claude Code from the repo root, and prepend the Section 3 block.

### Phase 0 — Fix the invoice path (ship value first)

*Goal:* fixed-price (`quoted`) jobs stop generating stray per-visit invoices, and instead produce one Xero invoice at `SUBMITTED`, built from the accepted quote and linked to the job.

*App changes:*
- Add migration `034` for `scheduled_jobs.xero_invoice_id/number/status` and the `quoted_invoice_status = 'ready_to_convert'` value.
- Wherever a visit is marked ready for invoice, if its `scheduled_jobs.invoice_method = 'quoted'`, set `invoice_status = 'excluded'` instead of `'ready'` (belt).
- On the `/admin/quoted-jobs` "convert" action, set `quoted_invoice_status = 'ready_to_convert'` (the signal Make will pick up) rather than only tracking state.

*Make.com changes (spec — you build these on that side):*
- In **"Pristine App to Xero Invoice"**: add a filter after the `scheduled_jobs` lookup so visits whose job `invoice_method = 'quoted'` are skipped (braces).
- New scenario **"Quoted Job → Xero Invoice (Submitted)"**: trigger on `scheduled_jobs` where `invoice_method = 'quoted'` AND `quoted_invoice_status = 'ready_to_convert'`; look up the linked `quote_drafts.line_items`; `CreateInvoice` with `Type: ACCREC`, `Status: SUBMITTED`, line items from the quote; write `xero_invoice_id/number/status` back to `scheduled_jobs` and set `quoted_invoice_status = 'converted'`; notify Joe.
- Extend the three status-sync scenarios ("Invoice: Status Paid/Sent", "Xero: Invoice Paid update", "Xero: Update App Invoices") to also read/write invoice status on `scheduled_jobs`, not just `visits`.

*Paste-prompt:*
> Read `docs/PIPELINE_BUILD_BRIEF.md`. Implement Phase 0 only. Create migration `034` adding `xero_invoice_id`, `xero_invoice_number`, `xero_invoice_status` to `scheduled_jobs` and a `ready_to_convert` option for `quoted_invoice_status` (verify the live column/constraint first). In the app, make any visit belonging to a job with `invoice_method = 'quoted'` get `invoice_status = 'excluded'` instead of `'ready'`, and make the quoted-jobs "convert" action set `quoted_invoice_status = 'ready_to_convert'`. Do not call Xero from the app. List the exact Make.com scenario edits I need to make separately. Follow all rules in Section 3 and verify at runtime.

### Phase 1 — Unify intake into one lead record

*Goal:* every channel and the manual `admin_enquiries` flow create one `sales_leads` row; inbound-email leads attach too. The pipeline is a Kanban of name·suburb·service cards.

*App changes:* make `/admin/enquiries` create/write `sales_leads` rows (or migrate `admin_enquiries` into it); ensure `/api/public/sales-leads` is the single intake endpoint; attach inbound `communications` to a lead via `sales_lead_id`; fire the new-lead notification on every path. Render the pipeline as a Kanban board (columns = statuses; card = name · suburb · service). **Every lead starts at `new` regardless of `source` — no source-based stage routing (the earlier Bark/Buildercrack → `contacted` rule is superseded).**

*Paste-prompt:*
> Read `docs/PIPELINE_BUILD_BRIEF.md`. Implement Phase 1 only: consolidate lead intake so `sales_leads` is the single pipeline record. Route manual enquiries (`admin_enquiries`) and inbound-email leads into `sales_leads`, add `communications.sales_lead_id`, and ensure `sendLeadNotificationToJoe` fires on every intake path exactly once. Every lead starts at `new` regardless of `source` (no source-based stage routing). Render the pipeline as a Kanban board of name·suburb·service cards across the status columns. Keep `/api/public/sales-leads` as the one public intake endpoint. Follow Section 3 and verify at runtime.

### Phase 2 — Link the spine (lead → estimate → quote)

*Goal:* booking a visit and producing a quote carry the `sales_lead_id` automatically; status transitions follow.

*App changes:* migrations for `estimates.sales_lead_id`, `quote_drafts.sales_lead_id`, `sales_leads.property_id`; on booking an estimate set lead → `visit_booked`; on quote create set lead → `quote_sent`; on accept/decline set `won`/`lost`. A lead detail view should show its estimate, quote, job, and invoice in one place.

*Paste-prompt:*
> Read `docs/PIPELINE_BUILD_BRIEF.md`. Implement Phase 2 only: add the foreign keys in Section 2 linking estimates and quote_drafts to `sales_leads`, and wire the status transitions (`visit_booked`, `estimate_done`, `quote_sent`, `won`, `lost`) as those records are created/updated. Add a lead detail view that joins lead → estimate → quote → scheduled job → invoice. Verify names before FKs, follow Section 3, verify at runtime.

### Phase 3 — Automations & follow-ups

*Goal:* the timed sends and confirmations run without manual chasing.

*App changes:* ensure each stage writes the right `client_contact_messages` row and stamps the follow-up fields; expose the templates. *Make.com:* scenarios that watch `sales_leads.next_follow_up_at` and the quote follow-up fields and drain them via the existing send pattern; visit-booked confirmation send.

*Paste-prompt:*
> Read `docs/PIPELINE_BUILD_BRIEF.md`. Implement Phase 3 only: for each pipeline stage, queue the correct `client_contact_messages` row (first contact, 2-day follow-up, visit confirmation, 3/7/14-day quote follow-ups) and stamp the tracking fields. Do not send email from the app. Then give me the exact Make.com scenarios to add/edit to drain these on schedule. Confirm every item in the Section 3 notifications checklist is covered. Follow Section 3 and verify at runtime.

---

## 5. Make.com change summary (the other half)

The app work above is only complete alongside these. Build/edit on the Make side:

- **Pristine App to Xero Invoice** — add the `invoice_method != 'quoted'` skip filter (Phase 0).
- **Quoted Job → Xero Invoice (Submitted)** — new; the fixed-price path at `SUBMITTED` (Phase 0).
- **Invoice: Status Paid/Sent**, **Xero: Invoice Paid update**, **Xero: Update App Invoices** — extend to sync status onto `scheduled_jobs` for quoted invoices, not just `visits` (Phase 0).
- **Schedule: Email contact** — already drains `client_contact_messages`; confirm it handles the new message types (Phase 3).
- **New follow-up scenarios** — watch `sales_leads.next_follow_up_at` and quote follow-up fields; queue/send (Phase 3).
- **New channel intake scenarios** — one per channel (Bark, Buildercrack, Facebook, etc.), each POSTing to `/api/public/sales-leads` (Phase 1).

---

*Anchors already in the codebase you're building on: `sales_leads` status machine (migration 032), `quote_drafts.quote_type` + `line_items` (006/019), `scheduled_jobs.invoice_method/quoted_amount/quoted_invoice_status` (020 + quoted-jobs page), `client_contact_messages` send queue, `sendLeadNotificationToJoe` (`lib/lead-notifications.ts`), and `getContactDraft`/`getFollowUpDraft` (`lib/sales-lead-templates.ts`).*
