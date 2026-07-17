# Brief 01 — Auth Gate + Role Separation

**For:** Claude in VS Code (Pristine Jobs repo)
**Date:** 16 July 2026
**Status of dependencies:** unblocked. Admins now exist. Do not defer this.

---

## READ THIS FIRST — the repo lies

`scripts/*.sql` is **not** a record of the live database. Migrations are pasted
into the Supabase SQL editor by hand, and the folder has drifted badly:

- `is_admin()` — **exists live, appears in no migration.** You will not find it.
  Do not write one. It already works. (Definition below.)
- `properties.billing_type`, `client_email`, `property_code`, `is_active`,
  and ~20 other columns — **exist live, appear in no migration.**
  `001_create_schema.sql` creates `properties` with six columns. Reality has 29.
- `033_add_sales_lead_site_visit_at.sql` — **was never applied.** Superseded by 038.

**Every fact in this brief was verified against the live database on 16 July 2026.**
Where this brief and the repo disagree, this brief is right.

Do not infer schema from `scripts/`. If you need a column that isn't listed here,
stop and ask — don't assume the migration folder knows.

---

## Goal

Two things:

1. Re-enable the login gate (currently commented out in production).
2. Make the database enforce staff-vs-admin, instead of every signed-in user
   being effectively an admin.

**The point of the exercise:** ten people can currently log in, and every one of
them can read `staff_cost_rates` and `staff_daily_timesheets` — i.e. the whole
wage bill. That is the thing being fixed. Everything else is secondary.

---

## Live facts you need

### `is_admin()` — exists, works, don't touch

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$function$
```

`SECURITY DEFINER` + `SET search_path` are both correct and deliberate — this
will not recurse when `profiles` RLS tightens. Leave it alone.

### Admins (as of 16 July 2026)

| email | role |
|---|---|
| `pristinegardensnz@gmail.com` | admin |
| `kirsten@kapowdesign.co.nz` | admin |

Eight other accounts, all `role = 'staff'`, all `is_active = true`, all able to log in.

### The nav/database mismatch

Admin nav is hidden in the UI by `staff_members.staff_type`. The database decides
admin by `profiles.role`. **These are different fields on different tables and
nothing reconciles them.** Nobody has noticed because the blanket policies make
both answers irrelevant today.

Do not "fix" this by pointing RLS at `staff_type`. `profiles.role` is the source
of truth — `is_admin()` already uses it and the scoped policies already call
`is_admin()`. Bring the UI to the database, not the reverse.

---

## Part 1 — The login gate

`app/(app)/layout.tsx`. Uncomment:

```ts
// TEMP: bypass login during local development
// if (!user) {
//   redirect("/")
// }
```

That's the whole change.

**Also note:** `middleware.ts` → `lib/supabase/proxy.ts` only guards paths starting
with `/protected`, which does not exist in this app. It is untouched Supabase
starter boilerplate and provides **zero** protection. The layout check is the only
gate. Don't mistake the middleware for a backstop.

Optional follow-up (not required for this brief): make the middleware guard the
real app paths so the gate isn't a single commented-out block away from being off
again.

---

## Part 2 — RLS. Read the whole section before writing anything.

### The situation

Proper role-aware policies **already exist** on four tables. Someone did this
work correctly. Then a later migration added blanket policies:

```
ALL / USING (true) / WITH CHECK (true)   TO authenticated
```

Postgres OR's permissive policies together, so a blanket `true` doesn't sit
alongside the scoped policies — **it completely nullifies them.** The good work
is currently dead code.

So a large part of this task is **deleting policies, not writing them.** This is
counterintuitive. Resist the urge to author a fresh policy set.

### ⚠️ Part 2a — the trap. This will break the app if you miss it.

The existing scoped policy on `scheduled_jobs` is **wrong**:

```sql
-- scheduled_jobs_select_staff_or_admin
USING ((assigned_staff_id = auth.uid()) OR is_admin())
```

`scheduled_jobs.assigned_staff_id` is an FK to **`staff_members.id`**.
`auth.uid()` returns the **`auth.users.id`**. These are different UUIDs from
different tables. **The comparison can never be true.**

The bridge column is `staff_members.auth_user_id`.

Right now this doesn't surface, because the blanket policy grants everything
anyway. **Drop the blanket without fixing this and every crew member sees zero
jobs.** The app will look broken and the tightening will get blamed.

Correct form:

```sql
USING (
  assigned_staff_id IN (
    SELECT id FROM staff_members WHERE auth_user_id = auth.uid()
  )
  OR is_admin()
)
```

Same bug in the `visits` policies' subquery on `sj.assigned_staff_id`. Same fix.

**Not** the same bug: `visits.completed_by_staff_id` is an FK to `profiles.id`,
so `completed_by_staff_id = auth.uid()` is **correct**. Don't "fix" that one.

Check every policy that compares an ID to `auth.uid()` against the actual FK
target before trusting it.

### Part 2b — the four tables where the fix is a deletion

Scoped policies already exist and are (once 2a is applied) correct. Drop the
blanket only:

| table | blanket policy to drop | what's left |
|---|---|---|
| `properties` | `properties_authenticated_all` | admin insert/update/delete + `properties_select_authenticated` (SELECT `true` — **deliberate, keep it**; all staff need to see properties) |
| `scheduled_jobs` | `scheduled_jobs_authenticated_all` | staff-own SELECT (after 2a) + admin write |
| `visits` | `visits_authenticated_all` | staff-own select/insert/update + admin delete |
| `communications` | `communications_authenticated_all` | own-row CRUD |

**Risk on `communications`:** the remaining policies are `auth.uid() = user_id`
with **no `is_admin()` escape**. Dropping the blanket means admins can only see
communications they personally created. Check whether `/admin/communications`
depends on seeing everyone's. If it does, add `OR is_admin()` to the SELECT
policy as part of this work. Verify before dropping.

### Part 2c — tables with only a blanket policy

These have no scoped policy underneath. Dropping the blanket locks everyone out,
so each needs a policy authored. Roughly 20 tables:

**Priority — this is the actual point of the brief:**
- `staff_cost_rates` → admin only
- `staff_daily_timesheets` → own rows (via `staff_members.auth_user_id`) + admin
- `staff_members` → all staff SELECT; admin write

**The rest** (`admin_actions`, `admin_enquiries`, `client_contact_messages`,
`estimate_calendar_blocks`, `estimates`, `extra_charge_items`,
`internal_job_notes`, `job_labour_entries`, `landscaping_jobs`,
`property_frequency_review`, `property_service_templates`, `quote_drafts`,
`quote_templates`, `scheduled_job_staff`, `visit_extra_charges`,
`visit_labour_entries`):

Default to **all authenticated SELECT, admin write** unless the table obviously
holds crew-personal or commercially sensitive data. Don't gold-plate. The wage
tables are the risk; the rest is tidiness.

Also blanket-equivalent (policies use `auth.role() = 'authenticated'`, which is
the same thing spelled differently): `sales_leads`, `job_photos`,
`calendar_blockouts`.

**Leave alone:**
- `profiles` — already correctly scoped, no blanket. Working.
- `public_suburb_locations` — intentionally public.

### Part 2d — `calendar_blockouts` is anon-readable

```sql
-- calendar_blockouts_select_authenticated
USING (auth.role() = ANY (ARRAY['anon', 'authenticated']))
```

`'anon'` was typed deliberately, presumably for the public working-today map. But
if the Google Calendar sync pulls Joe's whole calendar, then `title`, `location`
and `notes` on his personal events are world-readable.

**Don't change this without asking Joe.** Flag it, confirm the sync is scoped to
a work calendar, then decide.

### Part 2e — the views

The database has views the app reads: `v_invoice_queue`, `profitability_summary`,
`property_profitability`, `landscaping_job_totals`, `scheduling_queue`,
`staff_utilisation_current_week`, `missing_staff_hours_current_week`,
`property_latest_visit_summary`, `property_latest_next_visit_note`,
`invoice_line_items_for_make`, `quote_line_items_for_make`.

In Postgres, a view runs with its **creator's** permissions unless
`security_invoker = true` is set. Several of these join `staff_cost_rates` and
timesheets. **A view can hand out exactly the data we just locked down.**

Check each:

```sql
select c.relname, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v';
```

If `reloptions` doesn't contain `security_invoker=true`, the view bypasses RLS.
For any view touching cost/wage data, either set `security_invoker = true` or
restrict grants. **There is no point bolting the front door and leaving this open.**

---

## Verification — do this, don't skip it

Test as a real staff account, not just as admin. Admin passes everything and
proves nothing.

1. Sign in as a **staff** account (e.g. `fkgalloway97@gmail.com`):
   - Can they see their own scheduled jobs? **(If zero, you missed Part 2a.)**
   - Can they see other people's jobs? Should be no.
   - `select * from staff_cost_rates` → should be empty/denied.
   - Navigate directly to an admin URL → should be refused.
2. Sign in as **admin** (`pristinegardensnz@gmail.com`):
   - Everything visible, admin pages reachable.
   - `/admin/communications` still populated? (see 2b risk)
3. Signed out: any `app/(app)/*` URL redirects to login.
4. The public routes still work — they use the service-role client and bypass RLS
   by design. Don't break them:
   - `app/api/public/sales-leads` (WordPress webhook)
   - `app/api/public/working-today`
   - `app/public/quote/[token]`

---

## Constraints

- **Write the migration as a numbered file in `scripts/`** (next is `041`),
  following the existing conventions — Joe pastes it into the SQL editor manually.
  Migrations do not auto-apply.
- **Verify against the live DB before and after.** Do not trust `scripts/`.
- Clean up any test rows you create. (The last agent left a live
  `claude-verify-72638@example.com` auth account in production. Don't repeat that.)
- Branch as usual; deploys via Vercel.

---

## Out of scope — do not touch

- **Billing / `billing_type` / the double-invoice question.** Parked by the owner.
  The audit doc's premise is unconfirmed. Leave it entirely alone.
- **Phase 2 / `sales_leads` linking.** Next brief.
- The `staff_type` vs `profiles.role` UI mismatch — note it, don't fix it here.

---

## Known-good reference

`app/api/public/sales-leads/route.ts` and `lib/supabase/admin.ts` show the
service-role pattern. Only three files in the repo use it, all under public
routes. That's correct — don't extend it into `app/(app)/`.
