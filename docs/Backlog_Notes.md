# Pristine Jobs — Backlog notes

Captured during the 17–18 July build. **None of these are in Brief 04.** They are
recorded so they aren't lost, not so they get built now. Brief 04 (the boring
quote → proposal → matching invoice) is the live work and the priority.

---

## Quick-add lead from a pasted referral

**What:** a "Quick add" button on the sales board. Paste a structured referral
email (BNI is the clean case — fixed sender, fixed fields: Name, Phone, Email,
Comments, Temperature), and the app pre-fills the New Lead form. Owner reviews and
saves.

**Why (owner's framing, 18 July):** *"the more things are automated the less chance
of falling through the cracks — it's not really about the time saving."* The risk
is a referral from someone who vouched for you slipping under 2,400 inbox items,
not the 30 seconds of typing.

**Why quick-add and not auto-catch:** auto-arrival (a Zoho/Make rule that drops
BNI leads on the board unprompted) would catch more, but needs inbox-reading
plumbing and takes the owner out of the loop — and for a warm referral he may
*want* to be in the loop. Quick-add keeps him bringing the email to the app, which
sidesteps the "app can't see incoming email" wall entirely. Start here; revisit
auto-arrival only if referral volume justifies it.

**Shape:** paste box → field extraction → pre-filled New Lead form → save. The
Anthropic API is available to artifacts in this app, so the extraction can be a
model call rather than brittle regex. Fixed-format senders (BNI) are near-perfect
inputs. `source` should default to the channel (e.g. "BNI").

**Scope:** its own brief. Small. Independent of Brief 04.

---

## Job type on the lead

**What:** a Maintenance / One-off tidy / Landscaping selector on the lead itself
(not just free-text `service_needed`).

**Why:** `service_needed` must stay free text — the website form fills it, and its
descriptive wording is useful ("Lawn repair maintenance"). But Brief 04's template
auto-suggest currently *guesses* `quote_type` from those words. A real job-type
field makes it certain and removes the guess. The three values map 1:1 to the
three proposal templates.

**Scope:** small. Arguably belongs folded into Brief 04's Part 1 (the categorised
line items already touch quote_type). Decide when Brief 04 is picked up.

---

## The inbound-email gap (the recurring one)

Every "things slip" problem traces to the same root: **the app cannot see incoming
email.** Website leads self-arrive; anything else (a direct customer email, an
existing customer asking for more work, a referral) lands in Gmail/Zoho and
depends on the owner noticing.

- **BNI quick-add** (above) is the tractable slice — one known sender, fixed format.
- **Existing customers going quiet** is the harder, more valuable version — no
  clean template. Flagged as possibly the real gap, 17 July.

Not one build. A theme to keep naming until the board's real use shows which slice
actually hurts. Notifications were deliberately *not* built for the same reason —
adding alerts before knowing what slips produces noise the owner learns to ignore.

---

## The sold→scheduled seam (NEXT BRIEF — hit in real use 18 July)

**What's wrong:** when a quote is accepted, scheduling the job throws up a modal
that tells the owner to *go to the quote builder* to schedule. Owner's words:
*"I'd like to do it from the sales pipeline, and stay in there as much as
possible."*

**The principle:** the board is where the work happens. Actions belong on the
card, not on a screen the card sends you to. A modal that says "go elsewhere to do
X" is an instruction, not an action — the same anti-pattern as the "go to the
quote builder" schedule modal, and every other hand-off in the app the owner has
disliked.

**What it should do:** from the accepted-quote card, schedule the job in place —
pick a date, assign crew (auto-suggest team members), without leaving the pipeline.
The board already holds the property and job link (Brief 02); it has what it needs.

**In scope for the brief:**
- Schedule from the card: date, crew assignment, staff auto-suggest.
- **Scheduling must move the card automatically.** Right now (18 July, real use)
  the owner schedules the job, then has to *reopen the card and manually mark it
  scheduled* — two actions for one event. The act of scheduling should advance the
  board itself; the card moves to Job scheduled with no second step. This is the
  core of what makes the seam wrong: the board doesn't reflect what the owner just
  did until he tells it twice.
- Once scheduled, the card shows the day and time — and the address. Right now
  (18 July, real use) a scheduled card shows none of these, so the owner can't
  see when or where the job is without opening it. Day, time, and address on the
  card face. (Day/time deferred from Brief 02; address added 18 July.)
- `Mark Recurring Invoice Set Up` needs attention (flagged Brief 03).
- Multi-day quoted projects (a second `scheduled_jobs` row) behave as pre-046 —
  this is where that gets handled (deferred on PR #7).

**Why it's next:** it's the one remaining hand-off between the pipeline and the
rest of the app, and the owner hits it every time a quote is accepted — which,
post-Brief-04, is now a live path rather than a hypothetical.

---

## Multiple billing types per property (the Maggie case — surfaced 18 July)

**The insight:** a single property can carry more than one kind of work, billed
differently. Maggie Robertson has **fixed lawns** (recurring, subscription-style)
**and variable garden maintenance** (per-visit, charge_up) on the same property.
The app currently forces **one billing type per property**, so she can't be
expressed honestly — and for the same structural reason, a customer can't hold
**multiple quote templates**.

**What it needs (roughly — not designed):**
- Work/jobs on a property can each have their own billing type and template.
- Lawn jobs labelled and invoiced separately (fixed/recurring) from maintenance
  (charge_up per visit).
- A property/customer can hold several templates, chosen per job.

**Why it matters:** without it, mixed customers like Maggie get shoehorned into one
model — either her lawns get charged per-visit (wrong) or her maintenance gets
buried in a fixed fee (under-billing). Both are the quiet-money-leak class this
week keeps surfacing.

**Status:** its own brief, and not small. Maggie's data left untouched until it's
built. Do NOT force her to one billing type in the meantime.

---

## Billing model — the record set straight (18 July)

For future sessions, so the confusion doesn't recur:

- The quote builder was built during a **fixed-visit phase** the owner has since
  abandoned. Its text/logic assume maintenance = fixed monthly. That assumption is
  stale.
- **Current model: `charge_up` is the default** for maintenance — per visit, hours
  + greenwaste + extras, varies each time.
- **`subscription` is the deliberate exception** — ~6–7 fixed properties (Holly,
  15 Sunhill, 58 Allendale, Powell St, McDonald's-type, john). Fixed recurring,
  invoiced **by hand in Xero**. Hours recorded, **no per-visit invoice** — that
  skip is correct for them, not a bug.
- Subscription has **no automation** — confirmed by code+blueprint trace, not
  assumed. The amber warning at subscription-selection is the safety net.
- The builder default was changed maintenance → charge_up on 18 July. This touched
  formally-parked billing logic, but for a proven under-billing bug (7 jobs, 6
  customers, mislabelled subscription-on-charge_up-property), distinct from the
  parked double-invoice question.

---

## Quote builder redesign — make it service-aware and capture-first (18 July)

The owner will live in the quote builder; it's the one screen he can't avoid. Five
separate complaints on 18 July all reduce to **two principles**:

### Principle 1 — the builder reshapes itself to the customer's service type
Right now it shows everything for everyone. It should show only what's relevant to
*this* customer, and default to the common case.
- **New-customer fields visible by default; existing-customer as the dropdown
  fallback.** New customers are the predominant use. (Owner has raised this
  MULTIPLE times and it keeps getting dropped — it is a firm requirement. The
  builder should OPEN on new-customer entry, with "pick existing customer" as a
  dropdown/collapse option, not the reverse.)
- **Quote type pre-selected from the lead's service** — depends on the job-type
  field on the lead (separate backlog item); this is the payoff for building it.
- **Type filters everything downstream:** maintenance → frequency options +
  maintenance proposal; one_off → one-off proposal; subscription → subscription
  options + subscription proposal. The other two types' options don't render.
- Cutting the irrelevant options largely fixes the "bottom area too busy"
  complaint on its own.

### Principle 2 — capture hours/greenwaste/notes at quote stage, fast
The real workflow gap: the owner needs to record **hours, greenwaste, and site
notes while standing in the garden**, but today the only place is the full builder
— heavy enough that he'll lose the numbers if distracted mid-entry. Two routes,
both real, both his own idea:
- **Lightweight capture** — name, address, hours, greenwaste, notes — saves fast,
  becomes a quote later. Low risk of data loss.
- **Voice-to-quote** — speak notes + numbers in. A `VoiceToQuote: Webhook to Xero`
  Make scenario ALREADY EXISTS (seen in scenario list, currently off). Investigate
  what it does before building anything new.

### Cut now (redundant, safe)
- The **Status dropdown** (Draft / Xero Created / Accepted / Declined) in the
  builder. Leftover from when quotes originated in Xero. The app now drives status
  automatically off send + accept. "Xero Created" is meaningless post-Brief-04.
  Manual status-setting shouldn't exist.

### Why one brief, not five
These interact. Building the lightweight-capture before the service-aware reshape,
or voice-to-quote before either, means rework. Design the builder's new shape once,
then decide capture route. The Status-dropdown removal is the only piece safe to do
standalone.

**Priority note:** this is the screen the owner uses most, so it's high-value — but
it's polish on a builder that already works end-to-end (proven 18 July: quote →
accept → schedule → complete → matching Xero invoice, INV-2399). Do it as a
considered redesign, not a late-night accretion.

---

## Reusable category boilerplate (maintenance quote example, 18 July)

Real on-going maintenance quote (1a Meyrick Place) confirms the **charge_up model
in the customer's own words** — the quote is explicitly an estimate that varies:
- Greenwaste line: *"an 'average' estimate… can go up or down… may fluctuate
  between $26.50 and $66.25."*
- Sprays line: *"an indicative figure… price will fluctuate depending on product
  and amounts used."*

This is per-visit / varies-with-work billing (charge_up), not a fixed monthly fee.
The invoice engine correctly bills real hours/greenwaste; the quote sets the
estimate. Good confirmation the model is right.

**The finding:** the owner writes the same fluctuation boilerplate on every
maintenance quote (the greenwaste-varies and sprays-indicative notes, plus the
standard "each visit can include but isn't limited to…" scope list). These should
be **per-category default descriptions the builder pre-fills** when a category is
chosen on a maintenance quote — editable, but there by default. Part of the
service-aware builder redesign (Principle 1). Saves re-typing standard language and
keeps quotes consistent.

The current fixed-price proposal is fine for genuine subscription jobs; this is a
builder-side concern, not a proposal one. (A lawn-mowing / subscription template
branch is still wanted — see the multi-billing / Maggie note.)

---

## Follow-up visibility — the orange "F" (18 July, owner refinement)

Follow-ups aren't automated, so nobody (owner or VA) can currently *see* when one
is due. Owner's spec: a **faint follow-up button that turns light orange once the
follow-up is due** (e.g. 48 hours after the quote was sent), OR a **small orange
"F" in a circle on the card** to keep it cleaner. Visual, on the card, no email
needed. Pairs with the previously-noted snooze. Concrete and ready to build.

The follow-up *ladder* already fires timestamps (`quote_sent_at` starts it); this
is purely the visible signal that a step is due, for a human to action.

---

## CORRECTION — BNI quick-add vs the inbound-email gap (keep these separate)

Prior notes let these two blur. They are different and the owner has been clear:

- **BNI quick-add = the whole ask.** Owner pastes a referral email, presses a
  button, the app prefills a lead, he reviews and saves. He carries the email in.
  Small. Decided. **Does NOT involve the app reading any inbox.**
- **The inbound-email gap (app auto-reads incoming mail) is NOT something the owner
  has asked to build.** It's a theme the advisor kept naming; the owner explicitly
  chose the manual paste-button instead. It may never be built. Stop looming it
  over the quick-add — the quick-add is sufficient by the owner's own decision.

Do not re-merge these. The quick-add stands alone.

---

## Proposals — check what exists before building (18 July)

Before assuming five proposals need building, PREVIEW what Brief 04 already shipped:
- **maintenance** — exists, owner approved the look; needs honest per-visit pricing
  language (charge_up), which is the current in-flight fix.
- **one_off tidy** — Brief 04 built a treatment; owner should preview to confirm.
- **landscaping** — Brief 04 built a treatment; owner should preview to confirm.
- **subscription / fixed-price** — the existing fixed-price proposal; owner says
  it's fine as-is.
- **lawn mowing** — genuinely NEW, tied to the multi-billing / lawn-template branch
  (Maggie). Not built.

Likely reality: ~1 new proposal (lawn) + wording fixes, not 5 from scratch. Look
first.

---

## The three-views insight (Sandspit Road quote, 18 July) — the thread

A real landscaping quote (176 Sandspit Rd) revealed the owner naturally produces
ONE job in THREE views:
- **Internal View** — his margins, calculations, risk notes, exclusions. For
  tracking. ("One stump may be difficult… don't arrange grinding without approval.")
- **Team View** — crew sequence, materials to pick up, site risks, time/people.
  ("3 people, one full day. Chainsaw + recip saw. Don't lever against wall roots.")
- **Customer View** — scope of work + investment. The proposal.

Same job, three audiences, currently typed/kept separately. This is the "boring
quote is truth, proposal is clothes" principle extended: there's a THIRD set of
clothes (the crew's). The three asks below are all facets of not typing this thrice.

### 3a. Lead service-type → quote-builder type (EASY — do next)
Owner: *"when are we building the link where the service type from the lead
determines the suggested type in the builder… musn't be hard?"* Correct, it's small
— but prerequisite is the **job-type field on the lead as structured data** (not
free-text `service_needed`). Two small pieces: (1) job-type field on lead
(Maintenance/One-off/Landscaping), (2) builder pre-selects from it. This unlocks the
whole service-aware builder redesign, so it's the natural FIRST task next session.

### 3b. Quote → scheduled-job brief for the crew (the Team View)
Pipe the quote's line items + customer scope into the scheduled job so the crew
sees what to pick up and the scope, in the app. Data already exists on the quote
(job links via `first_scheduled_job_id`). Part of the sold→scheduled seam.
**Tension to respect:** the Team View is RICHER than customer scope (crew sequence,
site risks, tools). So the quote auto-fills a *starting* job brief; owner adds
crew-specific notes on top. Don't promise the quote alone briefs the crew fully.

### 3c. Quote log book (the Internal View)
Owner keeps an internal record per quote for tracking. Could auto-extract quote
details into a log/ledger. Reporting feature, lower priority than 3a/3b, but the
natural home for the Internal View data.

### Also seen on Sandspit: multi-quote + options-excluded
This quote is legitimately TWO quotes (clearance / planting) plus two priced
options (pebble, timber border) excluded from the base total, with a combined-totals
matrix. This is the SAME shape as the earlier Lucia Glade quote — so
multi-quote-in-one-document and options-excluded-from-total are a RECURRING real
need for landscaping, not a one-off. Revisit whether the landscaping proposal
should support grouped quotes + optional line items when the multi-billing/template
work is done. (Owner is currently fine sending these as 2 separate quotes.)
