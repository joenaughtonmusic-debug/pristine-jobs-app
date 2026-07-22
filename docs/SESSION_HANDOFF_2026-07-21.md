# Session handoff — Pristine Jobs (2026-07-21)

Start here for a clean chat. This captures current state, the one open task, and how to work.

## First, read these
- `docs/HANDOFF_for_VS_Code_Claude.md` — the standing technical rules/landmines (still current, with two updates noted below).
- Auto-memory at `~/.claude/projects/-Users-joenaughton-pristine-jobs/memory/` — especially `staging-project-exists`, `db-migration-workflow`, `make-proposal-drain-exists`.

Two things in the old HANDOFF are now out of date:
- **"There is NO staging DB" is false.** A staging Supabase project exists (see below).
- **"No DDL access locally" is false.** Direct psql to prod AND staging works now.

## Access / tooling (this machine)
- **psql** is at `/opt/homebrew/opt/libpq/bin` (add to PATH). Session-pooler connection strings + passwords for **prod** (`tblvlffqanqpqhcagcrk`, Mumbai) and **staging** (`yrpkfxmthregprsfkxaf`, Tokyo) were provided by Joe — get them from him again in a new chat (not stored in this file). Service-role keys are in `.env.local` (prod) and `.env.staging` (staging).
- **Staging = a faithful prod snapshot** (created 2026-07-20). Rehearse everything there first, then prod. Staging drifts; the test-row cleanup was replicated to it.
- **Live UI verification pattern:** temp admin auth user + forged/real login + headless Chrome (puppeteer-core + system Chrome) against the app built with the target env. Always self-clean (delete temp users, test rows). Scripts live in the session scratchpad.
- **Migrations:** numbered `scripts/NNN_*.sql` with a header + post-check. Rehearse on staging, get Joe's OK, apply to prod via psql. `scripts/` has drifted from live — always trust the live DB, not the folder.
- **Worktrees:** main repo `~/pristine-jobs`; a second worktree `~/pristine-capture` on branch `feature/capture`.

## What shipped this session (all MERGED + deployed to prod)
A full invoice-safety + billing-integrity programme. PRs #16–#22, plus migrations **048, 049, 050 applied to prod**.

- **Rate work:** new customers prefill $80/$26.50 charge_up at creation (all 3 creation paths, #16); the 29 existing rate-less charge_up properties backfilled to $80/$26.50 (COALESCE, prod); PropertyDialog "Add" bug fixed (phantom `user_id`, missing `property_code`).
- **Invoice guards (on the /admin/invoices exception builder + crew dialog):**
  - Guard 1 (048/049 views): subscription + quoted visits excluded from per-visit labour/greenwaste; branch-4 emits a quoted job's lines once.
  - Guard 2 (#17): refuse mark-ready if a visit would emit 0 lines OR a line with a null rate ("Not queued: …").
  - Guard 3: stuck-`processing` badge (Make never wrote back).
  - Guard 4 (#18): "never queued" badge for completed charge_up visits sitting not_ready >21 days.
  - Reconciliation badge (#19): flags billed hours (visits.hours_worked) ≠ costed hours (job_labour_entries).
- **Hours source of truth (#19/#20):** job_labour_entries is canonical; the always-true `billable` flag was cut from the write path (column left, defaults true).
- **Billing-method block (#21):** scheduling refuses an invoice_method that contradicts the property's billing_type, with a deliberate "intentional exception" override checkbox.
- **Build A — subscription billing verification (#22, migration 050):** per-property confirmed-repeating-invoice flag. Columns `subscription_amount`, `subscription_invoice_confirmed_at`, `subscription_invoice_confirmed_by`. "Unconfirmed" = subscription AND (confirmed_at NULL OR >~12 months old). Surfaces as a VA action (`subscription_billing_unconfirmed`) on the admin dashboard Attention area + a red "Repeating invoice unconfirmed" badge on the profitability page. Confirm control in PropertyDialog (subscription-edit) + new-property-modal (at creation). Helper: `lib/subscription-billing.ts`.

Live-verified on prod: all 10 subscription properties flag unconfirmed (10 VA actions generated on a real dashboard load, 0 false positives); badge renders on all 10; new columns read clean.

## THE ONE OPEN TASK — confirm the 10 subscriptions (blocked on Joe's decisions)

Joe supplied amounts to confirm the subscription properties (write `subscription_amount`, `subscription_invoice_confirmed_at=now()`, `subscription_invoice_confirmed_by`). A read-only match table was produced; **8 map cleanly, 4 items need Joe's call before writing.** Nothing has been written yet.

**Clean (subscription, unconfirmed) — ready to confirm:**
| property | code | amount |
|---|---|---|
| 17/19 Powell St | POWELL17 | $484.15 |
| 34B Armadale | AR34 | $162.73 |
| 5 Locarno (Holly) | 5LOCARNO | $180.00 |
| McDonald's Royal Oak | MCDROYALOAK | $392.15 |
| McDonald's Penrose | MCDPENROSE | $579.85 |
| McDonald's Stoddard | MCDSTODDARDROAD | $490.60 |
| McDonald's Lunn Ave | MCDLUNN | $472.15 |
| 58 Allendale | 58ALLENDALE | $195.80 |

**Unresolved — do NOT write until Joe answers:**
1. **86 Riversdale (Dan Sauer) $191.50 → property `DS1` is currently `charge_up`, not subscription.** Needs a `billing_type` → subscription retag first, then confirm the amount. Awaiting Joe's OK to retag.
2. **747 Remuera (Asli Doker) $100.00 → `747REMUERA`** — matches by address, but stored `client_name` is "747 Remuera Road", not "Asli Doker". Confirm $100 as-is; ask whether to also rename the client.
3. **SH15 (15 Sunhill Road, Strata) is subscription but had NO amount in Joe's list** — stays unconfirmed unless Joe gives one. Confirm intended.
4. **Heena retag mismatch:** Joe asked to retag "Heena's property from subscription to quoted," but Heena's TWO properties (`143ADONOVANSTREET`, `1SHIPTONPLACE`) are **both `charge_up`**, neither subscription. Need: which Heena property, and confirm it's **charge_up → quoted**.

Also decide `confirmed_by` label (proposed "Joe").

**Next action in the new chat:** get Joe's answers to the 4 flags + the confirmed_by label, then do all writes in one guarded batch (per-property, id-scoped), and show the resulting confirmed state. As each subscription is confirmed, its VA action auto-resolves on the next dashboard load and its badge clears.

## Working rules reminder
Investigate-first; prove changes live (staging → prod), not just typecheck; fail loudly; don't over-build; show a plan before schema/non-trivial changes; PRs are one-purpose with Vercel green; migrations are view/schema-before-code. Joe merges from GitHub. Don't put real customer names/live figures in commit messages or PR bodies (public repo — the guard will block it).
