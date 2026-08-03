-- ============================================================================
-- Fremmo — 000900 · Monetisation
-- Plan §5: "plans, subscriptions, subscription_invoices (GST-ready)"
-- Plan §10: "180 paying vendors by Mar 2028; renewal ≥ 55–60%" — renewal is the
-- model's most sensitive assumption (§1), so the renewal signals live here.
-- ============================================================================

create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text,

  price_monthly app.paise not null,
  price_annual  app.paise not null,

  -- What the vendor is actually buying: lead volume.
  monthly_lead_credits integer,          -- null = unmetered
  max_categories       integer not null default 1,
  max_media            integer not null default 30,
  max_team_members     integer not null default 3,

  features      jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  sort_order    integer not null default 100,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint plans_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Subscriptions. Plan §5: trial → active → past_due → cancelled.
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  plan_id       uuid not null references public.plans (id) on delete restrict,

  status        public.subscription_status not null default 'trial',
  billing_cycle text not null default 'annual' check (billing_cycle in ('monthly', 'annual')),

  trial_ends_at         timestamptz,
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz not null,

  -- Plan §10 north-star input: renewal ≥ 55–60%. Recorded, not inferred.
  renewed_count integer not null default 0,
  cancelled_at  timestamptz,
  cancel_reason text,
  auto_renew    boolean not null default true,

  -- Lead credits consumed this period. Plan §12: junk leads get "credit refunds", so
  -- consumed can go down as well as up.
  credits_consumed integer not null default 0,

  aggregator_subscription_id text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint subscriptions_period_ordered check (current_period_end > current_period_start)
);

-- A vendor has at most one non-terminal subscription at a time.
create unique index subscriptions_one_active_idx
  on public.subscriptions (vendor_id)
  where status in ('trial', 'active', 'past_due');

create index subscriptions_status_idx on public.subscriptions (status, current_period_end);
create index subscriptions_renewal_idx on public.subscriptions (current_period_end)
  where status = 'active' and auto_renew;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Invoices. Plan §5 "GST-ready", plan §14 "subscription billing + GST" by Jul 2027.
-- ---------------------------------------------------------------------------

create table public.subscription_invoices (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete restrict,
  vendor_id       uuid not null references public.vendors (id) on delete restrict,

  invoice_number  text not null unique,
  status          public.invoice_status not null default 'draft',

  period_start    timestamptz not null,
  period_end      timestamptz not null,

  subtotal        app.paise not null,
  discount        app.paise not null default 0,

  -- Indian GST split. Intra-state → CGST + SGST; inter-state → IGST. Never both.
  cgst_amount     app.paise not null default 0,
  sgst_amount     app.paise not null default 0,
  igst_amount     app.paise not null default 0,
  tax_rate_bps    integer not null default 1800 check (tax_rate_bps between 0 and 10000),
  total           app.paise not null,

  place_of_supply text,
  vendor_gstin    text,
  seller_gstin    text,

  issued_at       timestamptz,
  due_at          timestamptz,
  paid_at         timestamptz,
  payment_reference text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint invoices_total_consistent
    check (total = subtotal - discount + cgst_amount + sgst_amount + igst_amount),
  -- GST law: an invoice is either intra-state (CGST+SGST) or inter-state (IGST).
  constraint invoices_gst_split_exclusive
    check ((igst_amount = 0) or (cgst_amount = 0 and sgst_amount = 0)),
  constraint invoices_period_ordered check (period_end > period_start)
);

create index subscription_invoices_vendor_idx on public.subscription_invoices (vendor_id, issued_at desc);
create index subscription_invoices_status_idx on public.subscription_invoices (status, due_at);

create trigger subscription_invoices_set_updated_at
  before update on public.subscription_invoices
  for each row execute function app.set_updated_at();

alter table public.plans                 enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.subscription_invoices enable row level security;

