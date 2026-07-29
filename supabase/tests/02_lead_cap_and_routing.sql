-- ============================================================================
-- pgTAP — Plan §2: "lead routing with 5-vendor cap".
-- Plan §1: "Lead quality is an engineering feature … renewal, the model's most
-- sensitive assumption, depends on [it]."
--
-- Two things are asserted here: an unverified enquiry can never become a lead, and a
-- sixth lead is impossible on an enquiry even if something tries to write one directly.
-- ============================================================================

begin;
select plan(9);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000020',
        'authenticated', 'authenticated', 'capcustomer@test.local', now(), now());

insert into public.cities (id, slug, name, state, is_launched)
values ('33333333-3333-4333-8333-000000000020', 'capville', 'Capville', 'TS', true);

insert into public.categories (id, slug, name, plural_name)
values ('33333333-3333-4333-8333-000000000021', 'capcat', 'Cap Cat', 'Cap Cats');

-- Eight eligible vendors — more than the cap, so routing has to choose.
insert into public.vendors (id, slug, display_name, status, city_id, published_at,
                            price_band_min, price_band_max, profile_score, is_seo_eligible)
select
  ('44444444-4444-4444-8444-0000000000' || lpad(g::text, 2, '0'))::uuid,
  'cap-vendor-' || g, 'Cap Vendor ' || g, 'live',
  '33333333-3333-4333-8333-000000000020', now(),
  1000000, 5000000, 80, true
from generate_series(20, 27) as g;

insert into public.vendor_categories (vendor_id, category_id, is_primary, style_tags)
select v.id, '33333333-3333-4333-8333-000000000021', true, '{}'
from public.vendors v where v.slug like 'cap-vendor-%';

-- ---------------------------------------------------------------------------
-- An unverified enquiry must not route. This is the lead-quality invariant.
-- ---------------------------------------------------------------------------

insert into public.enquiries (
  id, customer_id, category_id, city_id, event_type,
  contact_name, contact_phone, status, consent_text, consent_version
)
values (
  '55555555-5555-4555-8555-000000000020', '22222222-2222-4222-8222-000000000020',
  '33333333-3333-4333-8333-000000000021', '33333333-3333-4333-8333-000000000020',
  'wedding', 'Unverified Person', '+919000000020',
  'pending_otp', 'consent', 'v1'
);

select throws_ok(
  $$ select app.route_enquiry('55555555-5555-4555-8555-000000000020') $$,
  '23514',
  null,
  'an unverified enquiry cannot be routed'
);

select is(
  (select count(*) from public.leads
    where enquiry_id = '55555555-5555-4555-8555-000000000020')::int,
  0,
  'no leads were created for the unverified enquiry'
);

-- The table constraint backs the RPC up independently.
select throws_ok(
  $$ update public.enquiries set status = 'verified'
      where id = '55555555-5555-4555-8555-000000000020' $$,
  '23514',
  null,
  'status cannot reach verified without a phone_verified_at timestamp'
);

-- ---------------------------------------------------------------------------
-- A verified enquiry routes to at most five vendors.
-- ---------------------------------------------------------------------------

insert into public.enquiries (
  id, customer_id, category_id, city_id, event_type,
  contact_name, contact_phone, status, phone_verified_at,
  budget_min, budget_max, consent_text, consent_version
)
values (
  '55555555-5555-4555-8555-000000000021', '22222222-2222-4222-8222-000000000020',
  '33333333-3333-4333-8333-000000000021', '33333333-3333-4333-8333-000000000020',
  'wedding', 'Verified Person', '+919000000021',
  'verified', now(), 1000000, 8000000, 'consent', 'v1'
);

select lives_ok(
  $$ select app.route_enquiry('55555555-5555-4555-8555-000000000021') $$,
  'a verified enquiry routes'
);

select is(
  (select count(*) from public.leads
    where enquiry_id = '55555555-5555-4555-8555-000000000021')::int,
  5,
  'exactly 5 vendors receive the lead, though 8 were eligible'
);

select is(
  (select max(routed_seq) from public.leads
    where enquiry_id = '55555555-5555-4555-8555-000000000021')::int,
  5,
  'routed_seq tops out at 5'
);

select is(
  (select status::text from public.enquiries
    where id = '55555555-5555-4555-8555-000000000021'),
  'routed',
  'the enquiry moves to routed'
);

-- ---------------------------------------------------------------------------
-- The cap is structural, not procedural: a direct INSERT cannot exceed it either.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.leads (enquiry_id, vendor_id, routed_seq)
     values ('55555555-5555-4555-8555-000000000021',
             '44444444-4444-4444-8444-000000000027', 6) $$,
  '23514',
  null,
  'routed_seq 6 violates the cap check constraint'
);

-- Re-using a slot collides on the unique index, which is what makes concurrent
-- routing safe without locking the enquiry's whole lead set.
select throws_ok(
  $$ insert into public.leads (enquiry_id, vendor_id, routed_seq)
     values ('55555555-5555-4555-8555-000000000021',
             '44444444-4444-4444-8444-000000000027', 3) $$,
  '23505',
  null,
  'reusing routed_seq 3 collides on the unique index'
);

select * from finish();
rollback;
