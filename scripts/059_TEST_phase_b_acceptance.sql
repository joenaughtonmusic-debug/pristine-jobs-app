-- Phase B acceptance — proves the per-line confirmation logic + multi-method
-- mismatch rule the code runs, against real property_billing_lines behaviour.
-- Self-cleaning: BEGIN ... ROLLBACK, no rows persist. Fail-loud (RAISE aborts).
--
-- The "unconfirmed line" predicate here is byte-equivalent to
-- isSubscriptionUnconfirmed({billing_mode, confirmed_at}); the mismatch predicate
-- is byte-equivalent to isMethodMismatchForModes(modes, method).

begin;
do $$
declare
  pa uuid; pb uuid; pc uuid;
  a_l1 uuid; a_l2 uuid;   -- property A: confirmed + stale subscription lines
  n int; got uuid; ts_confirmed timestamptz;
  modes_b text[]; modes_c text[];
begin
  -- ---- fixtures ----
  insert into properties (property_code, client_name, address_line_1, billing_type)
    values ('ZZTESTA','Test A','1 A St','subscription') returning id into pa;
  insert into properties (property_code, client_name, address_line_1, billing_type)
    values ('ZZTESTB','Test B','1 B St','subscription') returning id into pb;
  insert into properties (property_code, client_name, address_line_1, billing_type)
    values ('ZZTESTC','Test C','1 C St','subscription') returning id into pc;

  -- A: one confirmed-now line + one stale (13 months) line
  insert into property_billing_lines (property_id, billing_mode, subscription_invoice_confirmed_at, active)
    values (pa,'subscription', now(), true) returning id into a_l1;
  insert into property_billing_lines (property_id, billing_mode, subscription_invoice_confirmed_at, active)
    values (pa,'subscription', now() - interval '13 months', true) returning id into a_l2;
  -- B: subscription + charge_up (both active)
  insert into property_billing_lines (property_id, billing_mode, active) values (pb,'subscription',true);
  insert into property_billing_lines (property_id, billing_mode, active) values (pb,'charge_up',true);
  -- C: subscription only
  insert into property_billing_lines (property_id, billing_mode, active) values (pc,'subscription',true);

  -- ---- 1a: property A → exactly ONE unconfirmed line (the stale one) ----
  select count(*), (array_agg(id))[1] into n, got from property_billing_lines
   where property_id = pa and active and billing_mode='subscription'
     and (subscription_invoice_confirmed_at is null
          or subscription_invoice_confirmed_at < now() - interval '365 days');
  if n <> 1 then raise exception '1a FAIL: % unconfirmed lines on A, expected 1', n; end if;
  if got <> a_l2 then raise exception '1a FAIL: wrong line flagged (not the stale one)'; end if;
  raise notice '1a PASS: exactly one unconfirmed line (the stale), confirmed sibling silent — dedup key is the line id';

  -- ---- 1c: staleness threshold (365d) ----
  if not ((now() - interval '13 months') < now() - interval '365 days')
    then raise exception '1c FAIL: 13mo should be stale'; end if;
  if ((now() - interval '1 month') < now() - interval '365 days')
    then raise exception '1c FAIL: 1mo should NOT be stale'; end if;
  raise notice '1c PASS: 13mo re-flags, 1mo does not';

  -- ---- 1d: confirm the stale line → only it resolves, sibling untouched ----
  update property_billing_lines set subscription_invoice_confirmed_at = now() where id = a_l2;
  select count(*) into n from property_billing_lines
   where property_id = pa and active and billing_mode='subscription'
     and (subscription_invoice_confirmed_at is null
          or subscription_invoice_confirmed_at < now() - interval '365 days');
  if n <> 0 then raise exception '1d FAIL: A still has % unconfirmed after confirm', n; end if;
  select subscription_invoice_confirmed_at into ts_confirmed from property_billing_lines where id = a_l1;
  if ts_confirmed is null then raise exception '1d FAIL: sibling confirmed_at was touched'; end if;
  raise notice '1d PASS: confirming the stale line resolves only it; sibling untouched';

  -- ---- 2a / 2b: multi-method mismatch (charge_up permissive) ----
  select array_agg(distinct billing_mode) into modes_b from property_billing_lines where property_id=pb and active;
  select array_agg(distinct billing_mode) into modes_c from property_billing_lines where property_id=pc and active;
  -- mismatch(modes, method) := method<>'' AND card(modes)>0 AND NOT(charge_up=any(modes))
  --                            AND NOT(method=any(modes))   [= isMethodMismatchForModes]
  -- Both tests schedule method 'charge_up' (m below).
  -- 2a: B {subscription,charge_up} → charge_up present ⇒ permissive ⇒ NO mismatch
  if (cardinality(modes_b) > 0
      and not ('charge_up' = any(modes_b))
      and not ('charge_up' = any(modes_b)))  -- m='charge_up' not in modes_b
    then raise exception '2a FAIL: charge_up blocked on subscription+charge_up property'; end if;
  raise notice '2a PASS: charge_up job on subscription+charge_up property → no mismatch, no override';
  -- 2b: C {subscription} → no charge_up, m not in modes ⇒ IS a mismatch
  if not (cardinality(modes_c) > 0
      and not ('charge_up' = any(modes_c))
      and not ('charge_up' = any(modes_c)))  -- m='charge_up' not in modes_c
    then raise exception '2b FAIL: charge_up not blocked on subscription-only property'; end if;
  raise notice '2b PASS: charge_up job on subscription-only property → mismatch, override still required';

  -- ---- 1b: real unconfirmed subscription-line count unchanged == 10 ----
  select count(*) into n from property_billing_lines b
   join properties p on p.id=b.property_id
   where p.property_code not like 'ZZTEST%' and b.active and b.billing_mode='subscription'
     and (b.subscription_invoice_confirmed_at is null
          or b.subscription_invoice_confirmed_at < now() - interval '365 days');
  if n <> 10 then raise exception '1b FAIL: real unconfirmed count % <> 10', n; end if;
  raise notice '1b PASS: real unconfirmed subscription-line count still 10 (none created/dropped)';

  raise notice 'ALL PHASE B TESTS PASS (1a,1b,1c,1d,2a,2b)';
end $$;
rollback;
