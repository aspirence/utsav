-- ============================================================================
-- Fremmo — public.invitation_payments: every payment event, kept
--
-- WHY A TABLE AND NOT MORE COLUMNS ON THE ORDER. invitation_orders holds one payment_ref
-- and one paid_at, which can only ever describe the attempt that worked. Real orders are
-- not like that: a card is declined, the customer switches to UPI, the second attempt
-- succeeds. That is two payment events, and the first one is the one support gets asked
-- about — "I paid and nothing happened". With a single column on the order it is not
-- recorded anywhere and the answer is a shrug.
--
-- So this is a ledger: one row per event Cashfree sends, success or not. The order keeps
-- its summary (paid_at, payment_ref) because that is what every read path already uses;
-- this is the detail behind it.
--
-- It mirrors public.payments, which does the same job for vendor bookings. It is not that
-- table because payments.booking_id is `not null` and points at public.bookings — vendor
-- bookings with escrow, which invitation orders are not. Plan §14 puts escrow in July 2027;
-- when the two flows converge, this table is what merges into that one.
--
-- SERVICE-ROLE WRITE-ONLY, per CLAUDE.md's second non-negotiable: money tables carry SELECT
-- policies and nothing else. There is no INSERT or UPDATE policy here for anon or
-- authenticated, and there must never be one — a customer who could insert a payment row
-- could pay nothing and be recorded as having paid.
--
-- webhook_payload is kept whole and deliberately. Plan §4 asks for it: "webhooks carry
-- signature verification; the raw payload is kept for reconciliation and dispute evidence".
-- When Cashfree's dashboard and ours disagree about a rupee, the thing that settles it is
-- what they actually sent, not our reading of it.
-- ============================================================================

create table public.invitation_payments (
  id          uuid primary key default gen_random_uuid(),

  order_id    uuid not null references public.invitation_orders (id) on delete cascade,

  -- Same vocabulary as public.payments.aggregator, so the two can be read together and
  -- eventually merged without a translation step.
  aggregator            text not null default 'cashfree'
    check (aggregator in ('razorpay', 'cashfree')),
  aggregator_payment_id text not null,

  -- Integer paise (plan §5). What the aggregator says was actually taken, which is not
  -- always what the order asked for — a partial capture is a real thing and the difference
  -- is the whole reason to store it rather than assume it.
  amount    app.paise not null,
  currency  text not null default 'INR' check (currency = 'INR'),

  -- Cashfree's own words: SUCCESS, FAILED, USER_DROPPED. Stored as text rather than an enum
  -- because it is a third party's vocabulary — they may add a state, and a new value should
  -- land in the ledger rather than being rejected at the door with the payment lost.
  status    text not null,

  -- 'upi', 'card', 'netbanking', 'wallet'. The instrument, not the card number: the nested
  -- detail Cashfree sends is masked digits and networks we have no use for and no business
  -- storing. The full object survives in webhook_payload if it is ever needed.
  method    text,

  paid_at         timestamptz,
  failure_reason  text,

  webhook_payload jsonb not null,
  received_at     timestamptz not null default now(),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The idempotency key. Cashfree retries until it gets a 2xx and will re-deliver an event
  -- it has already delivered, so the same payment must not be able to land twice. The
  -- webhook inserts with `on conflict do nothing` against this.
  constraint invitation_payments_unique_event unique (aggregator, aggregator_payment_id),

  -- A success with no timestamp is a half-written row, the same shape
  -- invitation_orders_paid_has_ref refuses on the order.
  constraint invitation_payments_success_has_time
    check (status <> 'SUCCESS' or paid_at is not null)
);

comment on table public.invitation_payments is
  'Plan §4: every payment event from the aggregator, success or failure, with the raw '
  'payload kept for reconciliation and dispute evidence. Service-role write-only.';

-- The console lists an order and wants its attempts newest first.
create index invitation_payments_order_idx
  on public.invitation_payments (order_id, received_at desc);

-- Reconciliation goes the other way: from a Cashfree payment id back to our order.
create index invitation_payments_status_idx
  on public.invitation_payments (status, received_at desc);

create trigger invitation_payments_set_updated_at
  before update on public.invitation_payments
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Reads only, and only for staff.
--
-- No customer-facing policy. A buyer sees paid_at and the amount on their own order row,
-- which is their receipt; the aggregator's ids, the failure reasons and the raw payload are
-- operational detail, and the smallest audience that can do the job is the right one.
-- ---------------------------------------------------------------------------

alter table public.invitation_payments enable row level security;

create policy invitation_payments_select_staff on public.invitation_payments
  for select
  using (app.is_staff());

-- No INSERT, UPDATE or DELETE policy, on purpose. Every write arrives through the
-- service-role key from a signature-verified webhook. See CLAUDE.md.
