# Brief — Public visit photo page

## Goal

A public, read-only page showing the photos taken on a single visit, reachable from a
short URL that can be printed on a Xero invoice. Customer clicks it, sees the photos
from their job, nothing else.

Target URL shape: `/v/{token}` — e.g. `pristinejobs.co.nz/v/k7m2xq9p`

## Context

- Photos already exist. Verify the live schema before writing anything — do not trust
  these names: `job_photos` table, `invoice_photos_for_make` view (has `visit_id`,
  `public_url`, `filename`), `visits`, `properties`.
- Photos are already in a public Supabase storage bucket, so the URLs are directly
  loadable. This build is about a clean wrapper page, not about access to the files.
- The page has NO authentication. Anyone with the link can view it.

## Scope

### 1. Migration

- Add `public_token text unique` to `visits`.
- Short, URL-safe, random, unguessable — 8–10 chars, no ambiguous characters (0/O, 1/l).
- Default-generate on insert so new visits always have one.
- Backfill every existing row.
- Index it (unique constraint gives this).

### 2. Server-side lookup

- A route handler that takes a token and returns the data for the page.
- Must run server-side using the service role key. The key must never reach the browser.
- Do NOT loosen RLS on `visits` or add an anon-read policy to make this work.
- Return ONLY: property address, visit date, and the list of photo URLs.

### 3. Public page at `/v/[token]`

Shows:
- Pristine Gardens branding
- Property address
- Visit date
- Photo grid, responsive, tap to enlarge

Must NOT show, and must not be present anywhere in the page payload:
- Any pricing, hours, rates, or invoice data
- Internal or staff notes, walk-around issues, next-visit notes
- Staff names
- Client name, email, or phone
- Any other visit's data

Unknown or expired token → a plain "This link isn't available" page. Not a stack trace,
not a 500, and no indication of whether the token ever existed.

Visit with zero photos → a page saying no photos were recorded for this visit. Not an error.

### 4. Make scenario change

Not to be done by the coding agent — Joe will do this by hand.

Output for Joe at the end: the exact text to append to the invoice line description,
with the token field name and where it appears in the existing Supabase query
(module 1 returns the `visits` row, so the token should already be available there).

## Guardrails

- Query the live DB for actual schema. Never infer column names from these notes.
- No Supabase connection strings in chat or committed to the repo.
- Do not modify the existing invoicing flow, the `visits` write path, or any RLS policy
  on an existing table.
- Migration is additive only. No column drops, no type changes.
- New migration file, next number in sequence. Append-only.

## Acceptance tests

1. Every existing `visits` row has a non-null, unique `public_token` after migration.
2. A newly created visit gets a token automatically.
3. `/v/{valid token}` renders address, date, and every photo for that visit.
4. `/v/{valid token}` page source contains no price, rate, hour, staff name, or client
   contact detail. Check the raw payload, not just the rendered page.
5. `/v/{garbage token}` renders the unavailable page. No error, no leak.
6. A visit with no photos renders the empty-state page.
7. Two different tokens never return each other's photos.
8. Page is readable on a phone.

## Verification

- Run against staging first.
- Live-fire the final check through a real browser on prod, not curl.
- Confirm test 4 by viewing page source directly.

## Stop and ask Joe if

- The photo storage bucket turns out not to be public, or the URLs are signed/expiring.
  That changes the design and needs a decision.
- Making this work appears to need any RLS change on an existing table.
- The schema doesn't match what's described above in a way that changes the approach.

## Git

Branch `feat/public-visit-photo-page`. Commit in logical steps. Do not push to main.
Show Joe the plan before changing files.

---

## OUTPUT FOR JOE — the Make change (built 31 Jul, migration 075)

The token column is **`public_token`** on the `visits` table. Your scenario's
module 1 already returns the whole visits row, so after migration 075 the
token is available as `{{1.public_token}}` — no query change needed.

Append this to the invoice line description (module that builds the labour
line description):

```
Photos of this visit: https://v0-landscaping-job-app.vercel.app/v/{{1.public_token}}
```

Notes:
- Every visit has a token (backfilled + auto-generated on new visits), so the
  link is always present and always valid — visits with no photos show a
  polite "No photos were recorded for this visit" page, never an error.
- The brief's `pristinejobs.co.nz` domain is not connected to the app; the
  Vercel URL above is the live one. If a custom domain is added later, old
  tokens keep working — only the printed prefix changes.
