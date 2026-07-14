# Phase 1 — Sales Pipeline Board (build spec)

Companion to `docs/PIPELINE_BUILD_BRIEF.md`. This is the detailed design for the main
Sales Pipeline page, agreed via mockup. Build this on top of the existing `sales_leads`
table and the accept→schedule→invoice backend already proven in Phase 0.

Keep this file in the repo (e.g. `docs/PHASE1_PIPELINE_BOARD_SPEC.md`) and point Claude
Code at it. Prepend the build brief's Section 3 (repo conventions) to every prompt.

---

## 1. The concept

One page = the whole sales-to-paid lifecycle. **Layout is one row per client**, with six
stage columns. A client's card sits in the column for their current stage; the cells to the
left show faint completed ticks so you can read each client's progress across their row. This
avoids the "jumbled stacked column" feel the owner disliked.

Below the board sits an **Invoiced jobs** section (quieter, out of the way of live leads),
and an **Add existing customer** entry between the two.

Only **new** customers enter at the left (New lead). Existing/repeat customers are added via
search and enter partway (Visit booked).

---

## 2. The six stages (columns)

Map to `sales_leads.status`. Current enum is `new → contacted → visit_booked → estimate_done
→ quote_sent → follow_up_due → won → lost`. This board reshapes the *presentation* into six
columns; reconcile the underlying statuses to these stages (add/rename values as needed, via
migration, verifying live values first):

| # | Column | Underlying status idea | Card's primary action |
| --- | --- | --- | --- |
| 1 | New lead | `new` | **Contact** — opens pre-filled intro message, sends, → Contacted |
| 2 | Contacted | `contacted` | **Confirm visit** — once a date is agreed, → Visit booked |
| 3 | Visit booked | `visit_booked` | date/time shown; checkbox **Move to quote** → Quote |
| 4 | Quote | `quote_sent` (+ accepted state) | **Create + send quote**; **Schedule job** (disabled until accepted) |
| 5 | Job scheduled | new status e.g. `scheduled` | date/time shown (read-only, just visibility) |
| 6 | Job completed | new status e.g. `completed` | **Send invoice**; card stays as history |

Won/lost: a lead can be marked lost from any stage (small action in the card drawer), which
removes it from the active board.

---

## 3. Card behaviour

**Compact (default):** client name, then `suburb · service` on one line, then the stage's
primary action button. Nothing else.

**Expanded (click the card / chevron):** expands *in place*, pushing that row taller. Shows:
- Source (web form, phone, Bark, Buildercrack, BNI, chatbot, etc.)
- Notes
- Message thread — a logged/summarised list of what was sent and their replies
- Secondary actions: mark lost, edit details, manual stage override

**Completed-stage cells** (left of the active card) show a faint check icon. Future cells are
empty. This is the progress staircase.

---

## 4. Stage-by-stage detail

**New lead → Contacted.** Card shows Contact button. Clicking opens a pre-filled message
(reuse `getContactDraft`) acknowledging the enquiry and asking for good days/times. Sending
queues a row in `client_contact_messages` (existing Make send pattern), logs it to the thread,
and advances the card to Contacted.

**Contacted.** Back-and-forth is logged/summarised on the card (thread view). If no reply in
2 days, a **Follow-up sent** badge appears (reuse `getFollowUpDraft` + `next_follow_up_at`).
When a visit date is agreed, **Confirm visit** captures the date/time and advances to Visit
booked.

**Visit booked.** Shows the agreed day/time. A **Move to quote** checkbox manually advances
to Quote (after the visit's happened and you're ready to price).

**Quote.** Two buttons:
- **Create + send quote** (active) — builds/sends the quote. If no reply in 2 days, a
  **Follow-up due** badge shows.
- **Schedule job** — rendered *faint/disabled* until the quote is accepted, then enabled.

Acceptance happens **two ways**, both set the accepted state:
- Customer accepts via the public quote link (existing `/public/quote/[token]` flow → auto).
- Owner clicks a **Mark accepted** action (for yes-by-text/phone).

Optionally show a small **Accepted ✓** badge on the card once accepted, so it's visible at a
glance even though acceptance isn't its own column. Clicking the now-enabled **Schedule job**
button books it (reuse the Phase-0 `createAcceptedQuoteSchedule` path) and advances to Job
scheduled.

**Job scheduled.** Read-only: shows day/time + assigned staff. Purpose is just visibility
that someone booked it. No action needed here; the field team marks the job complete from the
work schedule.

**Job completed.** When the team marks complete, the fixed-price invoice is **auto-created**
(the Phase-0 Make scenario — job flips to `ready_to_convert`, Make builds the SUBMITTED Xero
invoice). Card shows **Invoice ready**, then a **Send invoice** button. The card **stays in
Job completed as history**, and a copy of the invoice appears in the Invoiced section below.

Only two job types reach invoicing: **quoted/fixed-price** (invoice matches the quote) and
**maintenance/subscription**. No other options unless the job materially changed.

---

## 5. Invoiced jobs section (below the board)

When **Send invoice** is clicked, the invoice lands in this section (the card leaves the
active board; the completed-history card remains in column 6). Each row: checkbox, client ·
suburb, invoice number, amount, status (Awaiting / Paid).

- **Paid checkbox** — app-only. Ticking marks the job paid in the app (`scheduled_jobs`), for
  the owner's own tracking. Xero is reconciled separately; this does not push to Xero.
- **Clear paid** button — archives the ticked/paid rows off the page.

This keeps finished work out of the way so the board leads with live leads.

---

## 6. Existing / repeat customers

An **Add existing customer** entry sits between the board and the Invoiced section. It opens a
**customer search**; picking a customer and entering what they want creates a card that
enters the board at **Visit booked** (skipping New lead → Contacted → Quote-courtship, since
they're already a known, responsive customer). From there it flows through the normal stages.

(Design later: whether repeat customers who just want a straight re-book should skip even
further, e.g. straight to Job scheduled. For now, Visit booked is the entry point.)

---

## 7. Data / backend notes

- Reuse `sales_leads` as the single record (per build brief Decision 1). Reconcile its status
  values to the six stages via migration; verify live values before changing constraints.
- Reuse existing send pattern (`client_contact_messages` + Make), notification helper
  (`sendLeadNotificationToJoe`), and templates (`getContactDraft`, `getFollowUpDraft`).
- Reuse Phase-0 accept→schedule→invoice path unchanged.
- Sorting default: newest lead at top. (A future toggle could group rows by stage.)
- Mark-paid is app-only — a simple `scheduled_jobs` update, no Xero call.
- **Advancement is MANUAL in this build.** Cards do not move themselves. The owner reads the
  customer's reply in their own inbox, then clicks the stage action to advance and log it. No
  inbound-email detection or auto-advance is built in Phase 1 — that is a later, separate slice
  (Section 8, slice 7) added only after the board is proven. This guarantees a lead can never
  silently go cold because the app "missed" a reply. The one exception already built is quote
  acceptance via the public link, which can auto-set the accepted state.
- Follow all repo conventions (RLS `user_id` on inserts, async `params`, deterministic dates,
  runtime-verify) from the build brief's Section 3.

---

## 8. Suggested build order (small, testable slices)

1. **Board shell + row-per-client layout** — render `sales_leads` as rows with six stage
   columns and the progress-tick staircase. Read-only first.
2. **Card compact + expand drawer** — name/suburb/service; expand shows source/notes/thread.
3. **Stage actions & advancement** — wire each stage's button to advance status and log to
   the thread (Contact, Confirm visit, Move to quote, Create+send quote, Mark accepted,
   Schedule job, Send invoice).
4. **Follow-up badges** — surface Contacted/Quote follow-ups off `next_follow_up_at`.
5. **Invoiced section + paid/clear** — the below-board section, app-only mark-paid, archive.
6. **Add existing customer** — search → card entering at Visit booked.

Each slice: build, runtime-test, commit on its own branch, then move on.

**Slices 1–6 ship a fully working board with manual advancement.** Only after that is proven
and in daily use should the following be attempted:

7. **(Later, optional) Reply detection — assist, not automate.** Incoming email lands in
   `communications` (via the existing "Communication: Hub" Make scenario). Try to auto-match it
   to a lead by sender email address. **Matched** → surface the reply on that lead's card and
   flag it "new reply"; the owner still reads it and clicks to advance (never auto-advance
   money-adjacent stages). **Unmatched** → drop it into a small "unmatched replies" tray for
   one-click assignment to a lead. Build this as an additive layer so that if matching
   misbehaves it never blocks or breaks the core board. Texts / phone / Bark / Buildercrack /
   BNI replies are out of scope here — each is its own later channel integration, or stays
   logged manually. Do NOT build token/threading-based auto-advance early.
