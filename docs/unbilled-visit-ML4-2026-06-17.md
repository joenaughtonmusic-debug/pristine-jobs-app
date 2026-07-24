# Unbilled visit — McLean (Bob & Val), 17 Jun 2026

Exported from the live DB 2026-07-20 (read-only) before invoicing. App shows no
invoice for this visit: `invoice_status='not_ready'`, never queued, no Xero
id/number/amount anywhere for ML4; the only known Xero invoice (INV-2223, 5 May,
$577) predates this visit by six weeks and reconciles to the late-April work.

## ⚠️ Contradiction to resolve FIRST
**The job's admin_note says "Invoiced".** That contradicts every invoice field in the
app. Before raising anything, check Xero → contact "McLean" for an invoice after
17 Jun 2026 (~$548). If one exists, this visit is already billed by hand and must NOT
be invoiced again; if not, the note was premature/wrong.

## Customer / property
- **Client:** 4 McLean Bob and Val — `ML4`, 4 McLean, Mount Albert
- **Email:** val_bob@xtra.co.nz · phone: (none on file)
- **Xero contact id:** (none on file — will need matching in Xero by name)
- **Property rates:** $90.00/hr labour · $26.50/bag greenwaste · billing_type charge_up

## The visit (id `da3f261d-c69d-4332-a4b5-0fa83c6ba727`)
- **Date:** 2026-06-17 (recorded same day, 02:37 UTC)
- **Hours worked:** 5.50 · **Greenwaste:** 2 bags
- **Work notes:** "Trimmed Tacoma, various shrubs. Cut back overhanging olive.
  Weeded gardens, stump pasted arum lillies."
- **Next-visit notes:** (none)
- **Materials note:** "Half bottle stump paste" (no extra charge row was created —
  decide whether to add a stump-paste line when invoicing)
- **Staff:** Charles 5.5h (primary; sole worker)

## The job (id `fe6393ed-8cd3-4df2-9bbc-b5dd6d96a665`)
- Scheduled 2026-06-17, planned 5.5h, `invoice_method='charge_up'`
- Scope / quoted materials / planning note: (all empty)
- **Admin note: "Invoiced"** (see contradiction above)

## Value
| labour | greenwaste | total |
|---|---|---|
| 5.5h × $90 = $495.00 | 2 × $26.50 = $53.00 | **$548.00** |

(Plus stump paste if charged — app catalogue: STMPSML $5 / STMPMED $10 / STMPFULL $19;
"half bottle" most closely fits STMPMED $10.)
