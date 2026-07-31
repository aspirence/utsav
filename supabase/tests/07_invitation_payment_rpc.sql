-- ============================================================================
-- Utsava — public.record_invitation_payment() is reachable, and only by service_role
--
-- CLAUDE.md: "Add a pgTAP test in the same PR for anything touching leads, money or
-- reviews." This wrapper is the single path by which an order becomes paid, so its grant
-- list is the whole of the fraud surface: anyone who can execute it can mark their own
-- order settled without settling it.
--
-- The assertions are about privilege and idempotency, not about the update itself —
-- 05_invitation_orders.sql already covers the column guards and the reconcile constraint.
-- ============================================================================

begin;
select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures. One unpaid order, one already paid.
-- ---------------------------------------------------------------------------

insert into public.invitation_templates (id, slug, name, price, poster_url, is_active)
values ('55555555-5555-4555-8555-000000000070', 'pay-rpc-tmpl', 'Pay RPC Template', 149900,
        'https://example.test/p.webp', true);

insert into public.invitation_orders (
  id, reference, template_id, template_slug, template_name, template_price,
  booking_amount, balance_amount, contact_name, contact_email, contact_phone
)
values
  ('66666666-6666-4666-8666-000000000070', 'UTS-INV-PAY070',
   '55555555-5555-4555-8555-000000000070', 'pay-rpc-tmpl', 'Pay RPC Template', 149900,
   9900, 140000, 'Unpaid Buyer', 'unpaid@test.local', '+919000000070'),
  ('66666666-6666-4666-8666-000000000071', 'UTS-INV-PAY071',
   '55555555-5555-4555-8555-000000000070', 'pay-rpc-tmpl', 'Pay RPC Template', 149900,
   9900, 140000, 'Second Buyer', 'second@test.local', '+919000000071');

-- ---------------------------------------------------------------------------
-- 1–3. The wrapper exists, and the privilege list is exactly service_role.
--
-- has_function_privilege is asserted per role rather than inspecting proacl, because a NULL
-- proacl means "owner defaults" and would read as no grants at all while PUBLIC in fact
-- still holds EXECUTE. Asking the question the executor asks is the only honest test.
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('service_role',
    'public.record_invitation_payment(text,text,timestamptz)', 'execute'),
  'service_role may execute the wrapper'
);

select ok(
  not has_function_privilege('anon',
    'public.record_invitation_payment(text,text,timestamptz)', 'execute'),
  'anon may NOT execute the wrapper — this is the fraud surface'
);

select ok(
  not has_function_privilege('authenticated',
    'public.record_invitation_payment(text,text,timestamptz)', 'execute'),
  'a signed-in customer may NOT mark their own order paid'
);

-- ---------------------------------------------------------------------------
-- 4. The inner function is granted too. The wrapper is security invoker, so a missing
--    grant here fails at call time with an error naming the wrong function.
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('service_role',
    'app.record_invitation_payment(text,text,timestamptz)', 'execute'),
  'service_role may execute the inner function the wrapper calls'
);

-- ---------------------------------------------------------------------------
-- 5–7. It records a payment.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.record_invitation_payment('UTS-INV-PAY070', 'cf_pay_070')$$,
  'the wrapper records a payment on an unpaid order'
);

select is(
  (select payment_ref from public.invitation_orders where reference = 'UTS-INV-PAY070'),
  'cf_pay_070',
  'the payment reference is written'
);

select is(
  (select status::text from public.invitation_orders where reference = 'UTS-INV-PAY070'),
  'booked',
  'and the order advances from awaiting_payment to booked'
);

-- ---------------------------------------------------------------------------
-- 8. A REPLAYED WEBHOOK.
--
-- Cashfree retries until it gets a 2xx and will re-deliver an event it has already
-- delivered. The RPC raises no_data_found on a second call, and the route handler is
-- written to answer 200 to exactly that. Pinning the error code here is what stops someone
-- "improving" the RPC into a silent no-op or a different code, either of which would turn
-- a normal retry into a permanent 500 and a stuck payment.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.record_invitation_payment('UTS-INV-PAY070', 'cf_pay_070_again')$$,
  'P0002',
  null,
  'a replayed webhook raises no_data_found rather than paying twice'
);

select is(
  (select payment_ref from public.invitation_orders where reference = 'UTS-INV-PAY070'),
  'cf_pay_070',
  'and the original payment reference is untouched by the replay'
);

-- ---------------------------------------------------------------------------
-- 9. An empty payment reference is refused. A paid_at with no payment_ref is exactly the
--    half-written state `invitation_orders_paid_has_ref` exists to prevent.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.record_invitation_payment('UTS-INV-PAY071', '   ')$$,
  '23514',
  null,
  'a blank payment reference is refused before anything is written'
);

select * from finish();
rollback;
