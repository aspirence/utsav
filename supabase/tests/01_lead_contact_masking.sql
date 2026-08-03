-- ============================================================================
-- pgTAP — Plan §6: "contact masking is a view — vendors see a customer's phone only
-- in permitted lead states."
--
-- This is the single most load-bearing privacy rule in the product: the lead business
-- only works if a routed-but-unopened lead does not leak the customer's number, and
-- DPDP purpose limitation (§6) depends on the same boundary.
-- ============================================================================

begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures: one customer, one vendor with an owner, one verified enquiry.
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000010',
   'authenticated', 'authenticated', 'customer@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000011',
   'authenticated', 'authenticated', 'vendorowner@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000012',
   'authenticated', 'authenticated', 'rival@test.local', now(), now());

insert into public.cities (id, slug, name, state, is_launched)
values ('33333333-3333-4333-8333-000000000010', 'maskville', 'Maskville', 'TS', true);

insert into public.categories (id, slug, name, plural_name)
values ('33333333-3333-4333-8333-000000000011', 'maskcat', 'Mask Cat', 'Mask Cats');

insert into public.vendors (id, slug, display_name, status, city_id, published_at)
values
  ('44444444-4444-4444-8444-000000000010', 'mask-vendor', 'Mask Vendor', 'live',
   '33333333-3333-4333-8333-000000000010', now()),
  ('44444444-4444-4444-8444-000000000011', 'rival-vendor', 'Rival Vendor', 'live',
   '33333333-3333-4333-8333-000000000010', now());

insert into public.vendor_members (vendor_id, profile_id, role, accepted_at)
values
  ('44444444-4444-4444-8444-000000000010', '22222222-2222-4222-8222-000000000011', 'owner', now()),
  ('44444444-4444-4444-8444-000000000011', '22222222-2222-4222-8222-000000000012', 'owner', now());

insert into public.enquiries (
  id, customer_id, category_id, city_id, event_type,
  contact_name, contact_phone, contact_email,
  status, phone_verified_at, consent_text, consent_version
)
values (
  '55555555-5555-4555-8555-000000000010',
  '22222222-2222-4222-8222-000000000010',
  '33333333-3333-4333-8333-000000000011',
  '33333333-3333-4333-8333-000000000010',
  'wedding',
  'Ananya Iyer', '+919000000010', 'ananya@test.local',
  'verified', now(),
  'I agree that Fremmo may share these details with up to 5 matching vendors.', 'v1'
);

insert into public.leads (id, enquiry_id, vendor_id, routed_seq, status)
values ('66666666-6666-4666-8666-000000000010',
        '55555555-5555-4555-8555-000000000010',
        '44444444-4444-4444-8444-000000000010', 1, 'routed');

-- ---------------------------------------------------------------------------
-- The rule itself, independent of any session.
-- ---------------------------------------------------------------------------

select ok(not app.lead_contact_visible('routed', null),  'routed  ⇒ contact hidden');
select ok(    app.lead_contact_visible('viewed', null),  'viewed  ⇒ contact visible');
select ok(    app.lead_contact_visible('responded', null), 'responded ⇒ contact visible');
select ok(    app.lead_contact_visible('quoted', null),  'quoted  ⇒ contact visible');
select ok(    app.lead_contact_visible('converted', null), 'converted ⇒ contact visible');
select ok(not app.lead_contact_visible('expired', null), 'expired ⇒ contact hidden');
-- Plan §12: a refunded junk lead loses the contact details it briefly exposed.
select ok(not app.lead_contact_visible('viewed', now()), 'refunded credit ⇒ contact revoked');

-- ---------------------------------------------------------------------------
-- Through the view, as the vendor owner.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000011","role":"authenticated"}';

select is(
  (select contact_phone from public.vendor_leads
    where lead_id = '66666666-6666-4666-8666-000000000010'),
  null,
  'a routed lead exposes no phone number to the vendor'
);

select is(
  (select contact_first_name from public.vendor_leads
    where lead_id = '66666666-6666-4666-8666-000000000010'),
  'Ananya',
  'the vendor still gets a first name so they can reply'
);

-- A vendor must never reach the base enquiries table, masked view or not.
select is(
  (select count(*) from public.enquiries)::int, 0,
  'a vendor cannot read public.enquiries directly'
);

reset role;

-- Open the lead, which is what earns the contact details.
select app.transition_lead('66666666-6666-4666-8666-000000000010', 'viewed');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000011","role":"authenticated"}';

select is(
  (select contact_phone from public.vendor_leads
    where lead_id = '66666666-6666-4666-8666-000000000010'),
  '+919000000010',
  'once viewed, the vendor sees the phone number'
);

reset role;

-- ---------------------------------------------------------------------------
-- A competing vendor sees nothing at all.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000012","role":"authenticated"}';

select is(
  (select count(*) from public.vendor_leads)::int, 0,
  'a rival vendor sees no rows in vendor_leads'
);

reset role;

select * from finish();
rollback;
