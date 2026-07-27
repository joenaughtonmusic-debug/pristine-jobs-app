# Build brief — completed-work photos on the customer's Xero invoice

Status: APPROVED (Joe, this session). Part A + B built here in Pristine Jobs;
Part C (Make) + the live-fire are Joe's, sequenced after merge.

## Goal
Attach up to 3 completed-work photos (`photo_type IN ('after','completion')`) to
the customer's Xero invoice, included with the invoice online
(`IncludeOnline=true`). **Issue photos must never reach a customer invoice** —
enforced structurally by an allowlist feed, not a denylist. Add client-side
resize at upload (forward-only).

## Decisions (locked)
- Allowlist: `photo_type IN ('after','completion')`. Nothing else. `before`
  excluded for now (may become an option later). Never a denylist.
- Cap 3 photos/invoice; if more exist, the 3 most recent.
- Rentals: after/completion attach to the invoice; issue photos go only to the
  private PM-report PDF. Split by type, different destinations.
- Photos go out WITH the invoice to the customer (Xero `IncludeOnline`), not
  internal-only.
- Resize at upload, client-side, before storage: long edge ~1600px, JPEG q~80.
  Normalises HEIC at source. **Forward-only — no backfill.**
- Recurring-job association: job-level (keyed to `scheduled_job_id`). Per-visit
  `visit_id` preference is a deferred refinement (BUILD_QUEUE).
- Filename: `photo-<photo_id>.jpg` — photo_id is STABLE for the life of the
  photo; row-number would shift on add/delete and could overwrite the wrong
  attachment or duplicate on a regenerated draft.

## Part A — Client-side resize at upload (forward-only)
`lib/resize-image.ts` (client): `resizeImageFile(file): Promise<File>` — canvas,
long edge ≤1600px, export `image/jpeg` q~0.8, return a File with a `.jpg` name.
Best-effort: on any failure return the ORIGINAL file unchanged (never block an
upload — esp. the rental photo-gate).

Wire at file-SELECTION only:
- `components/job-detail.tsx` — in the file `onChange` before
  `setSelectedPhotoFiles`.
- `components/complete-visit-dialog.tsx` — in the issue file `onChange` before
  `setWalkAroundIssues`.

⛔ **Retry-lockout guardrail:** in complete-visit-dialog touch ONLY the file
`onChange`. Do NOT alter the submit handler, the storage upload, or any of the 8
sequential writes. The File in state is already resized; the write sequence is
byte-for-byte unchanged. If resize can't be added at `onChange` without reaching
into the submit flow — STOP and report.

## Part B — The allowlist feed (single safety chokepoint)
DB view `invoice_photos_for_make`: per `scheduled_job_id`, the 3 most-recent
`after`/`completion` photos, jpg/png extension only (backstop for existing
un-normalised HEIC), keyed by `visit_id` for Make, filename `photo-<photo_id>.jpg`.
The `WHERE photo_type IN ('after','completion')` allowlist means `issue` rows can
never appear — this is the one place to test. Grants explicit (068/069).

## Part C — Make (Joe, after merge)
Extend "Pristine App to Xero Invoice" (one scenario). After create-invoice:
read `invoice_photos_for_make` for the visit → per row: HTTP get `public_url` →
Xero add-attachment with `filename` + `IncludeOnline=true`. Timing: DRAFT
creation. **Verify against the live Xero connection (don't trust recalled
numbers):** attachment count/size ceilings, that the Make Xero module exposes
`IncludeOnline`, and JPEG online-inclusion behaviour.

## Part D — Draft deletion / regeneration
Attachments belong to the invoice object → deleting a draft deletes them (no
orphans). Regeneration re-runs the attach branch on the new invoice. Stable
`photo-<photo_id>.jpg` filenames make a Make retry overwrite, not duplicate.
The "Xero deletions don't propagate to the app" gap is unchanged.

## Acceptance tests
1. **Core safety (staging, SQL):** a visit with an issue photo (issue+severity)
   AND after/completion photos → `invoice_photos_for_make` returns ONLY the
   after/completion rows, never the issue.
2. **Resize (staging):** large photo via both paths → stored JPEG, long edge
   ≤1600px, `.jpg`. Complete-visit write sequence still completes fully (no
   regression in the 8 writes).
3. **End-to-end live-fire (Joe, far end):** one real Xero draft for a test visit
   with both kinds → carries ONLY after/completion, `IncludeOnline` set, resized.
   Confirmed in Xero, not a Make 200.
4. **Regeneration:** delete + regenerate → new draft re-carries the same photos,
   no duplicates.

## Stop conditions
Resize can't be added at `onChange` without touching the submit flow; the Xero
module doesn't expose `IncludeOnline`; the view can't guarantee issue-exclusion.
