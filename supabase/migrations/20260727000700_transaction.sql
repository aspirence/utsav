-- ============================================================================
-- Utsava — 000700 · Transaction (money)
-- Plan §5: "quotes, bookings, payments, payouts, refunds, disputes — service-role
-- writes only; money in integer paise"
-- Plan §6: "money tables never trust the client … written only by service-role code,
-- merely readable by their parties"
-- Plan §4: "Escrow rides a licensed payment aggregator … Utsava never holds customer money."
-- ============================================================================

create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads (id) on delete cascade,
  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  package_id    uuid references public.packages (id) on delete set null,

  status        public.quote_status not null default 'draft',

  title         text not null,
  notes         text,
  line_items    jsonb not null default '[]'::jsonb,

  subtotal      app.paise not null,
  discount      app.paise not null default 0,
  tax_amount    app.paise not null default 0,
  total         app.paise not null,

  -- Plan §S15+: escrow takes an advance, not the full amount.
  advance_amount app.paise not null default 0,
  advance_pct    smallint check (advance_pct is null or advance_pct between 0 and 100),

  event_date    date,
  valid_until   timestamptz,

  sent_at       timestamptz,
  accepted_at   timestamptz,
  rejected_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint quotes_total_consistent check (total = subtotal - discount + tax_amount),
  constraint quotes_advance_within_total check (advance_amount <= total)
);

create index quotes_lead_idx   on public.quotes (lead_id);
create index quotes_vendor_idx on public.quotes (vendor_id, status, created_at desc);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings. Plan §5 state machine:
--   initiated → advance_held → confirmed → completed → released
--   branches: refund_pending / refunded / disputed
-- Plan §9: "escrow state machine at ~90% [coverage] — money and trust paths are
-- non-negotiable". Transitions go through app.transition_booking() (001400) only.
-- ---------------------------------------------------------------------------

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,

  quote_id      uuid references public.quotes (id) on delete set null,
  lead_id       uuid references public.leads (id) on delete set null,
  event_id      uuid references public.events (id) on delete set null,
  customer_id   uuid not null references public.profiles (id) on delete restrict,
  vendor_id     uuid not null references public.vendors (id) on delete restrict,

  status        public.booking_status not null default 'initiated',

  event_date    date not null,
  event_type    public.event_type not null,
  venue_address text,

  total_amount     app.paise not null,
  advance_amount   app.paise not null default 0,
  balance_amount   app.paise not null default 0,
  -- Plan business model: commission on managed GMV. Stored per booking so a rate change
  -- never rewrites history.
  commission_rate_bps integer not null default 0 check (commission_rate_bps between 0 and 10000),
  commission_amount   app.paise not null default 0,

  advance_held_at  timestamptz,
  confirmed_at     timestamptz,
  completed_at     timestamptz,
  released_at      timestamptz,
  cancelled_at     timestamptz,
  cancellation_reason text,

  -- Plan §12: "Explicit state machine + timeouts". A booking stuck in advance_held past
  -- this deadline is swept by the reconciliation job.
  confirm_deadline timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint bookings_amounts_consistent
    check (advance_amount + balance_amount = total_amount),
  constraint bookings_released_requires_completion
    check (status <> 'released' or completed_at is not null)
);

comment on table public.bookings is
  'Plan §5 money spine. Client writes are impossible (RLS grants SELECT only); every '
  'transition runs through app.transition_booking() under service-role.';

create index bookings_customer_idx on public.bookings (customer_id, created_at desc);
create index bookings_vendor_idx   on public.bookings (vendor_id, status, event_date);
create index bookings_status_idx   on public.bookings (status);
create index bookings_deadline_idx on public.bookings (confirm_deadline)
  where status = 'advance_held';

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function app.set_updated_at();

-- Deferred FK from 000500: a blocked date can point at the booking that caused it.
alter table public.vendor_availability
  add constraint vendor_availability_booking_id_fkey
  foreign key (booking_id) references public.bookings (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Payments / payouts / refunds — the aggregator ledger mirror.
-- Plan §4: PCI scope stays external; we store references and status, never card data.
-- ---------------------------------------------------------------------------

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id) on delete restrict,

  kind          public.payment_kind not null default 'advance',
  status        public.payment_status not null default 'created',

  amount        app.paise not null,
  currency      text not null default 'INR' check (currency = 'INR'),

  aggregator            text not null check (aggregator in ('razorpay', 'cashfree')),
  aggregator_order_id   text,
  aggregator_payment_id text,
  aggregator_signature  text,
  method                text,

  -- Plan §4: webhooks carry signature verification; the raw payload is kept for
  -- reconciliation and dispute evidence.
  webhook_payload jsonb,

  authorized_at timestamptz,
  captured_at   timestamptz,
  failed_at     timestamptz,
  failure_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint payments_aggregator_payment_unique unique (aggregator, aggregator_payment_id)
);

create index payments_booking_idx on public.payments (booking_id, created_at desc);
create index payments_status_idx  on public.payments (status);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function app.set_updated_at();

create table public.payouts (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id) on delete restrict,
  vendor_id     uuid not null references public.vendors (id) on delete restrict,

  status        public.payout_status not null default 'pending',

  gross_amount     app.paise not null,
  commission_amount app.paise not null default 0,
  tax_deducted     app.paise not null default 0,
  net_amount       app.paise not null,

  aggregator            text check (aggregator in ('razorpay', 'cashfree')),
  aggregator_transfer_id text,
  utr                   text,

  -- Plan §8: finance is a "four-eyes" role — a payout needs a second approver.
  requested_by  uuid references public.profiles (id),
  approved_by   uuid references public.profiles (id),
  approved_at   timestamptz,
  paid_at       timestamptz,
  hold_reason   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint payouts_net_consistent
    check (net_amount = gross_amount - commission_amount - tax_deducted),
  -- Plan §8 four-eyes: the requester may not be the approver.
  constraint payouts_four_eyes
    check (approved_by is null or requested_by is null or approved_by <> requested_by)
);

comment on constraint payouts_four_eyes on public.payouts is
  'Plan §8: finance operates four-eyes. One human cannot both request and approve a payout.';

create index payouts_vendor_idx  on public.payouts (vendor_id, created_at desc);
create index payouts_status_idx  on public.payouts (status);
create index payouts_booking_idx on public.payouts (booking_id);

create trigger payouts_set_updated_at
  before update on public.payouts
  for each row execute function app.set_updated_at();

create table public.refunds (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id) on delete restrict,
  payment_id    uuid references public.payments (id) on delete set null,

  status        public.refund_status not null default 'requested',
  amount        app.paise not null,
  reason        text not null,

  requested_by  uuid references public.profiles (id),
  approved_by   uuid references public.profiles (id),
  approved_at   timestamptz,
  processed_at  timestamptz,

  aggregator_refund_id text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint refunds_four_eyes
    check (approved_by is null or requested_by is null or approved_by <> requested_by)
);

create index refunds_booking_idx on public.refunds (booking_id);
create index refunds_status_idx  on public.refunds (status);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function app.set_updated_at();

-- Plan §12: "Escrow edge cases — stuck refunds at someone's wedding". A dispute freezes
-- the booking; the runbook resolves it to exactly one of two terminal states.
create table public.disputes (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id) on delete restrict,
  raised_by     uuid not null references public.profiles (id),
  raised_by_side text not null check (raised_by_side in ('customer', 'vendor')),

  status        public.dispute_status not null default 'open',
  category      text not null,
  description   text not null,
  evidence      jsonb not null default '[]'::jsonb,

  assigned_to   uuid references public.profiles (id),
  resolution    text,
  resolved_by   uuid references public.profiles (id),
  resolved_at   timestamptz,

  -- Plan §10 KPI: disputes < 1%. SLA clock starts at creation.
  sla_due_at    timestamptz not null default (now() + interval '48 hours'),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index disputes_booking_idx on public.disputes (booking_id);
create index disputes_status_idx  on public.disputes (status, sla_due_at);

create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function app.set_updated_at();

alter table public.quotes   enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.payouts  enable row level security;
alter table public.refunds  enable row level security;
alter table public.disputes enable row level security;

