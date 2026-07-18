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
