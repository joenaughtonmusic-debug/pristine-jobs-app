# Brief 04 — The Boring Quote, The Proposal, The Matching Invoice

**For:** Claude in VS Code (Pristine Jobs repo)
**Date:** 18 July 2026
**Prerequisite:** Briefs 01–03 merged and live.

---

## READ THIS FIRST

`scripts/*.sql` has drifted from the live database — see `CLAUDE.md`. Verify
against the live DB. Every fact below was read from the live schema, live Make
blueprints, or the owner's real Xero quotes on 18 July 2026.

---

## The owner's words

> "The boring quote is the truth. The proposal is the clothes."
>
> "So long as the amounts are matched with the invoice, and ideally the
> description, then that's all it needs."
>
> "Majority of my quotes are just Labour, Materials, and Greenwaste or general
> waste and maybe plants. That's it."

He enters every quote **twice** today: once as a designed proposal document, once
as a Xero quote. This brief makes him enter it once.

---

## The finding this brief exists to fix

**The app cannot invoice a quoted job.** `invoice_line_items_for_make` has three
branches and **none of them look at `invoice_method`**:

1. Labour — description hardcoded `'Garden Maintenance – ' || address`,
   qty = `visits.hours_worked`, price = `properties.hourly_rate`, account `10010`
2. Greenwaste — `visits.greenwaste_bags` × `properties.greenwaste_rate`, account `10114`
3. Extra charges — from `visit_extra_charges`, **all forced to account `10010`**

So a $9,357 fixed-price landscaping job would invoice as *hours × hourly rate*,
described as "Garden Maintenance", with materials revenue posted to the labour
account. Wrong number, wrong words, wrong ledger.

This is why quotes have always gone out from Xero by hand. The app only ever
worked for maintenance. INV-2382 — the one proof the engine works — was a $1,210
maintenance invoice.

**The Make invoice scenario is fine** — it maps `item_code`, `account_code`,
`tax_type`, `quantity`, `unit_amount`, `description` straight through into Xero's
LineItems array. The view is what's starving it. Don't touch the scenario.

---

## The target shape — from the owner's real Xero quote (QU-0576)

| Item | Account | Qty | Price |
|---|---|---|---|
| Labour | `10010 - Income - Labour` | 30 | 97.50 |
| Materials | `10011 - Income - Materials` | 1 | 1893.59 |
| Tool Hire | `200 - Sales Income` | 1 | 650.00 |
| *(Greenwaste, where used)* | `10114` | bags | rate |

**Note the pattern:** the itemised breakdown lives as **text inside the line's
description**, not as separate rows. Materials is one line at $1,893.59 whose
description lists GAP40, gravel, fabric, edging, fixings, delivery, skip bin.

That is the owner's own compression, done by hand, every time. **Reproduce it —
don't improve on it.** Three to five lines, each with an account, each with a free
text description. Not a general-purpose ledger.

`tax_type` is `OUTPUT2` throughout. `LineAmountTypes` is `Inclusive`.

---

## Build

### Part 1 — Line items carry their accounts

`quote_drafts.line_items` is `jsonb`. `quote_line_items_for_make` currently exposes
only `description, quantity, unit_price` — no account, no item code. That is the
whole reason the (now disabled) "Xero: Create Quote" scenario hardcoded one Labour
line at `10010`: it had nothing else to read.

Give each line item: `item_code`, `account_code`, `tax_type`, `sort_order`,
alongside the existing description/quantity/unit_price. Mirror
`invoice_line_items_for_make`'s column shape exactly — same names, same types.
The two must be interchangeable, because Part 2 unions them.

**Seed a category list rather than free-typing account codes.** **Confirmed by the
owner, 18 July** — these are his actual accounts, not inferred:

| Category | account_code |
|---|---|
| Labour | `10010` — Income · Labour |
| Materials | `10011` — Income · Materials |
| Plants | `10115` — Income · Plants |
| Greenwaste | `10114` — Income · Greenwaste |
| Sprays / extras | `10011` — Income · Materials |
| Tool hire | `200` — Sales Income |
| General waste | `200` — Sales Income |

**Seven categories. That is the whole list — no free-typing of account codes.**
The owner's instruction, 18 July: *"organic spray and all these other edge cases
can just be contained within sprays/extras."* QU-0573 has separate "Weedkiller –
extra strength" ($6.00) and "Organic Weedkiller" ($6.48) lines — under this model
both are **Sprays / extras**, distinguished by their description. Multiple lines
may share a category; that's expected, not a problem.

Resist adding categories. Every new one is an account decision, and the owner has
made all of them.

`item_code` must match an **existing Xero item** or Xero rejects the line.
Confirmed in use: `Labour`, `Materials`, `Greenwaste`, `Toolhire`. **`Plants` is
unverified** — check the owner's Xero item list before assuming, and fall back to
`Materials` as the item code with `10115` as the account if no Plants item exists.
Item code and account code are independent; don't couple them.

The owner notes `200 - Sales Income` is a legacy catch-all — general waste landing
there is history, not design. Don't refactor it; just carry it through.

Builder UI: pick a category, type a description, qty, price. Default one Labour
line. Migrate existing `line_items` rows to `Labour`/`10010` — that is what they
effectively were.

### Part 2 — The invoice branches on `invoice_method` ⭐

**This is the brief. Everything else is scaffolding.**

Rewrite `invoice_line_items_for_make` so it branches:

- **`invoice_method = 'quoted'`** → emit the **quote's** line items, via
  `scheduled_jobs → quote_drafts` (Brief 02 gives you the chain; note
  `quote_drafts` has both `scheduled_job_id` and `first_scheduled_job_id` —
  check the code for which is authoritative, and say which you used).
  The customer agreed a price. Invoice that price.
- **`invoice_method` = `charge_up` / `subscription`** → the three existing
  branches, unchanged. Do not regress maintenance. It is the only thing that
  works today and it is most of the business.

Same output columns either way — the Make scenario must not change.

**Design decisions to make and state, not to ask about:**
- A quoted job with multiple visits must not invoice the quote once per visit.
  Emit the quoted lines against the **first** completed visit only, or gate on
  `scheduled_jobs.invoice_method = 'quoted' AND NOT EXISTS (a prior invoiced
  visit for this job)`. Pick one, explain it.
- Extra charges logged on a **quoted** job are variations — genuinely extra, not
  part of the agreed price. Include them **in addition** to the quoted lines.
  Say so in the description.

**Also fix, while you are here:** `visit_extra_charges` currently force account
`10010` — labour income — regardless of what the charge is. **The owner's call,
18 July: extras post to `10011` — Income · Materials.** Sprays, fertiliser, stump
paste are materials, not labour. Add `account_code` to `extra_charge_items`,
default the existing rows to `10011`, and read it through the view rather than
hardcoding.

**This is misfiling revenue on invoices being issued today** — every extra charge
your crew has ever logged has landed in the labour account. Worth telling the
owner how far back that goes so he can decide whether his accountant needs to
know.

### Part 3 — The proposal is the clothes

**The proposal already exists**: `app/public/quote/[token]/page.tsx`, ~15k, renders
line items, `customer_scope`, terms, accept button. **The owner has now looked at
it and says the maintenance treatment "looks great."** There is no other proposal
component in the repo — his Lucia Glade PDF was made outside the app, by hand, and
he confirms it was **not built with this system in mind**. It is not a spec.

**⚠️ Do not build:** groups/sub-quotes, options-excluded-from-total, per-area
narrative blocks, two-quotes-in-one-document. All considered and **cut by the
owner on 18 July**. Lucia Glade is an artefact, not a requirement.

**PDF upload: not in v1.** The owner's preference, having seen the live page:
*"rather than me making one and uploading as a pdf — but could be a nice option."*
Park it. Nothing in the invoice chain would ever read it anyway.

**One structure for all three types.** Verified against his real quotes:

| Quote | Lines |
|---|---|
| QU-0570 one-off tidy | Labour 440.00 *(long prose description)*, Greenwaste 39.75 |
| QU-0573 garden tidy | Labour 1,120.00 *(long prose)*, Greenwaste 185.50, Weedkiller 6.00, Organic Weedkiller 6.48 |
| QU-0576 landscaping | Labour 2,925.00 *(30 × 97.50, long prose)*, Materials 1,893.59, Tool Hire 650.00 |

Same shape throughout: **category + description + qty + price**. The only variation
is which categories appear and how much prose sits in the Labour description.
**There is no structural difference between job types.** Don't invent one.

**So the three templates differ in wording only** — title, preamble, and whether
frequency/monthly-equivalent shows. Same renderer, same components, same layout:

- **`maintenance`** — done. The owner approves it. Don't touch it.
- **`one_off`** — "One-off tidy". Scope, lines, total, accept.
- **`landscaping`** — same as `one_off` with its own preamble text. The owner:
  *"same as one off tidy… PDF similar, just some one-off template text and same
  options."*

**Descriptions carry the prose.** Look at QU-0573's Labour line — four paragraphs
of scope inside one description. That prose *is* the proposal's body. Render
descriptions with line breaks and paragraphs preserved; don't truncate, don't
single-line them. This is the single most important rendering detail in the brief.

### Part 3a — Photos

**The live page already has a hero image**, plus the Pristine logo, above
"Garden Maintenance Proposal". Confirmed on Kerry's proposal, 18 July.

**Check first:** is that hero per-quote or a hardcoded default? Kerry's shows a
generic garden with "Property: To be confirmed", which suggests a default. The
answer decides whether this part is an hour or a day. **Find out before estimating.**

Then, the owner's one real ask for landscaping:

- **Hero image** — per-quote, optional, falling back to the current default.
- **Additional photos with captions** — an optional gallery, shown after the
  scope. Owner's words: *"an option for landscaping to add more photos."*

Same component for all three types; maintenance and one-off simply won't use the
gallery. **Don't gate the gallery by `quote_type`** — if a tidy job warrants a
photo, let it have one. The type drives wording, not capability.

Lucia Glade's images are concept shots and labelled area photos. A flat gallery
with captions covers that. Don't build layouts, don't build before/after pairs,
don't build image ordering UI beyond a simple sort.

### Part 3b — Export

The owner occasionally builds a designed PDF by hand (Lucia Glade) for a job that
warrants it. He wants to keep that possible, from the app's numbers rather than
re-deriving them.

Add an **export** on the quote — categories, descriptions, quantities, prices,
totals — in a form he can paste elsewhere. Copy-to-clipboard or CSV; ask which. Small.

`Copy Proposal Link` already exists, so if he ever does send a document himself he
can paste the accept link into his own email — the app still holds the numbers,
still drives the invoice, still records the acceptance.

### Noted, not in scope — the "prompting space"

The owner, 18 July: *"or I have a separate prompting space to create the proposal."*

He writes his best proposal prose with AI help outside the app (that's how Lucia
Glade happened). A writing surface inside the app — drafting `customer_scope` and
line descriptions from the job's facts — is a real idea and probably a good one.

**Not this brief.** It's a feature, not a fix, and Part 2 is what unblocks the
business. Record it and move on. If it gets built later, note the repo already has
the Anthropic API available to artifacts, and `customer_scope` is the field it
would write into.

---

## Out of scope

- The sold→scheduled seam (the "go to the quote builder" modal, staff assignment,
  day/time on the card). Real, recorded, next.
- Follow-up faint-button + snooze; invoiced-section lead join — both deferred from
  Brief 02.
- The dead "Ready for Xero" status option in the builder (the scenario behind it
  is switched off) — delete it in passing if trivial.
- Voice-to-quote. Photos. Booking slots. Calendar sync.

## No longer parked: billing

`docs/BILLING_DOUBLE_INVOICE_AUDIT.md` found `properties.billing_type` was *"not
read at invoice time"*. Now we know why — literally: the view reads only hours,
greenwaste rate, and extra charges. Nothing else.

**Part 2 changes that.** Do not go fixing billing. But when the view starts
branching on `invoice_method`, re-read the audit — the double-invoice question may
answer itself, and the owner's *"has any maintenance customer ever queried being
charged twice?"* is still the cheapest way to settle it.

---

## Constraints

- Numbered migrations in `scripts/`, transaction-wrapped. The owner pastes them.
- **Do not modify the Make scenarios.** The invoice one is correct. The send one
  is correct. `Xero: Create Quote` is switched off and obsolete.
- Verify against the live DB before and after. `NOTIFY pgrst, 'reload schema';` if
  the cache goes stale.
- Clean up test rows. Multiple agents have left artefacts in this production DB —
  including a phantom visit that sat in the invoice queue flagged `ready` and
  would have billed a fake customer.
- Branch, PR to `main`. Production deploys from `main`.

---

## The acceptance test

> A landscaping quote, built once in the app, sent as a proposal the owner is
> happy to put in front of a customer, accepted on the link, scheduled, completed
> — and the Xero invoice that comes out **matches the accepted price, with the
> right words, in the right accounts.**

That has never happened. Not once, for any job. It is the thing the whole build
has been for.

The maintenance version of that test is available **today** and should be run
first — it exercises everything except Part 2's `quoted` branch.
