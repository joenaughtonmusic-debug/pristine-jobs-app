# Unbilled visit — Michael Cave, 6 May 2026

Exported from the live DB 2026-07-20 (read-only) before invoicing. Verified unbilled
in the app: `invoice_status='not_ready'`, never queued, no Xero id/number/amount on
the visit or job, and the only later invoice (INV-2369, $548, 16 Jul) decodes exactly
to the 7 Jul visit alone.

## Customer / property
- **Client:** Michael Cave — `MC1`, 273 St Heliers Road, St Heliers
- **Email:** vanessa@cavefinancial.co.nz · phone: (none on file)
- **Xero contact id:** `77454fc3-49ce-4f4c-aa95-a6b9867ea25d`
- **Property rates:** $90.00/hr labour · $26.50/bag greenwaste · billing_type charge_up

## The visit (id `2420a600-9d23-4d8d-b8eb-8556ff210f05`)
- **Date:** 2026-05-06 (recorded same day, 05:48 UTC)
- **Hours worked:** 7.00 · **Greenwaste:** 3 bags
- **Work notes:** "Van of greenwaste"
- **Next-visit notes:** "Continue with the stuff around the garage"
- **Materials note:** (none) · extra charges: none
- **Staff (visit labour entries):** Hugh 3.5h + Charles 3.5h = 7.0h
  - (job_labour_entries holds a duplicate Charles 3.5h row — 3 rows totalling 10.5h;
    the visit's 7.0h is the correct total)

## The job (id `49c135e0-b369-41d2-81a9-a31938d90c33`)
- Scheduled 2026-05-06, planned 6h, `invoice_method='charge_up'`
- **Scope:** "Maintenance visit"
- **⚠️ Admin note on the job: "To be invoiced - 6x hours at $80"**

## Value — two candidate figures (decide before invoicing)
| basis | labour | greenwaste | total |
|---|---|---|---|
| As recorded (7h @ $90 property rate) | $630.00 | 3 × $26.50 = $79.50 | **$709.50** |
| Per the admin note (6h @ $80) | $480.00 | 3 × $26.50 = $79.50 | **$559.50** |

The admin note predates nothing — it appears to be the billing instruction left at the
time ($80 = the downturn rate). Joe to choose which figure stands.
