# Billing Double-Invoice Audit

**Date:** 2026-07-14
**Scope:** Diagnosis only — no code, data, or migrations were changed.
**Symptom:** Some fixed-price recurring maintenance customers receive **two** invoices — their fixed
recurring (Xero repeating) invoice **and** a second per-visit invoice built from the hours logged on
the visit. Other maintenance customers (e.g. the McDonald's sites) do not double up.

---

> ## ⚠️ STATUS: UNCONFIRMED — reconciliation required (updated 2026-07-14)
>
> **The "double invoice" conclusion below is NOT yet confirmed. Do not apply any billing fix until
> this is resolved.**
>
> New information (owner, 2026-07-14):
> - 747 Remuera's recurring invoice in Xero (e.g. **INV-2300**) is a **repeating invoice that already
>   contains the per-visit labour detail**. So the assumed model — "fixed monthly invoice + a separate
>   per-visit invoice = double" — may be **wrong** for these customers.
> - **INV-2295 does not exist in Xero.** The number is on the visit row in the app, but there is no
>   matching Xero invoice behind it.
>
> **Why this undermines the audit:** the entire affected list in §5 rests on a single signal —
> `visits.xero_invoice_number` / `invoice_amount` being present on a fixed-price property's visit, read
> as "a second, separate invoice was raised." If Make.com is instead **syncing the repeating invoice's
> number back onto the visit** (because that repeating invoice already carries the visit's labour), then
> there is **no second invoice and no double** — the number on the visit *is* the repeating invoice.
> INV-2295's absence in Xero proves the app's `xero_invoice_number` can be present with no real Xero
> invoice behind it, so that signal is not trustworthy on its own.
>
> **Open question to resolve:** is the app/Make generating per-visit invoices *on top of* the repeating
> invoices, or are the repeating invoices the only invoices for these customers?
>
> **To reconcile (per customer in §5) — needs Xero + owner knowledge, not the app DB:**
> 1. In Xero, open the **Repeating** tab — does this customer have a repeating invoice, and does it
>    already itemise the per-visit labour?
> 2. In Xero, search the invoice numbers listed against them in §5 (e.g. INV-2235, INV-2295) — do they
>    exist as *separate* invoices, or not at all?
> 3. If the repeating invoice already covers the visits and the per-visit numbers don't exist as
>    separate invoices → **no double; the audit's premise is wrong for that customer**, and the fix in
>    §6 should not be built.

---

## 1. How a completed visit becomes an invoice

**Per-visit invoice path:**

1. Field staff complete a job in `components/complete-visit-dialog.tsx`. On submit it inserts a
   `visits` row and sets its `invoice_status`:
   ```
   invoice_status: readyForInvoice ? readyInvoiceStatus : "not_ready"
   ```
   where `readyInvoiceStatus = await readyInvoiceStatusForJob(supabase, jobId)`.
2. `lib/quoted-invoicing.ts` decides that value: it returns `"excluded"` **only when
   `scheduled_jobs.invoice_method === "quoted"`**, otherwise `"ready"`. A maintenance visit is
   therefore set to `invoice_status = "ready"`.
3. **Make.com** reads `visits` where `invoice_status = "ready"`, builds the Xero invoice from the
   visit's hours/rates, and writes back `xero_invoice_number`, `invoice_amount`, and advances the
   status `processing → draft_created → authorised → sent → paid`. The app never calls Xero directly.

**Fields that decide whether a per-visit invoice is generated:**

| Field | Role |
|---|---|
| `visits.ready_for_invoice` / `visits.invoice_status` | The trigger Make reads. `ready` → invoice built. `excluded` → never invoiced. |
| `scheduled_jobs.invoice_method` | The **only** gate in the app. `quoted` → app sets the visit `excluded`. Everything else (`charge_up`, `subscription`, null) → visit set `ready`. |
| `scheduled_jobs.billing_mode` | **Effectively dead.** 173/179 jobs are `charge_up` regardless of `invoice_method`; the belt never reads it. |
| `properties.billing_type` | Not read at invoice time. Only used at job creation to pick a default `invoice_method` (see §2). |

Live evidence that **Make itself skips non-`charge_up` methods:** every `invoice_method='subscription'`
visit sits at `processing` with no `xero_invoice_number` and no amount, whereas `charge_up` visits get
real invoice numbers. So subscription jobs are *not* per-visit invoiced by Make — **that Make-side
filter is currently the only thing protecting fixed-price customers. There is no app-side protection
for them.**

---

## 2. Fixed-price recurring vs charge-up — the distinguishing field

The intended distinction is **`scheduled_jobs.invoice_method`**, seeded from **`properties.billing_type`**
by `getDefaultInvoiceMethod` in `components/admin-schedule-client.tsx`:

```
billing_type === "subscription"  → invoice_method "subscription"  (fixed price; no per-visit invoice)
billing_type === "non_billable"  → invoice_method "non_billable"
otherwise                        → invoice_method "charge_up"      (hourly; per-visit invoice)
```

A fixed-price recurring customer is *supposed* to have `billing_type = subscription` → jobs
`invoice_method = subscription` → Make skips per-visit invoicing → they only get their fixed Xero
repeating invoice. A charge-up customer gets a per-visit invoice from logged hours.

**Why McDonald's don't double:** all their jobs are correctly tagged `subscription` (verified — their
visits are stuck at `processing`, with zero Xero invoice numbers).

---

## 3. The mechanism causing the double

A fixed-price recurring customer gets **two** invoices when one of their `scheduled_jobs` carries
`invoice_method = 'charge_up'` instead of `'subscription'`:

- Their **fixed recurring invoice** comes from Xero (a repeating invoice — lives in Xero, not the app;
  the app's `recurring_invoice_required` tracking is unused, 0 rows).
- The **charge_up job's** completed visit is set to `invoice_status = 'ready'` (the belt only excludes
  `quoted`), Make picks it up and raises a **second, hours-based Xero invoice**.

**Why a fixed-price customer ends up with a `charge_up` job:** the job was created/scheduled when
`properties.billing_type` was not `subscription` (or was manually overridden), so
`getDefaultInvoiceMethod` returned `charge_up`. `billing_mode` is not consulted, and the belt keys off
the **job's** `invoice_method`, never the **property's** `billing_type` — so the mis-tag flows straight
through to a Xero invoice.

**Why it's invisible:** the app's invoice queue *hides* `subscription`/`non_billable` jobs
(`shouldShowInActiveInvoiceQueue` in `app/(app)/admin/invoices/page.tsx`), so the VA never sees these
in the app — but Make reads the database directly, not the filtered queue.

---

## 4. Does the Phase 0 belt cover these customers? — No, clear gap

`lib/quoted-invoicing.ts` `isQuotedJob` returns true **only for `invoice_method === 'quoted'`**. It
provides **zero** protection for `subscription`/fixed-price maintenance, and — worse — it keys off the
*job's* `invoice_method`, so a fixed-price customer whose job is mis-tagged `charge_up` is not caught by
anything on the app side. The belt was built for the quoted-job path and never extended to recurring
maintenance.

Because McDonald's are protected **only** by the Make-side filter (their subscription visits sit at
`ready`/`processing` in the DB, never `excluded`), they are one Make-scenario change away from doubling
too. The gap is latent, not just historical.

---

## 5. Affected customers (live data, read-only)

> **Read this against the status banner at the top.** Every "leaked invoice" below is derived from
> `visits.xero_invoice_number` in the app, which the 2026-07-14 finding shows is **not** a reliable
> proxy for a real, separate Xero invoice. Treat this table as *candidates to verify in Xero*, not a
> confirmed list of doubles.

### Fixed-price properties (`billing_type = subscription`), n = 6

| Customer | Code | Status | Per-visit invoices leaked |
|---|---|---|---|
| **747 Remuera Road** | 747REMUERA | 🟡 **UNCONFIRMED — see status banner** | App shows INV-2235 ($100, paid/sent) and INV-2295 ($80, draft) on this property's visits. **But INV-2295 does not exist in Xero, and the repeating invoice (INV-2300) already contains the per-visit labour** — so these may be the repeating invoice synced back, not a second invoice. Reconcile in Xero before acting. |
| 34B Armadale Road Remuera | AR34 | 🟠 Leaked once, contained | INV-2236 raised then set `excluded` in-app (verify it was voided in Xero — the app status does not retract a Xero invoice) |
| McDonalds Lunn Ave | MCDLUNN | ✅ Clean | none (old charge_up visit excluded before invoicing) |
| McDonalds Penrose | MCDPENROSE | ✅ Clean | none |
| McDonalds Royal Oak | MCDROYALOAK | ✅ Clean | none |
| McDonalds Stoddard Road | MCDSTODDARDROAD | ✅ Clean | none |

### Tag-inconsistent — verify against Xero's repeating-invoice list

Property tagged `charge_up` but has at least one `subscription`-tagged job **and** live charge_up
per-visit invoices. If these are genuinely on a fixed recurring invoice they are doubling; if they are
genuine charge-up customers they are fine. **Needs Joe's confirmation.**

| Customer | Code | Live per-visit invoices |
|---|---|---|
| Maggie Robertson | MR1 | INV-2326 ($386.50, draft), INV-2352 ($184, draft) |
| 17/19 Powell Street | POWELL17 | INV-2339 ($296.50, draft), INV-2309 ($67.50, draft) |
| 58 Allendale Road | 58ALLENDALE | INV-2233 ($195.80, **paid/sent**), INV-2308 ($200, draft), INV-2335 ($346.50, draft), INV-2367 ($772.50, draft) |

### Undetectable from data

A fixed-price customer with **no** subscription tag anywhere (property `charge_up`, all jobs
`charge_up`) is indistinguishable from a normal hourly customer. Only Joe / Xero's repeating-invoice
list can catch those. This audit can only see fixed-price intent where a `subscription` tag exists
somewhere.

---

## 6. Recommended two-layer fix (NOT applied)

> **ON HOLD (2026-07-14):** do not action any of Layer 1 until the status-banner open question is
> resolved. If the repeating invoices already contain the per-visit labour and the per-visit numbers
> don't exist as separate Xero invoices, there is nothing to void or credit — and voiding would be
> wrong. Reconcile in Xero first.

### Layer 1 — Stop the active bleed (data only, reversible) — pending reconciliation

- **747 Remuera Road:** INV-2295 does **not** exist in Xero and INV-2300 (repeating) already itemises
  the labour — so there may be no separate invoice to void and no double to credit. **Confirm in Xero
  first**, then act only on invoices that actually exist as separate documents.
- **34B Armadale Road:** confirm **INV-2236** exists as a separate Xero invoice at all before treating
  it as a leak (app shows `excluded`, amount not synced, not sent).
- **MR1 / POWELL17 / 58 Allendale:** confirm with Joe whether these are fixed-price **and** whether
  their per-visit invoice numbers exist as separate Xero invoices before voiding anything.

### Layer 2 — Prevent recurrence (code)

**Smallest code change:** extend the belt in `lib/quoted-invoicing.ts` so a visit is set `excluded`
when the job's `invoice_method` is `subscription` or `non_billable` too — not just `quoted` (mirrors
the app queue's existing `shouldShowInActiveInvoiceQueue` logic). This makes correctly-tagged
subscription jobs belt-and-braces instead of relying solely on Make's filter.
**Caveat:** this alone does **not** catch the actual leak, because the offending jobs are tagged
`charge_up`, not `subscription`.

**Root-cause prevention (needs a decision — do not rush):** the real leak is `invoice_method` drift
from `properties.billing_type`. The durable fix is to make the belt/invoicing consult the **property's**
`billing_type = 'subscription'` (exclude per-visit invoicing at the property level), or to enforce
`invoice_method` from `billing_type` at job creation.
**Trade-off:** a fixed-price customer who legitimately has a separate one-off charge-up job would be
wrongly excluded — so this needs an explicit "bill this extra separately" override before it is safe.
Because of that edge case, the *safest* structural step right now is to **retag the specific charge_up
jobs on genuinely fixed-price properties to `subscription`** (a targeted data fix) rather than a blanket
property-level exclusion.

---

## 7. Method & caveats

- Verified column names and live data via read-only PostgREST queries with the service-role key. No
  writes, migrations, or code changes were made.
- **Make.com scenarios could not be inspected directly.** The claim that Make skips `subscription` is
  inferred (strongly) from the fact that every subscription visit has no Xero invoice while charge_up
  visits do.
- **Xero repeating invoices are not visible from the app** (`recurring_invoice_required` is unused).
- **`visits.xero_invoice_number` is NOT a reliable proxy for a real, separate Xero invoice.** Confirmed
  2026-07-14: INV-2295 is present on a visit row but does not exist in Xero, and the customer's
  repeating invoice (INV-2300) already itemises that visit's labour. The number on a visit may be a
  synced-back reference to the customer's *repeating* invoice, not a separate per-visit invoice. Every
  "leaked invoice" in §5 must be verified directly in Xero (Repeating tab + invoice search) before it
  is treated as a double. This is the load-bearing assumption of the whole audit and it is currently
  unresolved.
