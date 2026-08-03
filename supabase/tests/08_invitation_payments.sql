-- ============================================================================
-- Fremmo — public.invitation_payments is readable by staff and writable by nobody
--
-- CLAUDE.md's second non-negotiable: money tables carry SELECT policies and nothing else.
-- This one is the ledger behind every invitation payment, so the assertions are about who
-- may read it, who may write it (nobody, through RLS), and the two constraints that keep a
-- replayed webhook from landing twice or a success from landing without a timestamp.
-- ============================================================================

begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000080',
   'authenticated', 'authenticated', 'ledgerbuyer@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-000000000081',
   'authenticated', 'authenticated', 'ledgermod@test.local', now(), now());

insert into public.staff_roles (profile_id, role)
values ('22222222-2222-4222-8222-000000000081', 'moderator');

insert into public.invitation_templates (id, slug, name, price, poster_url, is_active)
values ('55555555-5555-4555-8555-000000000080', 'ledger-tmpl', 'Ledger Template', 149900,
        'https://example.test/p.webp', true);

insert into public.invitation_orders (
  id, reference, template_id, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone, customer_id
)
values ('66666666-6666-4666-8666-000000000080', 'UTS-INV-LDG080',
        '55555555-5555-4555-8555-000000000080', 'ledger-tmpl', 'Ledger Template', 149900,
        9900, 140000, 'Ledger Buyer', 'ledgerbuyer@test.local', '+919000000080',
        '22222222-2222-4222-8222-000000000080');

-- Three events on one order: the shape this table exists for.
insert into public.invitation_payments
  (order_id, aggregator, aggregator_payment_id, amount, status, method, paid_at, failure_reason, webhook_payload)
values
  ('66666666-6666-4666-8666-000000000080', 'cashfree', 'cf_fail_080', 9900, 'FAILED',
   'card', null, 'Insufficient funds', '{"type":"PAYMENT_FAILED_WEBHOOK"}'::jsonb),
  ('66666666-6666-4666-8666-000000000080', 'cashfree', 'cf_drop_080', 9900, 'USER_DROPPED',
   'netbanking', null, null, '{"type":"PAYMENT_USER_DROPPED_WEBHOOK"}'::jsonb),
  ('66666666-6666-4666-8666-000000000080', 'cashfree', 'cf_ok_080', 9900, 'SUCCESS',
   'upi', now(), null, '{"type":"PAYMENT_SUCCESS_WEBHOOK"}'::jsonb);

-- ---------------------------------------------------------------------------
-- 1–2. Failed attempts are kept. This is the whole point of the table: the order can
--      only ever remember the attempt that worked.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.invitation_payments
    where order_id = '66666666-6666-4666-8666-000000000080'),
  3,
  'all three attempts are on record, not just the successful one'
);

select is(
  (select count(*)::int from public.invitation_payments
    where order_id = '66666666-6666-4666-8666-000000000080' and status <> 'SUCCESS'),
  2,
  'the declined card and the abandoned attempt both survived'
);

-- ---------------------------------------------------------------------------
-- 3–4. The constraints.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.invitation_payments
      (order_id, aggregator, aggregator_payment_id, amount, status, paid_at, webhook_payload)
    values ('66666666-6666-4666-8666-000000000080', 'cashfree', 'cf_ok_080', 9900, 'SUCCESS', now(), '{}'::jsonb)$$,
  '23505',
  null,
  'a replayed webhook cannot land the same payment id twice'
);

select throws_ok(
  $$insert into public.invitation_payments
      (order_id, aggregator, aggregator_payment_id, amount, status, paid_at, webhook_payload)
    values ('66666666-6666-4666-8666-000000000080', 'cashfree', 'cf_nodate_080', 9900, 'SUCCESS', null, '{}'::jsonb)$$,
  '23514',
  null,
  'a SUCCESS with no paid_at is refused — the half-written row this constraint exists for'
);

-- ---------------------------------------------------------------------------
-- 5–8. Anonymous: nothing.
-- ---------------------------------------------------------------------------

set local role anon;

select is(
  (select count(*)::int from public.invitation_payments),
  0,
  'anon reads no payment rows at all'
);

select throws_ok(
  $$insert into public.invitation_payments
      (order_id, aggregator, aggregator_payment_id, amount, status, paid_at, webhook_payload)
    values ('66666666-6666-4666-8666-000000000080', 'cashfree', 'cf_anon', 1, 'SUCCESS', now(), '{}'::jsonb)$$,
  '42501',
  null,
  'anon cannot insert a payment — there is no INSERT policy, and there must never be one'
);

reset role;

-- ---------------------------------------------------------------------------
-- 7–9. A signed-in customer: still nothing, not even on their own order.
--
-- Their receipt is paid_at and the amount on the order row, which they can already see.
-- The aggregator's ids, the failure reasons and the raw payload are operational detail.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000080","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.invitation_payments),
  0,
  'the buyer cannot read the ledger behind their own order'
);

select throws_ok(
  $$insert into public.invitation_payments
      (order_id, aggregator, aggregator_payment_id, amount, status, paid_at, webhook_payload)
    values ('66666666-6666-4666-8666-000000000080', 'cashfree', 'cf_self', 1, 'SUCCESS', now(), '{}'::jsonb)$$,
  '42501',
  null,
  'a customer cannot write themselves a payment — this is the whole fraud'
);

-- An UPDATE with no policy affects nothing rather than raising. Asserting the row count is
-- what proves it, since a silent no-op and a successful write look identical from here.
with attempted as (
  update public.invitation_payments set amount = 1 where aggregator_payment_id = 'cf_ok_080'
  returning 1
)
select is(
  (select count(*)::int from attempted),
  0,
  'and cannot rewrite the amount on an existing one'
);

reset role;

-- ---------------------------------------------------------------------------
-- 10–12. Staff read everything, and still cannot write.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-000000000081","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.invitation_payments
    where order_id = '66666666-6666-4666-8666-000000000080'),
  3,
  'a moderator reads every attempt on the order'
);

select is(
  (select failure_reason from public.invitation_payments where aggregator_payment_id = 'cf_fail_080'),
  'Insufficient funds',
  'including why the card was declined — the answer to "I paid and nothing happened"'
);

select throws_ok(
  $$insert into public.invitation_payments
      (order_id, aggregator, aggregator_payment_id, amount, status, paid_at, webhook_payload)
    values ('66666666-6666-4666-8666-000000000080', 'cashfree', 'cf_staff', 1, 'SUCCESS', now(), '{}'::jsonb)$$,
  '42501',
  null,
  'not even a moderator may write a payment — only the signed webhook, under service_role'
);

select * from finish();
rollback;
