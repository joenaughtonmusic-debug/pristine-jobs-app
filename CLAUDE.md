# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Pristine Jobs

Custom job-management app for Pristine Gardens — intended to replace fragmented manual systems and become the operational centre of the business. Currently a better fit than adapting a generic CRM/pipeline product.

> Global context about Joe and how to work with him lives in `~/.claude/CLAUDE.md`.

## Business context (Pristine Gardens)

Auckland gardening company, ~7 years. Services: recurring garden maintenance, one-off tidy-ups, hedge trimming, planting, lawn mowing, soft landscaping. Largely stepped back from major landscaping but may take suitable projects when capacity/cashflow justify. Revenue roughly NZD $40–45k/month but fluctuates; **currently in a downturn, minimal work, cashflow is an issue.**

**Strategic direction:** run without depending on Joe for routine admin or field work.
- Estimator owns site visits and quotes (currently Joe — fine near term).
- VA/office support owns customer comms, scheduling, follow-up. (Scheduling is currently hard for her because one-off jobs constantly force schedule shifts.)
- Field staff deliver the work. Joe handles leadership, exceptions, strategy, key decisions.
- Note: Joe is undecided whether he keeps the VA long term.

**Team:** Hugh (senior gardener), Charles (experienced gardener), Alex (casual), Graham (possible estimating contractor, not really onboard yet), Fletcher (landscaping/gardening contractor), VA/office support. Staff availability and sickness make the schedule unstable.

## Pricing & quoting rules

- Customer-facing labour rate: **currently NZD $80/hr incl GST** (dropped from the usual $90 to win work in the current downturn).
- Don't normally show estimated labour hours to customers. Customer quotes describe the work and give a labour price; list plants/significant materials separately where appropriate.
- Add ~25% labour contingency by default unless there's a reason not to.
- Avoid repeatedly starting sentences with "We will." Clear, professional NZ English. Customer copy should feel specific and trustworthy, not AI-generated.
- Internal estimates may show hours, assumptions, risks, profitability. Team instructions should be practical and operational.
- **Maintenance** = price per visit with a frequency, NOT a converted monthly subscription. Frequencies: monthly, every 6 weeks, every 2 months, every 3 months, every 4 months, per visit. Preferred standard blocks: 4 hours and 8 hours.

## Tech stack

Next.js 16 (App Router), React 19, Tailwind v4 + shadcn/ui (`components/ui/`), PWA (installable shell, no offline caching), Supabase (DB, auth, storage, RLS), Vercel (deploys from `main`), Make.com integrations, Zoho email ingestion, Google Calendar integration/blockouts. Xero is reached only via Make.com — never directly. Planned: Android/Tasker SMS relay.

## Commands

- `npm run dev` — dev server (prod Supabase via `.env.local`).
- Run against **staging**: `set -a; source .env.staging; set +a; npm run dev` (staging has Make.com webhook URLs deliberately blanked so it can never email a customer).
- Typecheck: `npx tsc --noEmit`. **Run this explicitly** — `next.config.mjs` sets `ignoreBuildErrors: true`, so neither `npm run build` nor Vercel catches type errors.
- `npm run lint` is currently broken (no ESLint config or dependency installed).
- **No test framework.** Verification is manual/live. Build passing ≠ working — prove changes end-to-end (see `docs/HANDOFF_for_VS_Code_Claude.md` for the live-verification pattern).

## Architecture

**Routes** (`app/`):
- `(app)/` — authed layout (redirects to `/` if signed out). Field/crew surfaces: `jobs/`, `labour/`, `capture/` (voice-note PWA), `team/job-board`.
- `(app)/admin/` — additionally gated on the `is_admin` RPC (source of truth is `profiles.role = 'admin'`, **not** `staff_members.staff_type`). All the office surfaces: enquiries, quotes, quoted-jobs, schedule, invoices, properties, cost-capture, communications, labour-reconciliation, team-hub, profitability, quote-templates. Nav groups live in `lib/admin-navigation-config.ts`.
- `sales-pipeline/` — top-level (not under `/admin`) but admin-gated via its own layout; server actions in `sales-pipeline/actions.ts`.
- `public/quote/[token]` — customer-facing quote view (unauthed).
- `api/` — external endpoints: `POST /api/capture` (voice capture → Whisper → triage), `POST /api/public/sales-leads` (website/Make.com lead ingestion, auth via `x-pristine-leads-secret` header), `GET /api/public/working-today` (public map feed for the marketing site).

**Data flow**: server-component-first. Pages are async server components reading via `lib/supabase/server`; mutations are server actions (`"use server"`) + `revalidatePath`; interactive `*-client.tsx` islands query the browser Supabase client directly (RLS applies). No React Query, SWR, or global store.

**Domain logic lives in `lib/`** as mostly-pure functions taking a SupabaseClient: `subscription-billing.ts` (per-line billing identity), `quoted-invoicing.ts` (app-quoted vs legacy jobs), `sales-lead-transitions.ts` (the lead state machine), `sales-leads.ts`, `communication-classification.ts`, `quote-materials.ts`, `service-frequency.ts`.

**AI**: only `lib/capture-ai.ts` — OpenAI via raw `fetch` (no SDK): `whisper-1` transcription + `gpt-4o-mini` JSON-mode triage; the prompt is inline (`TRIAGE_PROMPT`). AI must not confidently invent missing information.

## Supabase conventions

**Four client factories in `lib/supabase/`, with distinct trust models:**
- `server.ts` — SSR client, anon key + cookie session. Default for authed server reads/writes.
- `client.ts` — browser client, for `"use client"` components.
- `admin.ts` — service-role, but **silently falls back to the user client if the key is missing**.
- `service.ts` — service-role, fail-loud (throws if key missing). **Prefer this for new privileged server code.**

Session refresh happens in `middleware.ts` → `lib/supabase/proxy.ts` (standard Supabase SSR pattern — don't insert code between `createServerClient` and `getUser()`).

**RLS**: writes to admin tables gate on the `is_admin()` SQL function; new tables should mirror the `properties_{select,insert,update}_admin` policies. Client-side inserts must set `user_id` or RLS rejects them. Staging auto-grants anon/authenticated on new tables — every new table needs RLS enabled or explicit grant management (see migrations 052/054/055) or it's world-readable via PostgREST.

**Migrations**: `scripts/NNN_*.sql`, zero-padded, applied by hand with `scripts/apply-*-{staging,prod}.sh` (psql). Flow: rehearse on staging → Joe's OK → prod. Schema before code. Write transactional migrations with `RAISE`-on-failure post-checks (see 057 as the model).
- **`scripts/` has drifted from the live DB — treat it as intent, not state. Always query the live DB to confirm actual schema before relying on it.**
- Two Supabase projects: prod `tblvlffqanqpqhcagcrk` (Mumbai) via `.env.local`, staging `yrpkfxmthregprsfkxaf` (Tokyo) via `.env.staging`. Direct psql to both works.

## Billing model (settled — do not rebuild)

- `charge_up` = invoiced per visit; **frequency is never a divisor**. `subscription` = a handful of fixed properties invoiced by hand in Xero via Make.com.
- Billing identity is moving to per-job-type lines in `property_billing_lines` (migrations 057–059, expand/contract). Scheduling surfaces derive behaviour from the **set of active line modes** via `lib/subscription-billing.ts` (`activeBillingModes`, `defaultInvoiceMethodFromModes`, `isMethodMismatchForModes`). `charge_up` has no silent default invoice method.
- Fail honestly, never silently — the historical double-billing bugs came from silent fallbacks.

## Key docs (read before non-trivial work)

- `docs/HANDOFF_for_VS_Code_Claude.md` — standing technical rulebook and landmines: settled billing model, "recently shipped, don't rebuild" ledger, verification patterns.
- `docs/CODING_AGENT_RULES.md` — behaviour checklist: no `"use server"` on plain pages; `await` async `params`; no `toLocaleString()` in SSR text (hydration); verify real table names against the live DB.
- `docs/SESSION_HANDOFF_*.md` — most recent session state; the newest one supersedes older handoffs.
- `docs/PAGE_AUDIT.md` — per-route purpose and product recommendations.

## Main areas

Sales/lead pipeline · Schedule · Estimates Calendar · VA Actions · Communications Hub · Properties · Quotes & quote templates · Quoted Jobs · Invoices · Labour Reconciliation · Profitability reporting · Admin Enquiries · Job Board · Team Hub.

## Sales pipeline direction (current focus)

Visually simple, card-based pipeline — simple and easy to use without visual clutter.
- Collapsed card: customer name, service required, suburb.
- Expanded: contact details, full enquiry, outcome requested, notes, current stage, follow-up requirements, communication history.
- Actions like "Contact" should behave like **work to be completed and ticked off**, not a static "Contacted" status.
- Eventually the system generates an appropriate customer response from the service + enquiry; initially the VA reviews/edits then clicks send. Fully automatic messages are NOT the first priority.
- **New website leads should ideally be added straight to the sales pipeline** (avoid relying on Zoho for those).

## Communications Hub

Receives messages via Zoho + Make.com, stores in Supabase. **Joe is unsure about this hub — it's messy.** Possibly better to filter in Zoho first. Near-term need: a way to flag important customer communication. AI categories: quote request, scheduling, maintenance query, invoice/payment, complaint, general, internal note. AI assists with classification and draft responses but **must not confidently invent missing information.**

## Schedule

Draft and Confirmed states. Actions: Confirm, Contact Client, record scheduling notes, assign staff, show address/suburb, convert accepted quotes into scheduled work. Joe wants a master scheduling view while controlling which staff see each job.
- VA has asked for drag-and-drop + recurring events. Joe already has this in Google Calendar and **doesn't want the hassle of rebuilding it in-app unless it's genuinely easy.**

## VA workflows

VA should be able to: process new enquiries; generate + send reviewed customer responses; arrange site visits; schedule accepted quotes; handle customer schedule changes; triage communications; escalate urgent/uncertain matters; check invoice readiness; check staff hours are recorded; follow up incomplete actions. Goal: kill the current loop where the VA forwards info to Joe, waits, contacts the customer, then needs Joe to follow up again.

## Current goals for this app

Standardise quotes across properties and job types; streamline quoting and invoicing; build the sales pipeline to take leads from lead → customer, kept simple and uncluttered.
