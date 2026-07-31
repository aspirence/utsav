-- ============================================================================
-- pgTAP — public.invitation_orders.
--
-- CLAUDE.md: "Add a pgTAP test in the same PR for anything touching leads, money or reviews."
-- This table carries amounts, so its central claim needs asserting rather than commenting:
-- no client may create or re-price an order, and the amounts reconcile by constraint.
--
-- Every assertion here corresponds to something a security review flagged as unasserted.
--
-- Run: supabase test db
-- ============================================================================

begin;
select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000050',
   'authenticated', 'authenticated', 'buyer@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000051',
   'authenticated', 'authenticated', 'stranger@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000052',
   'authenticated', 'authenticated', 'moderator@test.local', now(), now());

insert into public.staff_roles (profile_id, role)
values ('22222222-2222-4222-8222-000000000052', 'moderator');

insert into public.invitation_templates (id, slug, name, price, poster_url, is_active)
values ('55555555-5555-4555-8555-000000000050', 'test-invite', 'Test Invite', 149900,
        'https://example.test/p.webp', true);

-- Two orders: one claimed by the buyer, one still a guest order.
insert into public.invitation_orders (
  id, reference, template_id, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone, customer_id
)
values
  ('66666666-6666-4666-8666-000000000050', 'UTS-INV-AAAA50',
   '55555555-5555-4555-8555-000000000050', 'test-invite', 'Test Invite', 149900,
   9900, 140000, 'Claimed Buyer', 'buyer@test.local', '+919000000050',
   '22222222-2222-4222-8222-000000000050'),
  ('66666666-6666-4666-8666-000000000051', 'UTS-INV-AAAA51',
   '55555555-5555-4555-8555-000000000050', 'test-invite', 'Test Invite', 149900,
   9900, 140000, 'Guest Buyer', 'guest@test.local', '+919000000051', null);

-- ---------------------------------------------------------------------------
-- The amounts reconcile, by constraint.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.invitation_orders (
       reference, template_slug, template_name, template_price,
       booking_amount, balance_amount, contact_name, contact_email, contact_phone)
     values ('UTS-INV-BBBB01', 'test-invite', 'Test Invite', 149900,
             9900, 999, 'Bad Maths', 'bad@test.local', '+919000000060') $$,
  '23514',
  null,
  'booking + balance must equal the template price'
);

-- The clamp bug in balancePaise() produced exactly this shape: a booking amount larger than the
-- product, with the balance floored at zero. It must not be insertable.
select throws_ok(
  $$ insert into public.invitation_orders (
       reference, template_slug, template_name, template_price,
       booking_amount, balance_amount, contact_name, contact_email, contact_phone)
     values ('UTS-INV-BBBB02', 'test-invite', 'Cheap Invite', 4900,
             9900, 0, 'Clamped', 'clamp@test.local', '+919000000061') $$,
  '23514',
  null,
  'a booking amount larger than the price cannot reconcile'
);

select throws_ok(
  $$ insert into public.invitation_orders (
       reference, template_slug, template_name, template_price,
       booking_amount, balance_amount, contact_name, contact_email, contact_phone, paid_at)
     values ('UTS-INV-BBBB03', 'test-invite', 'Test Invite', 149900,
             9900, 140000, 'Half Paid', 'half@test.local', '+919000000062', now()) $$,
  '23514',
  null,
  'a paid_at with no payment_ref is a half-written payment'
);

select throws_ok(
  $$ insert into public.invitation_orders (
       reference, template_slug, template_name, template_price,
       booking_amount, balance_amount, contact_name, contact_email, contact_phone, status)
     values ('UTS-INV-BBBB04', 'test-invite', 'Test Invite', 149900,
             9900, 140000, 'Unpaid Progress', 'up@test.local', '+919000000063', 'draft_sent') $$,
  '23514',
  null,
  'nothing advances past booked without a payment stamp'
);

select throws_ok(
  $$ insert into public.invitation_orders (
       reference, template_slug, template_name, template_price,
       booking_amount, balance_amount, contact_name, contact_email, contact_phone)
     values ('bad-reference', 'test-invite', 'Test Invite', 149900,
             9900, 140000, 'Bad Ref', 'br@test.local', '+919000000064') $$,
  '23514',
  null,
  'the reference must match the UTS-INV- format'
);

-- ---------------------------------------------------------------------------
-- Anonymous: no reads, no writes.
-- ---------------------------------------------------------------------------

set local role anon;

select is(
  (select count(*)::int from public.invitation_orders),
  0,
  'anon reads no orders at all'
);

select throws_ok(
  $$ insert into public.invitation_orders (
       reference, template_slug, template_name, template_price,
       booking_amount, balance_amount, contact_name, contact_email, contact_phone)
     values ('UTS-INV-CCCC01', 'test-invite', 'Test Invite', 149900,
             9900, 140000, 'Anon', 'anon@test.local', '+919000000070') $$,
  '42501',
  null,
  'anon cannot insert an order — there is no INSERT policy for it'
);

reset role;

-- ---------------------------------------------------------------------------
-- A signed-in customer: their own order only, and still no writes.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000050","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.invitation_orders),
  1,
  'a customer sees exactly their own claimed order'
);

select is(
  (select reference from public.invitation_orders),
  'UTS-INV-AAAA50',
  'and it is theirs, not the guest order'
);

select throws_ok(
  $$ insert into public.invitation_orders (
       reference, template_slug, template_name, template_price,
       booking_amount, balance_amount, contact_name, contact_email, contact_phone)
     values ('UTS-INV-CCCC02', 'test-invite', 'Test Invite', 149900,
             1, 149899, 'Cheeky', 'cheeky@test.local', '+919000000071') $$,
  '42501',
  null,
  'an authenticated customer cannot mint their own order at their own price'
);

-- Plan §6's real worry: a customer re-pricing an order they can see.
--
-- The WITH has to be at the top level. Postgres allows a data-modifying statement in a CTE
-- only there — not in a sub-SELECT, and not in a FROM-clause subquery, which is how this
-- was first written and why the whole file failed to parse.
with attempted_update as (
  update public.invitation_orders set booking_amount = 1
   where reference = 'UTS-INV-AAAA50'
  returning 1
)
select is(
  (select count(*)::int from attempted_update),
  0,
  'a customer cannot update their own order — no UPDATE policy admits them'
);

-- ---------------------------------------------------------------------------
-- A stranger sees nothing.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000051","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.invitation_orders),
  0,
  'another signed-in user sees no orders of anyone else'
);

-- ---------------------------------------------------------------------------
-- A moderator: reads everything, moves status, cannot touch the money.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000052","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.invitation_orders),
  2,
  'a moderator reads every order, guest ones included'
);

select throws_ok(
  $$ update public.invitation_orders set booking_amount = 100
      where reference = 'UTS-INV-AAAA50' $$,
  '23514',
  null,
  'the column guard refuses a moderator rewriting the booking amount'
);

select throws_ok(
  $$ update public.invitation_orders set template_price = 100
      where reference = 'UTS-INV-AAAA50' $$,
  '23514',
  null,
  'and the remembered template price'
);

-- The gap the review found: the name is part of the same contract as the price.
select throws_ok(
  $$ update public.invitation_orders set template_name = 'Something Else'
      where reference = 'UTS-INV-AAAA50' $$,
  '23514',
  null,
  'and the remembered template name'
);

select throws_ok(
  $$ update public.invitation_orders set paid_at = now(), payment_ref = 'forged'
      where reference = 'UTS-INV-AAAA50' $$,
  '23514',
  null,
  'a moderator cannot forge a payment stamp — only app.record_invitation_payment() may'
);

-- Claim-once: a claimed order cannot be moved to another account.
select throws_ok(
  $$ update public.invitation_orders
        set customer_id = '22222222-2222-4222-8222-000000000051'
      where reference = 'UTS-INV-AAAA50' $$,
  '23514',
  null,
  'a claimed order cannot be reassigned to a different account'
);

reset role;

select * from finish();
rollback;
