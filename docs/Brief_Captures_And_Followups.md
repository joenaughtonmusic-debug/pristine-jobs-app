# Brief: capture review + a personal Quotes & Follow-ups page

**Status:** DRAFT for Joe's approval. Nothing built yet.
**Written:** 5 Aug 2026.
**Origin:** Joe — "I have no idea where things I record in the capture app go."
Wants (a) to check what's captured is good and be able to edit/re-record,
(b) approve it, and (c) have it land as an admin task OR on a personal
Quotes & Follow-ups to-do page.

---

## Where captures go today (the honest current state)
- The capture page records a voice note → it's transcribed → an AI sorts it into
  one of four types: **commercial_lead, property_followup, va_offload, unsorted.**
- Only **va_offload** notes go anywhere useful — they auto-create an **Admin
  Action.**
- **commercial_lead / property_followup / unsorted** are saved to a `captures`
  table and shown only in the capture page's "today" list. They have **no onward
  destination** — no lead, no quote, no follow-up.
- The only action on a capture is **Dismiss.** There's **no edit, no re-record,
  no approve-and-route.**

So most of what you capture genuinely dead-ends. That's the gap.

---

## Proposed build (two phases)

### Phase 1 — Review & route each capture
On the capture page, each note gets:
- **Edit text** — fix a transcription slip before it goes anywhere.
- **Re-record** — replace the audio; it re-transcribes and re-sorts.
- **Approve → route.** On approve, the capture becomes a real task:
  - a **property_followup / commercial_lead** → an item on the **Quotes &
    Follow-ups** page (Phase 2),
  - anything else → an **Admin Action** (as va_offload does today),
  - **unsorted** → you pick which.
- Dismiss stays for junk.

Nothing routes until you approve it — matching "once I approve it."

### Phase 2 — The Quotes & Follow-ups page (your personal to-do list)
A flat, standalone page **just for you**: two simple lists —
- **Quotes to write / send**
- **Follow-ups due**

Each item: a title, the note (from the capture), an optional link to the
property/lead, an optional due date, and a **tick to complete.** You can also
**add an item manually** (not everything starts as a capture).

**How it's stored:** reuse the existing task system (`admin_actions`) with two
task types — `quote` and `follow_up` — and the page is simply those items
assigned to you. No new table, consistent with the rest of the app, and an
approved capture just creates one of these.

---

## Decisions I need from you
1. **Approve-gate everything?** Right now va_offload auto-creates an admin
   action with no approval. Do you want *all* captures (including va_offload) to
   wait for your approval, or keep va_offload auto and only add approval for the
   rest? (I'd approve-gate all — it matches what you asked and stops surprises.)
2. **Re-record behaviour:** replace the audio and re-run transcription + sorting?
   (I'd say yes.)
3. **Quotes & Follow-ups storage:** reuse `admin_actions` (recommended) or a
   brand-new to-do table? Reusing is less to build and maintain.
4. **Should the page also pull in pipeline items** (quotes not yet sent,
   follow-ups already flagged on cards), or start as *only* what you put there
   (captures + manual adds)? I'd start with captures + manual, and we can layer
   the pipeline in later if it's useful — avoids duplicating the pipeline.

## Risks / notes
- AI transcription/sorting isn't perfect — that's exactly why the edit + approve
  step matters; nothing acts on a raw capture.
- Keeping the page as a view over `admin_actions` means it stays in sync with the
  task system you already use, rather than becoming a second, competing to-do.

## Acceptance tests
1. Record a note → it shows with its transcript and suggested type.
2. Edit the text and re-record → the updated text/type persists.
3. Approve a property-follow-up capture → it appears on the Quotes & Follow-ups
   page as a follow-up item.
4. Approve a va_offload capture → it appears in Admin Actions (as now).
5. Tick a Quotes & Follow-ups item complete → it drops off the open list.
6. Add a manual quote-to-do → it appears and can be ticked off.
