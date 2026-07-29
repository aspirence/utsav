-- ============================================================================
-- pgTAP — Plan §5 escrow state machine + §2 booking-gated reviews.
-- Plan §9: "escrow state machine at ~90% [coverage] — money and trust paths are
-- non-negotiable".
-- ============================================================================

begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- The transition table. Plan §5: initiated → advance_held → confirmed → completed
-- → released, with refund_pending / refunded / disputed branches.
-- ---------------------------------------------------------------------------

select ok(app.booking_transition_allowed('initiated', 'advance_held'),
  'initiated → advance_held is the escrow happy path');
select ok(app.booking_transition_allowed('advance_held', 'confirmed'),
  'advance_held → confirmed');
select ok(app.booking_transition_allowed('confirmed', 'completed'),
  'confirmed → completed');
select ok(app.booking_transition_allowed('completed', 'released'),
  'completed → released settles the vendor');

-- Plan §2 sequencing: bookings ship Apr 2027, escrow Jul 2027. Until then a booking
-- confirms with no money attached.
select ok(app.booking_transition_allowed('initiated', 'confirmed'),
  'initiated → confirmed works pre-escrow');

-- Money must never skip the machine.
select ok(not app.booking_transition_allowed('initiated', 'released'),
  'initiated → released is impossible — funds cannot skip escrow');
select ok(not app.booking_transition_allowed('initiated', 'completed'),
  'initiated → completed is impossible');
select ok(not app.booking_transition_allowed('refunded', 'released'),
  'refunded is terminal');
select ok(not app.booking_transition_allowed('cancelled', 'confirmed'),
  'cancelled is terminal');

-- Plan §12: "stuck refunds at someone's wedding" — a dispute must always resolve.
select ok(app.booking_transition_allowed('disputed', 'released'),
  'a dispute can resolve in the vendor''s favour');
select ok(app.booking_transition_allowed('disputed', 'refunded'),
  'a dispute can resolve in the customer''s favour');

-- ---------------------------------------------------------------------------
-- Fixtures for the live transition + review gate.
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000030',
   'authenticated', 'authenticated', 'buyer@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000031',
   'authenticated', 'authenticated', 'stranger@test.local', now(), now());

insert into public.cities (id, slug, name, state, is_launched)
values ('33333333-3333-4333-8333-000000000030', 'escrowville', 'Escrowville', 'TS', true);

insert into public.vendors (id, slug, display_name, status, city_id, published_at)
values ('44444444-4444-4444-8444-000000000030', 'escrow-vendor', 'Escrow Vendor', 'live',
        '33333333-3333-4333-8333-000000000030', now());

insert into public.bookings (
  id, reference, customer_id, vendor_id, status, event_date, event_type,
  total_amount, advance_amount, balance_amount
)
values (
  '77777777-7777-4777-8777-000000000030', 'UTS-TEST-0001',
  '22222222-2222-4222-8222-000000000030', '44444444-4444-4444-8444-000000000030',
  'confirmed', current_date + 10, 'wedding', 10000000, 2500000, 7500000
);

-- An illegal transition is rejected even from a trusted caller.
select throws_ok(
  $$ select app.transition_booking('77777777-7777-4777-8777-000000000030', 'released') $$,
  '23514',
  null,
  'confirmed → released is refused by the state machine'
);

-- ---------------------------------------------------------------------------
-- Booking-gated reviews. Plan §2 / §5 (reviews.booking_id is UNIQUE).
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000030","role":"authenticated"}';

-- The booking is only 'confirmed', not 'completed' — no review yet.
select throws_ok(
  $$ insert into public.reviews (booking_id, vendor_id, author_id, rating)
     values ('77777777-7777-4777-8777-000000000030',
             '44444444-4444-4444-8444-000000000030',
             '22222222-2222-4222-8222-000000000030', 5) $$,
  '42501',
  null,
  'a review is refused before the booking completes'
);

reset role;

update public.bookings
   set status = 'completed', completed_at = now()
 where id = '77777777-7777-4777-8777-000000000030';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000030","role":"authenticated"}';

select lives_ok(
  $$ insert into public.reviews (booking_id, vendor_id, author_id, rating, body)
     values ('77777777-7777-4777-8777-000000000030',
             '44444444-4444-4444-8444-000000000030',
             '22222222-2222-4222-8222-000000000030', 5, 'Excellent work.') $$,
  'the customer can review once the booking is completed'
);

-- Plan §5: one review per booking, enforced by the UNIQUE constraint.
select throws_ok(
  $$ insert into public.reviews (booking_id, vendor_id, author_id, rating)
     values ('77777777-7777-4777-8777-000000000030',
             '44444444-4444-4444-8444-000000000030',
             '22222222-2222-4222-8222-000000000030', 4) $$,
  '23505',
  null,
  'a second review on the same booking is rejected'
);

reset role;

-- A stranger cannot review someone else's booking.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000031","role":"authenticated"}';

select throws_ok(
  $$ insert into public.reviews (booking_id, vendor_id, author_id, rating)
     values ('77777777-7777-4777-8777-000000000030',
             '44444444-4444-4444-8444-000000000030',
             '22222222-2222-4222-8222-000000000031', 1) $$,
  '42501',
  null,
  'a stranger cannot review a booking they were not party to'
);

reset role;

select * from finish();
rollback;
