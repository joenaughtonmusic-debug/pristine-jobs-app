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

## App audit — questions for a full repo walkthrough
- Full run-through of the app, page by page — Joe doesn't know what some pages do
- Sales pipeline: how job types + billing work; can lawn-mow jobs load default hours/duration
- New-customer capture: what's collected/determined when a customer is added, and does that happen during the sales pipeline?
- Any gaps in the build
- VA dashboard still too busy; VA actions page has 200+ items — should only hold things Joe types manually to the VA, or items sent from the new capture workflow. Needs a clear-out + a rule for what belongs there
- cost-capture page: overwhelming, colours/buttons/info everywhere — candidate for a redesign/simplify
- Labour reconciliation: is it redundant if we don't capture unbillable time? Is capturing worth it — and if so it must be easy + reliable for the crew
- New-lead notification: Joe wants to know when a lead is added. It's a PWA so no native Android push — is email via Make.com webhook enough? Decide the mechanism
- The VA manual Add-lead form defaults source to "web" while the website path uses "website" — nearly indistinguishable in the lead notification email. Small tidy-up, not urgent
- The hardcoded JOE_NOTIFICATION_EMAIL in lib/lead-notifications.ts is deliberately staying put for now: both original call sites are client components, so a server-only env var would break them. The address leaves the client bundle together with the NEXT_PUBLIC_ webhook URLs in the Tier 5 "proxy through a server action" item (BUILD_QUEUE.md) — treat them as one fix
- Lead-capture spec's first decision is WHICH REPO it belongs in — GenQuote (where transcription/extraction already exist) or Pristine Jobs (port the patterns across). Decide before building. (See the ⚠️ flag in docs/LEAD_CAPTURE_SPEC.md's reuse map.)

## Specced, not built
- Lead capture — any-source extraction + approval tray → see docs/LEAD_CAPTURE_SPEC.md

## Bugs to investigate
- Completing a visit where the primary worker is someone other than the completer, OR where helpers are added, can fail partway through — `job_labour_entries` RLS is "own rows or admin", so a crew member inserting labour for another staff member hits the wall and completion errors. Pre-existing, in the core complete-visit flow (not the walk-around feature). Affects real multi-person jobs. Investigate before it bites someone live. (Found 2026-07-22 during walk-around staging tests.)

## WordPress theme — untracked deployment record (26 July)
- The Desktop zips stopped at 0.20.22 (9 July); live runs 0.21.1, uploaded directly (file manager/SFTP), no zip built. The Desktop zips are NOT a reliable deployment record after 9 July — the git repo in ~/Desktop/pristine-wordpress-theme is.
- What changed between the 0.20.22 zip and current local git source (assumed to match live, UNVERIFIED — the live folder was never downloaded for comparison): one file only, pristine-home-v2.php, ~911 lines across three 14-July commits — two SEO/service pages (Garden Tidy Up Auckland, pre-sale garden clean-up) plus a service-page framework (galleries with admin meta boxes, FAQ/schema/CTA/related-section renderers, SEO title filters). No changes to the enquiry form handler in that window.

## Parked (deliberately not now)
- Back-costing / worst-performing-jobs reports (instinct: right pricing + efficient execution = profitability)
- Crew billable vs non-billable hours reporting
- Email sniffer to auto-detect customer acceptance language
