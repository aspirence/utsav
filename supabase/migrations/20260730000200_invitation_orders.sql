-- ---------------------------------------------------------------------------
-- Invitation orders — somebody paid a booking amount to reserve a design slot.
--
-- THIS IS NOT public.bookings AND MUST NOT BECOME IT. Plan §6 makes bookings, payments,
-- payouts, refunds and subscriptions service-role write-only: they carry SELECT policies and
-- nothing else, and every transition goes through app.transition_booking(). A vendor booking
-- is an escrow instrument with a two-sided settlement behind it (§14, July 2027).
--
-- An invitation order is a different animal: a customer, a template, a small booking amount,
-- and a balance owed on delivery. It has no vendor, no payout leg and no escrow. Modelling it
-- as a booking row would mean either loosening those policies or inventing a vendor to point
-- at — both worse than a table of its own.
--
-- WHO WRITES THIS ROW. Nobody, from a browser. There is deliberately no INSERT policy for anon
-- or authenticated, so the only path in is the service-role client from the booking action —
-- exactly the pattern apps/web/app/(site)/enquire/actions.ts already uses, and for the same
-- reason: the person filling the form has no account yet, so there is no auth.uid() for a
-- with-check to test against. `customer_id` stays null until they sign in and claim it.
--
-- That is a real constraint on this table, not a stylistic one: a client-writable orders table
-- is a client-writable price field, and a client-writable price field is a ₹1 wedding website.
-- ---------------------------------------------------------------------------

create type public.invitation_order_status as enum (
  'awaiting_payment',  -- row created, booking amount not yet received
  'booked',            -- booking amount received; design slot reserved
  'details_received',  -- customer sent names, dates, photographs
  'draft_sent',        -- draft delivered for approval
  'approved',          -- customer approved; balance now due
  'delivered',         -- balance paid, final invitation handed over
  'refunded',          -- booking amount returned
  'cancelled'
);

comment on type public.invitation_order_status is
  'Lifecycle of one invitation order. Money moves at awaiting_payment→booked and approved→delivered.';

create table public.invitation_orders (
  id            uuid primary key default gen_random_uuid(),

  -- Human-quotable. "UTS-INV-4F2A" is something a customer can read out on WhatsApp; a uuid
  -- is not. Generated in the action, unique here.
  reference     text not null unique,

  template_id   uuid references public.invitation_templates (id) on delete restrict,
  /*
   * Denormalised on purpose, and this one is load-bearing.
   *
   * A template's name and price can change after an order is placed. The order has to remember
   * what was actually agreed, or a price rise silently rewrites what a customer owes. The FK
   * above is for joining; these three are the contract.
   */
  template_slug text not null,
  template_name text not null,
  template_price app.paise not null,

  /* Plan §5: integer paise. What was asked for now, and what is left afterwards. */
  booking_amount app.paise not null,
  balance_amount app.paise not null,

  status        public.invitation_order_status not null default 'awaiting_payment',

  -- Contact. No masking here: unlike a vendor lead (§6), staff are the party who has to
  -- actually deliver this order, so they read the row.
  contact_name  text not null,
  contact_email text not null,
  contact_phone text not null,

  /*
   * Null until the customer signs in and claims the order, same as enquiries.customer_id.
   * A guest can order; they just cannot see it back until they have an identity.
   */
  customer_id   uuid references public.profiles (id) on delete set null,

  /* Set by the payment webhook when there is one. Never written from a browser. */
  payment_ref   text,
  paid_at       timestamptz,

  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint invitation_orders_reference_format check (reference ~ '^UTS-INV-[A-Z0-9]{4,10}$'),
  constraint invitation_orders_email_shape check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint invitation_orders_phone_format check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- The two legs must add up to what was quoted. Without this, a booking amount and a balance
  -- can drift apart and nobody notices until a customer disputes the total.
  constraint invitation_orders_amounts_reconcile
    check (booking_amount + balance_amount = template_price),
  -- A paid stamp with no reference, or a reference with no stamp, is a half-written payment.
  constraint invitation_orders_payment_pair
    check ((paid_at is null) = (payment_ref is null)),
  -- Nothing past 'booked' without the money having arrived.
  constraint invitation_orders_paid_before_progress
    check (status in ('awaiting_payment', 'cancelled') or paid_at is not null)
);

comment on table public.invitation_orders is
  'Plan §2 invitation storefront orders. Service-role write only — no client INSERT policy exists.';
comment on column public.invitation_orders.template_price is
  'What the template cost when ordered. Denormalised so a later price change cannot rewrite it.';

create index invitation_orders_status_idx on public.invitation_orders (status, created_at desc);
create index invitation_orders_customer_idx on public.invitation_orders (customer_id)
  where customer_id is not null;
create index invitation_orders_phone_idx on public.invitation_orders (contact_phone);

create trigger invitation_orders_set_updated_at
  before update on public.invitation_orders
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Plan §6: "there is no trusted API between clients and Postgres for reads."
-- ---------------------------------------------------------------------------

alter table public.invitation_orders enable row level security;

-- The customer sees their own, once they have claimed it by signing in.
create policy invitation_orders_select_own on public.invitation_orders
  for select to authenticated
  using (customer_id = auth.uid());

create policy invitation_orders_select_staff on public.invitation_orders
  for select to authenticated
  using (app.is_staff());

/*
 * Staff may move an order along. Moderator and super only — a field agent's remit is vendor
 * listings in their own city, and this is a national order with money attached.
 *
 * NO INSERT POLICY, AND NO DELETE POLICY, ANYWHERE. Creating an order is the service-role
 * action's job (see the header). Deleting one would destroy the record of a payment somebody
 * made, which is what 'cancelled' and 'refunded' exist for instead.
 */
create policy invitation_orders_update_staff on public.invitation_orders
  for update to authenticated
  using (app.is_staff('moderator', 'super'))
  with check (app.is_staff('moderator', 'super'));

/*
 * Column guard: staff move the status, they do not rewrite the money.
 *
 * RLS cannot express column-level rules, so the trigger completes the policy — the same
 * division app.guard_vendor_columns() makes for vendors. A moderator editing an order's price
 * after the customer agreed to it is precisely what an append-only audit log is meant to make
 * impossible, and this stops it happening at all rather than merely recording it.
 *
 * app.set_trusted_write(true) is the service-role escape hatch, already used by the derived
 * metric writers.
 */
create or replace function app.guard_invitation_order_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_trusted_write() then
    return new;
  end if;

  if new.template_price is distinct from old.template_price
     or new.booking_amount is distinct from old.booking_amount
     or new.balance_amount is distinct from old.balance_amount
     or new.template_slug is distinct from old.template_slug
     or new.reference is distinct from old.reference
     or new.paid_at is distinct from old.paid_at
     or new.payment_ref is distinct from old.payment_ref
  then
    raise exception
      'Order amounts, reference and payment stamps are set when the order is placed and by the '
      'payment webhook. They cannot be edited from the console.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger invitation_orders_guard_columns
  before update on public.invitation_orders
  for each row execute function app.guard_invitation_order_columns();
