-- ============================================================================
-- pgTAP — Plan §6 golden rule 1: "default-deny on every table".
-- Plan §12 top risk: "RLS policy mistakes — a wrong policy is a silent data leak".
--
-- Run: supabase test db
-- ============================================================================

begin;
select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000',
        '22222222-2222-4222-8222-000000000001', 'authenticated', 'authenticated',
        'outsider@test.local', now(), now());

insert into public.cities (id, slug, name, state, is_launched)
values ('33333333-3333-4333-8333-000000000001', 'testville', 'Testville', 'TS', true);

insert into public.categories (id, slug, name, plural_name)
values ('33333333-3333-4333-8333-000000000002', 'testcat', 'Test Cat', 'Test Cats');

insert into public.vendors (id, slug, display_name, status, city_id, published_at)
values
  ('44444444-4444-4444-8444-000000000001', 'live-vendor', 'Live Vendor', 'live',
   '33333333-3333-4333-8333-000000000001', now()),
  ('44444444-4444-4444-8444-000000000002', 'draft-vendor', 'Draft Vendor', 'draft',
   '33333333-3333-4333-8333-000000000001', null);

update public.vendor_private
   set contact_phone = '+919000000001', pan_number = 'ABCDE1234F'
 where vendor_id = '44444444-4444-4444-8444-000000000001';

-- ---------------------------------------------------------------------------
-- Anonymous visitor. Plan §6: "SELECT where live/published".
-- ---------------------------------------------------------------------------

set local role anon;

-- Scoped to the fixture city: `supabase test db` runs against a seeded database, so an
-- unscoped count would also see the 20 live vendors from seed/03_demo.sql.
select is(
  (select count(*) from public.vendors
    where city_id = '33333333-3333-4333-8333-000000000001')::int, 1,
  'anon sees only the live vendor, never the draft'
);

select is(
  (select count(*) from public.vendors
    where city_id = '33333333-3333-4333-8333-000000000001' and status = 'draft')::int, 0,
  'anon cannot reach a draft listing'
);

-- The reason vendor_private exists: a public SELECT on vendors must not carry PII.
select is(
  (select count(*) from public.vendor_private)::int, 0,
  'anon cannot read vendor_private (contact phone, PAN, GSTIN)'
);

select is((select count(*) from public.enquiries)::int, 0,
  'anon cannot read enquiries');
select is((select count(*) from public.leads)::int, 0,
  'anon cannot read leads');
select is((select count(*) from public.bookings)::int, 0,
  'anon cannot read bookings');
select is((select count(*) from public.payments)::int, 0,
  'anon cannot read payments');
select is((select count(*) from public.payouts)::int, 0,
  'anon cannot read payouts');
select is((select count(*) from public.profiles)::int, 0,
  'anon cannot read profiles');
select is((select count(*) from public.audit_log)::int, 0,
  'anon cannot read the audit log');
select is((select count(*) from public.staff_roles)::int, 0,
  'anon cannot enumerate staff');

-- Plan §6: money tables "never trust the client" — no INSERT policy exists at all.
select throws_ok(
  $$ insert into public.payments (booking_id, amount, aggregator)
     values ('44444444-4444-4444-8444-000000000001', 100, 'razorpay') $$,
  '42501',
  null,
  'anon cannot insert a payment'
);

reset role;

-- ---------------------------------------------------------------------------
-- An authenticated user with no memberships is no better off.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000001","role":"authenticated"}';

select is(
  (select count(*) from public.vendor_private)::int, 0,
  'a logged-in non-member cannot read vendor_private'
);

select is(
  (select count(*) from public.vendors
    where city_id = '33333333-3333-4333-8333-000000000001')::int, 1,
  'a logged-in non-member still sees only live listings'
);

reset role;

select * from finish();
rollback;
