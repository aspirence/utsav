-- ============================================================================
-- pgTAP — public.invitation_cards, the published invitation.
--
-- CLAUDE.md: "Add a pgTAP test in the same PR for anything touching leads, money or reviews."
-- This view sits on invitation_orders, which carries both contact details and amounts, and it is
-- the only object in the schema granted to `anon` that reads that table. So the two claims worth
-- asserting rather than commenting are:
--
--   1. An anonymous reader gets published cards and nothing else — not drafts.
--   2. The route to those cards exposes no contact detail and no money, and cannot be widened
--      into the underlying table.
--
-- Run: supabase test db
-- ============================================================================

begin;
select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures. One published card, one unpublished order.
-- ---------------------------------------------------------------------------

insert into public.invitation_templates (id, slug, name, price, poster_url, is_active)
values ('55555555-5555-4555-8555-000000000090', 'test-card', 'Test Card', 149900,
        'https://example.test/p.webp', true);

insert into public.invitation_orders (
  id, reference, template_id, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone,
  card_content, card_content_version, public_slug, published_at
)
values (
  '66666666-6666-4666-8666-000000000090', 'UTS-INV-PUB1',
  '55555555-5555-4555-8555-000000000090', 'test-card', 'Test Card', 149900,
  9900, 140000, 'Published Buyer', 'published@test.local', '+919000000090',
  '{"hosts": "The Sharmas"}'::jsonb, 1, 'aarav-and-meera-7fk2', now()
);

insert into public.invitation_orders (
  id, reference, template_id, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone,
  card_content, card_content_version, public_slug
)
values (
  '66666666-6666-4666-8666-000000000091', 'UTS-INV-DRF1',
  '55555555-5555-4555-8555-000000000090', 'test-card', 'Test Card', 149900,
  9900, 140000, 'Draft Buyer', 'draft@test.local', '+919000000091',
  '{"hosts": "The Guptas"}'::jsonb, 1, 'draft-card-not-live-9xq'
);

-- ---------------------------------------------------------------------------
-- The view exposes no contact detail and no money.
--
-- Asserted by absence rather than by reading a row, because a column added to this view in six
-- months would leak on every published card at once and no row-level test would notice.
-- ---------------------------------------------------------------------------

select hasnt_column('public', 'invitation_cards', 'contact_name',
  'invitation_cards does not expose contact_name');
select hasnt_column('public', 'invitation_cards', 'contact_email',
  'invitation_cards does not expose contact_email');
select hasnt_column('public', 'invitation_cards', 'contact_phone',
  'invitation_cards does not expose contact_phone');
select hasnt_column('public', 'invitation_cards', 'template_price',
  'invitation_cards does not expose the price');
select hasnt_column('public', 'invitation_cards', 'booking_amount',
  'invitation_cards does not expose the booking amount');
select hasnt_column('public', 'invitation_cards', 'reference',
  'invitation_cards does not expose the order reference');
select hasnt_column('public', 'invitation_cards', 'customer_id',
  'invitation_cards does not expose the customer id');

select has_column('public', 'invitation_cards', 'card_content',
  'invitation_cards does expose the card content');

-- ---------------------------------------------------------------------------
-- Anonymous: the published card, and only the published card.
-- ---------------------------------------------------------------------------

set local role anon;

select is(
  (select count(*)::int from public.invitation_cards),
  1,
  'anon sees exactly the published card through the view'
);

select is(
  (select public_slug from public.invitation_cards),
  'aarav-and-meera-7fk2',
  'anon sees the published slug'
);

select is(
  (select count(*)::int from public.invitation_cards where public_slug = 'draft-card-not-live-9xq'),
  0,
  'anon cannot reach an unpublished order through the view, even knowing its slug'
);

-- The view is the only route. invitation_orders itself has no policy for anon, so a direct read
-- returns nothing rather than the row behind the card just seen.
select is(
  (select count(*)::int from public.invitation_orders),
  0,
  'anon reads nothing from invitation_orders directly'
);

reset role;

-- ---------------------------------------------------------------------------
-- Published means complete. The constraint refuses a half-published row rather than leaving a
-- card that resolves to a blank page.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$
    insert into public.invitation_orders (
      reference, template_slug, template_name, template_price,
      booking_amount, balance_amount, contact_name, contact_email, contact_phone,
      published_at
    ) values (
      'UTS-INV-BAD1', 'test-card', 'Test Card', 149900,
      9900, 140000, 'No Content', 'nocontent@test.local', '+919000000092',
      now()
    )
  $$,
  '23514',
  null,
  'publishing without content, slug or version violates invitation_orders_published_is_complete'
);

select * from finish();
rollback;
