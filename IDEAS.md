# IDEAS — Pristine Jobs
Raw idea store. Messy is fine. When an idea becomes a real decision, move it into CLAUDE.md and delete it from here.

## 🎤 Raw dumps (unsorted — voice notes land here, work through later)
_(empty)_

## Candidate ideas (not yet decided or built)

### Property-manager / rental push
- Flag jobs at rental properties as rentals
- Require photo uploads before a job can be marked complete
- End-of-visit walk-around report noting needed repairs (differentiator + possible revenue line)
- PM portal: upcoming visits, per-property history, downloadable visit reports
- One-tap repair approval with a pre-approved spend threshold (e.g. auto-approve under $150)
- Consolidated monthly invoice per PM, with per-property line items
- White-label / forwardable PDF reports PMs can send to landlords
- Tenant heads-up texts before visits, sent by Pristine (not the PM)
- Vacant-property mode: extra checks (mail, windows, security) + photo proof
- End-of-tenancy tidy-up with 48hr turnaround guarantee (service offering — could sell before the app supports it)
- Issue severity flags in reports (urgent / soon / cosmetic)

### Billing guardrails (from early design doc, 2026-07)
- Audit-log billing method changes (who, when, from → to) on jobs/billing lines — cheap paper trail given past double-billing bugs
- Lock billing method on jobs that originate from a quote; change it on the quote, not the job (verify whether this already holds)

### Pipeline / scheduling
- Site-visit → calendar event + customer self-booking slots (9:45 / 3pm / 4pm, Tue–Fri) — treat as ONE front-of-pipeline feature, not two
- Billing type lives on the property (mandatory at creation, no default); jobs inherit it — architectural roadmap item

### Quoting
- Integrate voice-to-quote (GenQuote / "Talk to Quote") into Pristine Jobs — decide: separate app that talks to it, or a feature inside it?
- Quote export (copy-to-clipboard or CSV) so numbers can be pasted into a hand-built proposal — small
- In-app "prompting space" to draft customer scope + line descriptions from the job's facts

### Meta / guardrails
- "Design guardrail" reviewer that flags when a feature is getting too nuanced or variable-heavy and pushes toward standardisation

## Bugs to investigate
- Completing a visit where the primary worker is someone other than the completer, OR where helpers are added, can fail partway through — `job_labour_entries` RLS is "own rows or admin", so a crew member inserting labour for another staff member hits the wall and completion errors. Pre-existing, in the core complete-visit flow (not the walk-around feature). Affects real multi-person jobs. Investigate before it bites someone live. (Found 2026-07-22 during walk-around staging tests.)

## Parked (deliberately not now)
- Back-costing / worst-performing-jobs reports (instinct: right pricing + efficient execution = profitability)
- Crew billable vs non-billable hours reporting
- Email sniffer to auto-detect customer acceptance language
