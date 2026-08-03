-- ============================================================================
-- Fremmo — reseller attribution, accrual, and who may read a commission
--
-- Three things are being defended here, in order of how expensive they are to get wrong.
--
-- 1. ATTRIBUTION IS SERVER-RESOLVED AND FROZEN. The reseller on an order comes from the
--    assignment table, not from the caller, and the rate is copied at insert so a later rate
--    change cannot rewrite what was earned last month.
--
-- 2. THE LEDGER IS WRITTEN BY THE TRIGGER AND NOBODY ELSE. CLAUDE.md's second non-negotiable
--    applies to reseller_commissions exactly as it does to payments: SELECT policies only.
--
-- 3. A RESELLER IS NOT STAFF. The last assertion is the one this file exists for. It would be
--    natural to add 'reseller' to public.staff_role_kind, and it would silently grant every
--    reseller read access to everything guarded by a bare app.is_staff() — including the raw
--    Cashfree payloads in invitation_payments. If that enum ever gains the value, this test
--    fails, which is the point.
-- ============================================================================

begin;
select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures. Two resellers, so "reads their own" can be told apart from "reads everything".
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000090',
   'authenticated', 'authenticated', 'rs-alpha@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000091',
   'authenticated', 'authenticated', 'rs-beta@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000092',
   'authenticated', 'authenticated', 'rs-owned@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000093',
   'authenticated', 'authenticated', 'rs-stranger@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000094',
   'authenticated', 'authenticated', 'rs-suspended@test.local', now(), now());

insert into public.resellers (id, profile_id, display_name, code, commission_bps, status, notes)
values
  ('77777777-7777-4777-8777-000000000090', '22222222-2222-4222-8222-000000000090',
   'Alpha Partners', 'UTS-RS-ALP', 250, 'active',
   -- Staff-internal, and the sort of sentence that must never reach the partner it is about.
   'Settles late. Chase before the 10th.'),
  ('77777777-7777-4777-8777-000000000091', '22222222-2222-4222-8222-000000000091',
   'Beta Partners', 'UTS-RS-BET', 1000, 'active', null),
  ('77777777-7777-4777-8777-000000000094', '22222222-2222-4222-8222-000000000094',
   'Dormant Partners', 'UTS-RS-DOR', 500, 'suspended', null);

-- Alpha owns one customer. The stranger is owned by nobody.
insert into public.reseller_customers (reseller_id, customer_id)
values ('77777777-7777-4777-8777-000000000090', '22222222-2222-4222-8222-000000000092');

insert into public.invitation_templates (id, slug, name, price, poster_url, is_active)
values ('55555555-5555-4555-8555-000000000090', 'rs-tmpl', 'Reseller Template', 149900,
        'https://example.test/p.webp', true);

-- ---------------------------------------------------------------------------
-- 1–4. Attribution at insert.
-- ---------------------------------------------------------------------------

insert into public.invitation_orders (
  id, reference, template_id, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone, customer_id
)
values ('66666666-6666-4666-8666-000000000090', 'UTS-INV-RS090',
        '55555555-5555-4555-8555-000000000090', 'rs-tmpl', 'Reseller Template', 149900,
        9900, 140000, 'Owned Buyer', 'rs-owned@test.local', '+919000000092',
        '22222222-2222-4222-8222-000000000092');

select is(
  (select reseller_id from public.invitation_orders
    where id = '66666666-6666-4666-8666-000000000090'),
  '77777777-7777-4777-8777-000000000090'::uuid,
  'an order by an owned customer is attributed to their reseller, server-side'
);

select is(
  (select reseller_commission_bps from public.invitation_orders
    where id = '66666666-6666-4666-8666-000000000090'),
  250,
  'and the rate in force is frozen onto the order at insert'
);

-- A guest order. customer_id null is a supported path on this table, so it must be a supported
-- path here: unattributed, not an error.
insert into public.invitation_orders (
  id, reference, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone
)
values ('66666666-6666-4666-8666-000000000091', 'UTS-INV-RS091',
        'rs-tmpl', 'Reseller Template', 149900, 9900, 140000,
        'Guest Buyer', 'guest@test.local', '+919000000095');

select is(
  (select reseller_id from public.invitation_orders
    where id = '66666666-6666-4666-8666-000000000091'),
  null,
  'a guest order has no account to own and so earns nobody a commission'
);

insert into public.invitation_orders (
  id, reference, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone, customer_id
)
values ('66666666-6666-4666-8666-000000000092', 'UTS-INV-RS092',
        'rs-tmpl', 'Reseller Template', 149900, 9900, 140000,
        'Stranger Buyer', 'rs-stranger@test.local', '+919000000093',
        '22222222-2222-4222-8222-000000000093');

select is(
  (select reseller_id from public.invitation_orders
    where id = '66666666-6666-4666-8666-000000000092'),
  null,
  'a customer no reseller owns is attributed to no reseller'
);

-- ---------------------------------------------------------------------------
-- 5. The freeze. This is the assertion that stops a rate rise rewriting history.
-- ---------------------------------------------------------------------------

update public.resellers set commission_bps = 900
  where id = '77777777-7777-4777-8777-000000000090';

select is(
  (select reseller_commission_bps from public.invitation_orders
    where id = '66666666-6666-4666-8666-000000000090'),
  250,
  'raising the reseller''s rate does not change an order already placed'
);

-- Put it back, so later assertions read against a known rate.
update public.resellers set commission_bps = 250
  where id = '77777777-7777-4777-8777-000000000090';

-- ---------------------------------------------------------------------------
-- 6–9. Accrual.
--
-- 149900 paise at 250 bps is 3747.5, which must floor to 3747. Fremmo keeps the half paise:
-- rounding the other way pays out money that was never collected.
-- ---------------------------------------------------------------------------

update public.invitation_orders
   set paid_at = now(), payment_ref = 'cf_rs_090', status = 'booked'
 where id = '66666666-6666-4666-8666-000000000090';

select is(
  (select count(*)::int from public.reseller_commissions
    where order_id = '66666666-6666-4666-8666-000000000090'),
  1,
  'the payment landing accrues exactly one commission'
);

select is(
  (select amount from public.reseller_commissions
    where order_id = '66666666-6666-4666-8666-000000000090'),
  3747::app.paise,
  'and it floors rather than rounding up — 2.5% of 149900 is 3747.5'
);

select is(
  (select status from public.reseller_commissions
    where order_id = '66666666-6666-4666-8666-000000000090'),
  'pending'::public.reseller_commission_status,
  'it starts pending, because the order can still be refunded from booked'
);

-- The trigger fires on every update to the row. Only the paid_at transition may accrue.
update public.invitation_orders set status = 'details_received'
  where id = '66666666-6666-4666-8666-000000000090';
update public.invitation_orders set status = 'draft_sent'
  where id = '66666666-6666-4666-8666-000000000090';

select is(
  (select count(*)::int from public.reseller_commissions
    where order_id = '66666666-6666-4666-8666-000000000090'),
  1,
  'moving the order through its lifecycle does not accrue a second commission'
);

-- ---------------------------------------------------------------------------
-- 10–12. Delivery, reversal, and the one reversal that must not happen.
-- ---------------------------------------------------------------------------

update public.invitation_orders set status = 'delivered'
  where id = '66666666-6666-4666-8666-000000000090';

select is(
  (select status from public.reseller_commissions
    where order_id = '66666666-6666-4666-8666-000000000090'),
  'payable'::public.reseller_commission_status,
  'delivering the order turns the provisional commission into a payable one'
);

-- A second order, taken all the way to paid-and-refunded.
insert into public.invitation_orders (
  id, reference, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone, customer_id
)
values ('66666666-6666-4666-8666-000000000093', 'UTS-INV-RS093',
        'rs-tmpl', 'Reseller Template', 149900, 9900, 140000,
        'Owned Buyer', 'rs-owned@test.local', '+919000000092',
        '22222222-2222-4222-8222-000000000092');

update public.invitation_orders
   set paid_at = now(), payment_ref = 'cf_rs_093', status = 'booked'
 where id = '66666666-6666-4666-8666-000000000093';

update public.invitation_orders set status = 'refunded'
  where id = '66666666-6666-4666-8666-000000000093';

select is(
  (select status from public.reseller_commissions
    where order_id = '66666666-6666-4666-8666-000000000093'),
  'reversed'::public.reseller_commission_status,
  'refunding the order reverses the commission it earned'
);

/*
 * A commission that has actually been settled is not rewritten by a later refund.
 *
 * The reversal is a debt to recover out of band. Flipping the row would make the ledger
 * disagree with a bank transfer that really happened, and the ledger is the thing finance
 * reconciles against.
 */
update public.reseller_commissions
   set status = 'paid', paid_at = now(), settlement_ref = 'UTR-TEST-090'
 where order_id = '66666666-6666-4666-8666-000000000090';

update public.invitation_orders set status = 'refunded'
  where id = '66666666-6666-4666-8666-000000000090';

select is(
  (select status from public.reseller_commissions
    where order_id = '66666666-6666-4666-8666-000000000090'),
  'paid'::public.reseller_commission_status,
  'a commission already settled survives a later refund — recovering it is finance''s job'
);

-- ---------------------------------------------------------------------------
-- 13. One live owner per customer.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.reseller_customers (reseller_id, customer_id)
    values ('77777777-7777-4777-8777-000000000091', '22222222-2222-4222-8222-000000000092')$$,
  '23505',
  null,
  'a customer cannot be live-owned by two resellers — one sale must not pay twice'
);

-- ---------------------------------------------------------------------------
-- 14–17. What a reseller may do with the ledger. Read their own; nothing else.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000090","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.reseller_commissions),
  2,
  'Alpha reads the two commissions they earned'
);

select is(
  (select count(*)::int from public.reseller_commissions
    where reseller_id <> '77777777-7777-4777-8777-000000000090'),
  0,
  'and cannot see a row belonging to any other reseller'
);

select throws_ok(
  $$insert into public.reseller_commissions
      (reseller_id, order_id, rate_bps, base_amount, amount)
    values ('77777777-7777-4777-8777-000000000090',
            '66666666-6666-4666-8666-000000000091', 10000, 149900, 149900)$$,
  '42501',
  null,
  'a reseller cannot write themselves a commission — there is no INSERT policy'
);

-- No UPDATE policy means the statement affects nothing rather than raising. Counting the
-- returned rows is what tells a silent no-op apart from a successful write.
with attempted as (
  update public.reseller_commissions set amount = 9999999
   where order_id = '66666666-6666-4666-8666-000000000093'
  returning 1
)
select is(
  (select count(*)::int from attempted),
  0,
  'nor raise the amount on one they already have'
);

-- ---------------------------------------------------------------------------
-- 18–20. The masked view.
-- ---------------------------------------------------------------------------

select is(
  (select customer_first_name from public.reseller_orders
    where order_id = '66666666-6666-4666-8666-000000000090'),
  'Owned',
  'the order view gives a reseller a first name and no more'
);

select is(
  (select count(*)::int from public.reseller_orders),
  2,
  'and shows only the orders attributed to them'
);

reset role;

set local role anon;

select is(
  (select count(*)::int from public.reseller_commissions),
  0,
  'anon reads no commission rows at all'
);

reset role;

-- ---------------------------------------------------------------------------
-- 21. A suspended reseller is locked out, not merely unlinked.
--
-- app.my_reseller_id() filters on status, so suspension closes every policy that depends on
-- it in one edit rather than needing a status check at each call site.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000094","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.reseller_orders),
  0,
  'a suspended reseller reads nothing through the view'
);

-- ---------------------------------------------------------------------------
-- 22–23. The staff notes stay with staff.
--
-- public.resellers carries no self-select policy, on purpose. The obvious one —
-- `profile_id = auth.uid()` — was written first and was wrong: RLS admits a whole row or none
-- of it, so it handed every reseller the `notes` column staff use to record whether they pay on
-- time. public.my_reseller is the masked replacement.
--
-- Asserted by absence, the same way 09_invitation_cards.sql asserts the card view carries no
-- contact detail. A future edit that "restores" the convenient policy fails here.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000090","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.resellers),
  0,
  'a reseller cannot read the base table at all — there is no self-select policy'
);

select is(
  (select display_name from public.my_reseller),
  'Alpha Partners',
  'they read themselves through the masked view instead, suspended or not'
);

reset role;

-- ---------------------------------------------------------------------------
-- 24. THE ONE THAT MATTERS. A reseller is not staff.
--
-- If public.staff_role_kind ever gains a 'reseller' value and resellers are granted it, this
-- assertion fails — app.is_staff() with no arguments passes for any staff row, and
-- invitation_payments_select_staff would hand over raw webhook payloads.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000090","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.invitation_payments),
  0,
  'a reseller is not staff and reads nothing guarded by a bare app.is_staff()'
);

reset role;

select * from finish();
rollback;
