# Lead Capture — Any-Source Extraction + Approval Tray (Spec)

> Status: DRAFT for Joe's review — written in the Simple Mode style so it can be
> handed straight to Claude Code. Companion to the pipeline board. Reference
> examples at the bottom are the first two answer keys (real enquiries:
> "David Steadman pool tidy" and "JP Tomas BNI referral").

## Goal

Any enquiry — pasted email, forwarded email, shared text message, after-call
voice note, screenshot, or web form — becomes a pre-filled lead card in a
**pending approval** tray with **zero silent guesses**. One tap moves it onto
the board as a New Lead. The AI extracts; deterministic code generates flags;
Joe (or the user) confirms. Null always beats a guess.

## Core principle (unchanged from Simple Mode)

**AI interprets language; deterministic code makes decisions.** The model
never invents a name, number, address, or urgency. Flags are produced by code
from the extracted fields — never free-written by the model — so flag wording
is consistent and testable.

## Non-goals (v1)

- No silent additions to the board — everything passes through pending approval.
  (Auto-approve for high-confidence email-forward leads is a v1.1 toggle, off
  by default.)
- No reading of the user's SMS inbox or email inbox. Inputs arrive only via
  the explicit channels below.
- No auto-replies to the customer. Contact remains a board action.
- No AI classification of job type beyond a hint field — the user confirms.

## Channels (the mouths — one extractor behind all of them)

| Channel | How it arrives | Notes |
|---|---|---|
| `paste` | Drop zone on the board: pasted text or dragged image | v1 |
| `email_forward` | Per-business inbound address; user sets a forwarding rule | v1. BNI onboarding includes the auto-forward filter for BNI Connect referral emails |
| `share_sheet` | Mobile share target (Android PWA native; iOS via provided Shortcut) | v1 |
| `voice_note` | After-call voice note, transcribed via existing `/api/transcribe` | v1 |
| `screenshot` | Image through paste or share sheet; vision extraction | v1 |
| `web_form` | Embeddable form posting to the same endpoint | v1 |
| `sms_relay` | Tasker webhook (Joe's phone only — not a customer feature) | off-menu |

Every lead stores `channel` + `raw_source` (the original text / transcript /
image reference) so the card can always show "what this came from".

## The one AI call

Single structured-output extraction (strict JSON schema). Image inputs go to a
vision-capable model with the same schema. Trade-term hints fold into the
prompt as in Simple Mode.

Schema (`LeadExtraction`):

```
contact_name          string | null      // the CUSTOMER's name, only if stated
contact_phone         string | null
contact_email         string | null
contact_role          "customer" | "referrer" | "unknown"
                      // "referrer" when the only stated contact details belong
                      // to the person passing the lead (BNI pattern);
                      // "unknown" when it cannot be determined
referrer_name         string | null      // e.g. "Shane the Pool Guru", "Jp Tomas"
referral_source       "bni" | "word_of_mouth" | "web_form" | "google" |
                      "other" | null    // only when evidenced in the text
site_address          string | null     // as written; never completed or corrected
service_summary       string | null     // short, close to the customer's wording
job_type_hint         "maintenance" | "tidy" | "landscaping" | "other" | null
deadline_date         string | null     // ISO date, only if a date is stated
deadline_reason       string | null     // e.g. "pool work starts Mon 27 Jul"
warmth                integer | null    // 1–5, only if stated (BNI temperature)
attachments_note      string | null     // e.g. "3 photos attached"
internal_notes        string[]          // access, scheduling, hazard-flavoured
                                        // fragments — never customer-facing
```

Prompt rules (verbatim into the system prompt):
- Extract only what is written or spoken. Never infer a name from an email
  address, never guess a suburb from context, never invent a phone number.
- If the only contact details in the message belong to the person who passed
  the lead on, set `contact_role` to `"referrer"` and put their details in the
  contact fields — do NOT promote them to customer.
- An address appearing without a stated owner (e.g. alone in a comments field)
  goes to `site_address`; it does not imply the contact is the customer.
- Dates only when explicitly stated. "Next Monday the 27th" resolves against
  the received date; if it cannot be resolved unambiguously, null the date and
  keep the phrase in `deadline_reason`.
- Anything scheduling/access/hazard-flavoured goes to `internal_notes`.

## Deterministic flag rules (code, not AI)

Flags render on the pending card in a fixed order. Wording is fixed here so
tests can assert on it.

| # | Condition | Flag (exact copy) | Severity |
|---|---|---|---|
| 1 | `contact_phone` and `contact_email` both null | "No way to contact this lead — add a phone or email" | blocking (cannot move to board) |
| 2 | `contact_role` = `referrer` | "Contact details are the referrer's ({referrer_name}) — confirm who the customer is" | warn |
| 3 | `contact_role` = `unknown` | "Couldn't tell whose contact details these are — check before contacting" | warn |
| 4 | `contact_name` null | "Customer name not stated" | warn |
| 5 | `site_address` null | "No site address yet" | info |
| 6 | `deadline_date` present | "Deadline: {deadline_reason} — suggest visit before {deadline_date}" | highlight |
| 7 | phone OR email OR address matches an existing customer/lead | "Possible match: {existing name, suburb} — open existing instead?" | warn |
| 8 | `service_summary` null | "Service not stated — will need clarifying on first contact" | info |

Only rule 1 blocks. Everything else is visible friction, never a wall —
matching the Simple Mode philosophy that a red flag guides review without
stopping work.

## States

```
pending_approval  →  approved (creates sales_lead, status "new", card on board)
                  →  dismissed (kept 30 days, restorable; trains nothing in v1)
```

The pending tray sits above the board, quiet until it has items. Badge count
in the nav. Approval is a single tap when there are no warn/blocking flags;
otherwise the confirm screen opens with every field editable — the confirm
screen IS the manual add-lead form, pre-filled.

## Reuse map (lift, don't rewrite)

> ⚠️ 4 of these 5 files live in the voice-to-quote-app (GenQuote) repo, not here —
> only lib/sales-lead-manual.ts exists in Pristine Jobs. Before building, decide:
> build this feature in GenQuote, or port those patterns across. "Lift, don't
> rewrite" crosses a repo boundary as written.

| Piece | From |
|---|---|
| Voice → text | `app/api/transcribe/route.ts` (Talk to Quote, as-is) |
| Structured extraction pattern + null-over-guess prompt discipline | `lib/simple/extraction.ts` |
| Name/address pre-fill helpers | `lib/client-name-extraction.ts`, `lib/address-extraction.ts` |
| Lead creation + activity logging | `lib/sales-lead-manual.ts`, `lib/sales-leads.ts` |
| Inbound email ingestion pattern | existing Make/Zoho flow, redirected at the per-business address (product version replaces Make later) |

## Testing (answer keys — grade against real enquiries)

Every real enquiry Joe collects becomes an answer key. The pipeline is graded
on: extracted fields exactly as below, flags exactly as worded above, nothing
invented, nothing silently dropped.

### Answer key 1 — David Steadman (email, referral)

Input: the "Shane the Pool Guru" email, received Mon 20 Jul 2026, 3 photos.

Expected extraction:
- contact_name: "David Steadman" · contact_role: "customer"
- contact_email: (sender address from headers) · contact_phone: null
- referrer_name: "Shane the Pool Guru" · referral_source: "word_of_mouth"
- site_address: "22 Manhattan Heights, Glendene, Auckland"
- service_summary: "Pool area weed removal and tidy"
- job_type_hint: "tidy"
- deadline_date: "2026-07-27" · deadline_reason: "pool work starts Monday 27 July"
- attachments_note: "3 photos attached"

Expected flags: #6 highlight (deadline). No warns. One-tap approve.

### Answer key 2 — JP Tomas (BNI referral email)

Input: the BNI Connect referral email (temperature 3; name/phone/email all
JP Tomas; comments "147 Lancaster Road Beach Haven").

Expected extraction:
- contact_name: "Jp Tomas" · contact_phone: "027 2026 122"
- contact_email: "Jp@zionfire.co.nz" · contact_role: "referrer"
  (rationale: BNI referral where the listed contact is the referring member)
- referrer_name: "Jp Tomas" · referral_source: "bni"
- site_address: "147 Lancaster Road, Beach Haven"
- service_summary: null · job_type_hint: null
- warmth: 3

Expected flags: #2 warn (referrer's details — confirm customer), #4 warn
(customer name not stated), #8 info (service not stated). Approval opens the
confirm screen; nothing auto-passes.

**FAIL conditions for key 2:** promoting JP Tomas to `contact_role:
"customer"` without a flag; inventing a customer name; attaching the address
to JP as though it were his.

## Open questions for Joe

- Dismissed-lead handling: is 30-day restore enough, or archive forever?
- Should `email_forward` leads with zero warn flags auto-approve in v1.1?
- Per-business trade-term hint list: seed from Pristine's, editable in settings?
