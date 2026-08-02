# Brief — Photo email to customer (VA review, curate, send)

## Goal

A daily review pile on the VA admin actions page. The VA scans photos from recently
completed visits, hides any that are blurry or unflattering, and sends the customer a
short email linking to the existing public photo page.

Manual send with a review step. Never automatic.

**Primary operator is the VA, not Joe.** That drives several requirements below — the
hide criteria must be on screen, skips must record a reason, and PM sends must copy Joe.

Applies to all customer types — property managers, body corporates, residential. The
only gate is a per-property opt-in.

## Why it's not on the sales pipeline

The pipeline covers lead → first job. Recurring maintenance visits never enter it, and
those are the majority of the work this feature serves. This lives on the **VA admin
actions page** as its own section.

## Existing pieces this builds on

Verify every one of these against the live schema before writing anything. Do not trust
the names below.

- Public photo page is live at `photos.pristinegardens.co.nz/v/{public_token}`, route
  `/v/[token]`. Working and tested. Do not change its behaviour except for the
  hidden-photo filter in section 1.
- `visits.public_token` exists and is populated on every row.
- Photos already carry a completion/after tag; the public page filters to these. Reuse
  that exact filter. Do not create a second definition of "customer-visible".
- VA admin actions page exists.
- The app already sends email. Use that transport. Do not add a provider.

## Scope

### 1. Migration

- `properties.send_photos boolean not null default false` — the opt-in.
- `visits.photo_email_sent_at timestamptz null` — prevents double-send.
- `visits.photo_email_skip_reason text null` — why a card was skipped.
- Nullable `hidden_from_customer_at timestamptz` on the photos table, so a photo can be
  excluded from the customer view without deleting it. It may still matter internally.
- The public page's photo query must also exclude rows where `hidden_from_customer_at`
  is not null.
- Additive only. No drops, no type changes, no RLS changes.

### 2. Property toggle

"Send photos to customer" checkbox on the property edit screen, off by default. Applies
to every property type.

Photos are still captured and stored on every job regardless. This toggle only controls
whether a visit enters the review pile.

### 3. The review pile — VA admin actions page

A section listing visits that are:
- completed
- at a property with `send_photos = true`
- have at least one customer-visible photo
- `photo_email_sent_at` is null
- visit date within the last 7 days

**Driven by photo readiness, not completion date.** Crew sometimes upload the next day,
so a visit appears once its photos exist, but sits under its own visit date.

Grouped by visit date, newest first, each group headed with the date and a count.

Each card shows: property address, visit date, photo count, and — for property-managed
properties — a visible marker with age, e.g. `PM · 2 days`. PMs should be actioned
within 24 hours, so their age must be obvious without sorting.

### 4. Expiry

Visits older than 7 days leave the main pile and move to a collapsed **Expired** list at
the bottom, showing address, date and photo count.

They are not deleted and remain sendable from there — but they must be out of the daily
pile so it can't accumulate into a wall. Do not silently discard: Joe needs to see what
lapsed, particularly on PM properties.

### 5. Review screen

Clicking a card opens a modal previewing exactly what the customer will receive.

**The hide criteria must appear on screen, above the thumbnails, as plain text:**

> Hide a photo if it's blurry or badly framed; if it shows weeds, dead or dying plants,
> or rubbish; or if it makes the job look half-done. If you're unsure, hide it.

This is the operating standard for whoever is reviewing. It is not a tooltip or a help
link — it sits visibly in the modal every time.

The modal contains:

- The email as it will be sent — recipient, subject, body
- Below it, the photos as **large thumbnails**, labelled as "what's on the photo page"

Thumbnail size matters. The reviewer is looking for blur *and* for technically-fine
photos that happen to show something unflattering. That judgement can't be made from a
postage stamp. Tapping a thumbnail opens it full size.

- Each thumbnail has a **Hide** control (sets `hidden_from_customer_at`)
- Hidden photos stay visible to the reviewer, greyed, with **Unhide**
- Live count: "3 photos will be shown"
- **Send** — disabled when zero photos remain visible
- **Skip** — requires a reason before it will clear the card. A short dropdown
  (suggested: "Photos not good enough" / "Not appropriate to send" / "Other") with an
  optional free-text note. Store in `photo_email_skip_reason`.
- Cancel closes without other changes; hide/unhide save immediately

**Critical:** the email contains a link only. Photos are never attached. The thumbnails
preview the destination page.

### 6. The email

- To the property's billing contact email.
- Short, warm, written like a person — not a system notification.
- Contains `https://photos.pristinegardens.co.nz/v/{public_token}` as a real clickable link.
- No pricing, no invoice reference, no internal notes, no staff names.
- **For property-managed properties, copy Joe** (BCC or a configured address). Joe stays
  informed on PM accounts without becoming a bottleneck. Residential sends do not copy him.
- On success set `photo_email_sent_at`. On failure leave it null, surface the error, and
  leave the card actionable.

### 7. Resend

A resend control on an already-sent visit is acceptable, but as a deliberate secondary
action — never the primary button.

## Guardrails

- Query the live DB for the real schema. Never infer column names from this brief.
- No Supabase connection strings in chat or in the repo.
- Do not modify the invoicing flow, the Make scenario, or `/v/[token]` beyond the
  hidden-photo filter.
- No bulk "send all". One visit at a time, deliberate.
- Enforce the `send_photos` gate server-side, not just by hiding the UI.
- New migration file, next number in sequence. Append-only.

## Acceptance tests

1. A property with `send_photos = false` never enters the pile, even with photos.
2. A visit whose photos are uploaded the day after completion appears once the photos
   exist, grouped under its own visit date.
3. Hiding a photo removes it from the public page immediately; unhiding restores it.
4. The email reaches the billing contact, the link opens that visit's photos, and the
   received email contains no price, rate, invoice number or staff name.
5. The email contains no attachments.
6. A PM property send copies Joe; a residential send does not.
7. A visit dated 8 days ago appears in Expired, not the main pile, and is still sendable.
8. Skip cannot complete without a reason, and the reason is stored.
9. After sending, the card clears and the primary send path is closed.
10. A visit with all photos hidden cannot be sent — button disabled.
11. A failed send leaves `photo_email_sent_at` null and the card actionable.
12. The hide criteria text is visible in the modal without scrolling or hovering.
13. A property-managed property shows its PM marker and age.

## Verification

- Staging first.
- Send one real email to Joe's own address; open it on a phone.
- Confirm tests 4 and 5 by reading the received email, not the template source.

## Stop and ask Joe if

- The app's email transport isn't suitable for customer-facing mail.
- Properties don't have a clear billing contact email field.
- The completion/after photo tag isn't cleanly determinable from the schema.
- "Property managed" isn't cleanly determinable for the PM marker and BCC rule.

## Git

Branch `feat/customer-photo-email`. Show Joe the plan before changing files. Commit in
logical steps. Do not push to main.
