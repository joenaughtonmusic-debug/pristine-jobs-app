# Brief: quote-accepted on-ramp — default hours + auto recurring calendar event

**Status:** DRAFT for Joe's approval. Nothing built yet.
**Written:** 3 Aug 2026.
**Origin:** Joe — when a maintenance quote is accepted and the property is
created, (a) the quote's per-visit hours should become the property's default
visit hours, and (b) a recurring Google Calendar event should be created on a
Monday at the maintenance frequency, so the recurring schedule isn't something
anyone has to remember to set up by hand.

---

## The one-paragraph version

Two things should happen the moment a maintenance quote is accepted, both hung
off the existing "create the property from the quote" step. First (small,
in-app): copy the quote's per-visit hours onto the property as its default
visit hours, so every future schedule pre-fills the right duration. Second
(app + Make): a button that fires a recurring Google Calendar event on the next
Monday, repeating at the property's frequency, so the maintenance rhythm lives
in your calendar automatically. The app can't talk to Google Calendar directly
— it only reaches it through Make.com — so the app fires a signal and a small
Make scenario creates the event (I build the app side and give you the exact
Make steps).

---

## What's true today (so we build onto it, not around it)

- A property **is** created from an accepted quote (in the quote builder), and it
  already carries the maintenance **frequency** and the quoted **rates**.
- Scheduling from an accepted quote **already** pulls the quoted hours into the
  scheduled job's planned duration. (So that part is done.)
- The property is created **without default visit hours** — this is gap (a).
- The app has **no direct Google Calendar connection**. Google Calendar is
  reached only via Make.com (there's a GCal sync scenario). Any event the app
  "creates" is really the app POSTing to a Make webhook and Make making the
  event — the same pattern used for lead notifications and PM report sends.

## The useful finding (makes the calendar part easy)

Every maintenance frequency is **already stored as a number of weeks**
(`getServiceIntervalWeeks`): 2-weekly=2, monthly=4, 6-weekly=6, 2-monthly=8,
3-monthly=12, 4-monthly=16, 6-monthly=26. That means **all** of them map cleanly
to one Google Calendar recurrence rule — *every N weeks, on Monday*:

```
RRULE:FREQ=WEEKLY;INTERVAL=<weeks>;BYDAY=MO
```

So "monthly" becomes "every 4 weeks on a Monday", "2-monthly" = "every 8 weeks
on a Monday", etc. Every visit lands on a work Monday, no awkward "which Monday
of the month" ambiguity. Consistent and simple.

---

## Proposed build

### Part 1 — Maintenance hours → property default hours (in-app, small)
When a maintenance quote creates/converts its property, set
`default_duration_hours` from the quote's per-visit labour hours. From then on
the scheduler pre-fills that duration for the property (it already reads this
field). One-off/landscaping quotes don't set it (no standing visit duration).

### Part 2 — "Create recurring calendar event" button (app + Make)
At the accept-quote / property step, a button: **"Add recurring maintenance
visit to Google Calendar."** Human-triggered, not silent — you (or the VA) click
it once. It POSTs to a new Make webhook with:
- property name + address,
- start date = the next Monday,
- interval weeks (from the frequency),
- event length (from default hours),
- a note that it's the recurring maintenance slot.

A new **Make scenario** receives that and creates the recurring Google Calendar
event using the RRULE above. I build the app side + a stored
`gcal_recurring_event_created_at` flag so the button can't double-create; I give
you the exact Make steps (GCal is Make-only, so that scenario is yours to wire,
same as the invoice ones).

---

## Decisions I need from you

1. **Which Google Calendar** should these land in? (The main Pristine one, or a
   dedicated maintenance calendar?)
2. **Start Monday** — always the *next* Monday from acceptance, or should the
   button let you pick the first visit date? (I'd default to next Monday, editable.)
3. **Event time + length** — start time (e.g. 8:00am?) and length from the
   property's default hours (e.g. a 4-hour block)? Or an all-day event?
4. **Trigger point** — is a **button** at acceptance right (my recommendation,
   so nothing fires by surprise), or do you want it fully automatic on accept?
5. **Only maintenance** gets a recurring event — one-off/quoted/landscaping
   don't. Agreed?

## Risks / notes
- No double-creation: the stored flag guards the button.
- If a property's frequency later changes, the calendar event isn't auto-updated
  — you'd delete the old recurring event and re-click. (Keeping it simple; the
  app isn't trying to become a two-way calendar sync — you keep the master
  recurring schedule in Google Calendar, which is how you like it.)
- This does **not** rebuild scheduling in-app — it just seeds your existing
  Google Calendar rhythm automatically.

## Acceptance tests
1. Accept a maintenance quote (say 4h, 2-monthly) → property created with
   default hours = 4.
2. Schedule a job at that property later → duration pre-fills to 4h.
3. Click the calendar button → a recurring event appears in Google Calendar on
   the next Monday, repeating every 8 weeks, 4h long.
4. Click it again → no second event (guarded).
5. One-off quote → no default hours, no calendar button/event.
