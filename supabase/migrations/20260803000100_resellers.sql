-- ============================================================================
-- Fremmo — resellers, their customers, and the commission ledger
--
-- A reseller brings customers to the invitation storefront and earns a share of what those
-- customers spend. Plan §2 counts invitation orders as a revenue line; this is the first
-- mechanism that pays somebody outside the company out of it, so it is built like the rest of
-- the money spine rather than like a CRM field.
--
-- ── WHY A RESELLER IS NOT A staff_role_kind ──────────────────────────────────
-- The obvious implementation is a fifth value in public.staff_role_kind, and it is a hole.
-- app.is_staff() with no arguments returns true for *any* non-revoked staff row — that is its
-- documented contract ("No arguments = any staff") and roughly a dozen policies rely on it,
-- including invitation_payments_select_staff, which exposes raw Cashfree webhook payloads.
-- Adding 'reseller' to that enum would grant every reseller read access to all of it in one
-- statement, silently, with no policy edited. A reseller is an external commercial partner, not
-- a member of staff, so they get their own table, their own helpers and their own policies.
--
-- ── WHAT ATTRIBUTION MEANS HERE ──────────────────────────────────────────────
-- A reseller owns *accounts*, not clicks. public.reseller_customers assigns a profile to a
-- reseller and every invitation order that profile places pays them. There is no referral
-- cookie, no last-touch window and no attribution argument to have: the link is a row a super
-- admin wrote, and it is resolved server-side by a trigger rather than by anything a browser
-- sends.
--
-- Guest orders (invitation_orders.customer_id is null — the storefront allows them, see
-- app/(site)/invitations/[slug]/book/actions.ts) have no account to own and are therefore
-- unattributed at insert. They pick up their reseller if and when the buyer signs in and claims
-- the order, which is handled below. An order that is never claimed never pays commission, and
-- that is the correct outcome rather than a gap: nobody can demonstrate whose customer it was.
--
-- ── THE RATE IS FROZEN ONTO THE ORDER ────────────────────────────────────────
-- Same reasoning as invitation_orders.template_price, which is denormalised for exactly this
-- purpose. A reseller's rate changes; what they earned on an order placed last March does not.
-- The rate in force is copied onto the order at insert and onto the ledger row at accrual, so a
-- later edit to resellers.commission_bps cannot rewrite history.
--
-- Basis points, not a percentage, matching bookings.commission_rate_bps. 250 = 2.5%. A float
-- percentage of integer paise reintroduces exactly the rounding the paise domain exists to
-- prevent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.reseller_status as enum ('active', 'suspended', 'closed');

comment on type public.reseller_status is
  'suspended stops new attribution but keeps existing commission payable; closed is terminal.';

/*
 * The life of one commission.
 *
 * pending  — the customer paid the booking leg, the order is `booked`. Earned but not yet
 *            settleable, because the order can still be refunded or cancelled from here.
 * payable  — the order reached `delivered`. The money is ours to share.
 * paid     — settled with the reseller out of band. Recorded, never inferred.
 * reversed — the order was refunded or cancelled. Kept as a row rather than deleted, because a
 *            commission that existed and then did not is precisely what a reseller disputing a
 *            statement needs to see.
 */
create type public.reseller_commission_status as enum ('pending', 'payable', 'paid', 'reversed');

-- ---------------------------------------------------------------------------
-- The reseller
-- ---------------------------------------------------------------------------

create table public.resellers (
  id            uuid primary key default gen_random_uuid(),

  /*
   * One reseller per login. `on delete restrict` rather than cascade: a reseller with a
   * commission history is a party to money that has moved, and deleting the profile must fail
   * loudly rather than quietly take the ledger's owner with it.
   */
  profile_id    uuid not null unique references public.profiles (id) on delete restrict,

  display_name  text not null,

  -- Human-quotable on a statement or an invoice, the same job invitation_orders.reference does.
  code          text not null unique,

  -- The share of a sale this reseller earns, in basis points. 10000 = 100%.
  commission_bps integer not null default 0
    check (commission_bps between 0 and 10000),

  status        public.reseller_status not null default 'active',

  contact_email text,
  contact_phone text,
  notes         text,

  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint resellers_code_format check (code ~ '^UTS-RS-[A-Z0-9]{3,10}$'),
  constraint resellers_display_name_present check (btrim(display_name) <> ''),
  constraint resellers_email_shape
    check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint resellers_phone_format
    check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$')
);

comment on table public.resellers is
  'External commercial partners who earn a share of invitation revenue. Deliberately not a '
  'staff_role_kind — see the header of this migration. Service-role write only.';
comment on column public.resellers.commission_bps is
  'Basis points, not percent. 250 = 2.5%. Frozen onto each order at insert.';

create index resellers_status_idx on public.resellers (status, created_at desc);

create trigger resellers_set_updated_at
  before update on public.resellers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Who belongs to whom
-- ---------------------------------------------------------------------------

create table public.reseller_customers (
  id            uuid primary key default gen_random_uuid(),

  reseller_id   uuid not null references public.resellers (id) on delete cascade,
  customer_id   uuid not null references public.profiles (id) on delete cascade,

  assigned_by   uuid references public.profiles (id),
  assigned_at   timestamptz not null default now(),

  -- Ending an assignment is a release, not a delete. Orders already attributed keep their
  -- reseller_id; only future ones stop being attributed.
  released_at   timestamptz,
  release_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.reseller_customers is
  'Account ownership. A live row means every future invitation order by that customer is '
  'attributed to that reseller. Releasing does not retract commission already earned.';

/*
 * One live owner per customer.
 *
 * A partial unique index rather than a plain unique constraint, because the history matters:
 * a customer can be released from reseller A and assigned to reseller B, which is two rows for
 * the same customer_id and must remain possible. What must not be possible is two *live* rows,
 * which would make app.reseller_for_customer() non-deterministic and let one sale pay twice.
 */
create unique index reseller_customers_one_live_owner
  on public.reseller_customers (customer_id)
  where released_at is null;

create index reseller_customers_reseller_idx
  on public.reseller_customers (reseller_id, assigned_at desc);

create trigger reseller_customers_set_updated_at
  before update on public.reseller_customers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER with an empty search_path, per CLAUDE.md.
-- ---------------------------------------------------------------------------

/*
 * The caller's reseller, or null.
 *
 * `status = 'active'` is in here rather than at the call sites so that suspending a reseller
 * closes their dashboard everywhere at once. A suspended reseller keeps their ledger — the
 * policies below read the ledger by reseller_id, which this returns null for, so suspension is
 * genuinely a lockout and not merely a hidden nav link.
 */
create or replace function app.my_reseller_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.resellers r
  where r.profile_id = auth.uid()
    and r.status = 'active'
  limit 1;
$$;

comment on function app.my_reseller_id is
  'The active reseller owned by the current session, or null. Null for staff and customers.';

create or replace function app.is_reseller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.my_reseller_id() is not null;
$$;

/*
 * Which reseller owns this customer right now.
 *
 * Used by the attribution trigger, never by a policy. A suspended reseller is skipped: they
 * stop accruing new commission the moment they are suspended, which is what suspension is for.
 */
create or replace function app.reseller_for_customer(p_customer_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rc.reseller_id
  from public.reseller_customers rc
  join public.resellers r on r.id = rc.reseller_id
  where rc.customer_id = p_customer_id
    and rc.released_at is null
    and r.status = 'active'
  limit 1;
$$;

grant execute on function app.my_reseller_id()                to authenticated;
grant execute on function app.is_reseller()                   to authenticated;
grant execute on function app.reseller_for_customer(uuid)     to service_role;

-- ---------------------------------------------------------------------------
-- Stamping the order
-- ---------------------------------------------------------------------------

alter table public.invitation_orders
  add column reseller_id uuid references public.resellers (id) on delete set null,
  add column reseller_commission_bps integer
    check (reseller_commission_bps is null
           or reseller_commission_bps between 0 and 10000);

comment on column public.invitation_orders.reseller_id is
  'Resolved server-side from the customer''s live assignment at insert. Null for guest orders '
  'and for customers no reseller owns.';
comment on column public.invitation_orders.reseller_commission_bps is
  'The rate in force when this order was placed. Frozen — a later rate change cannot rewrite it.';

create index invitation_orders_reseller_idx
  on public.invitation_orders (reseller_id, created_at desc)
  where reseller_id is not null;

/*
 * Attribution, resolved in the database rather than in the action.
 *
 * The booking action is not the only thing that can insert an order — a support tool, a
 * backfill or a future admin "place an order for a customer" screen all would — and an
 * attribution rule that lives in one TypeScript call site is a rule the second call site
 * forgets. This runs on every insert regardless of who is writing.
 *
 * It reads reseller_id from the assignment table and ignores anything the caller supplied, so
 * a compromised or careless writer cannot direct commission at a reseller of its choosing.
 */
create or replace function app.attribute_invitation_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reseller uuid;
begin
  if new.customer_id is null then
    new.reseller_id := null;
    new.reseller_commission_bps := null;
    return new;
  end if;

  v_reseller := app.reseller_for_customer(new.customer_id);

  if v_reseller is null then
    new.reseller_id := null;
    new.reseller_commission_bps := null;
  else
    new.reseller_id := v_reseller;
    select r.commission_bps into new.reseller_commission_bps
    from public.resellers r where r.id = v_reseller;
  end if;

  return new;
end;
$$;

create trigger invitation_orders_attribute
  before insert on public.invitation_orders
  for each row execute function app.attribute_invitation_order();

/*
 * The guest claim.
 *
 * A logged-out buyer's order starts with customer_id null and is claimed when they sign in;
 * app.guard_invitation_order_columns() permits exactly that one transition. If the account
 * doing the claiming belongs to a reseller, this is the moment the order becomes attributable.
 *
 * `and new.paid_at is null` is the honesty constraint. Claiming an order that has *already*
 * been paid for and attaching a commission to it after the fact would let anyone with a
 * reference number hand their reseller a retroactive cut of a completed sale. Attribution has
 * to be settled before the money lands, or not at all.
 */
create or replace function app.attribute_claimed_invitation_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reseller uuid;
begin
  if old.customer_id is not null or new.customer_id is null then return new; end if;
  if new.reseller_id is not null or new.paid_at is not null then return new; end if;

  v_reseller := app.reseller_for_customer(new.customer_id);
  if v_reseller is null then return new; end if;

  new.reseller_id := v_reseller;
  select r.commission_bps into new.reseller_commission_bps
  from public.resellers r where r.id = v_reseller;

  return new;
end;
$$;

create trigger invitation_orders_attribute_on_claim
  before update on public.invitation_orders
  for each row execute function app.attribute_claimed_invitation_order();

/*
 * Extend the column guard to cover the two new columns.
 *
 * Without this a moderator with an UPDATE path could re-point a paid order at a different
 * reseller, or raise its frozen rate, and move money. The body is 20260730000200's verbatim,
 * plus the reseller clause — replaced whole because that is how `create or replace function`
 * works, not because anything else changed.
 *
 * null → value is allowed, because that is the claim trigger above writing its result inside
 * the same statement. value → different value never is.
 */
create or replace function app.guard_invitation_order_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_trusted_write() or auth.uid() is null then
    return new;
  end if;

  if new.template_price is distinct from old.template_price
     or new.booking_amount is distinct from old.booking_amount
     or new.balance_amount is distinct from old.balance_amount
     or new.template_slug is distinct from old.template_slug
     or new.template_name is distinct from old.template_name
     or new.reference is distinct from old.reference
     or new.paid_at is distinct from old.paid_at
     or new.payment_ref is distinct from old.payment_ref
  then
    raise exception
      'Order amounts, reference and payment stamps are set when the order is placed and by the '
      'payment webhook. They cannot be edited from the console.'
      using errcode = 'check_violation';
  end if;

  if old.customer_id is not null and new.customer_id is distinct from old.customer_id then
    raise exception 'An order already belongs to an account and cannot be reassigned.'
      using errcode = 'check_violation';
  end if;

  if (old.reseller_id is not null and new.reseller_id is distinct from old.reseller_id)
     or (old.reseller_commission_bps is not null
         and new.reseller_commission_bps is distinct from old.reseller_commission_bps)
  then
    raise exception
      'An order''s reseller and commission rate are settled when it is placed and cannot be '
      'changed afterwards.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------

create table public.reseller_commissions (
  id            uuid primary key default gen_random_uuid(),

  reseller_id   uuid not null references public.resellers (id) on delete restrict,
  -- One order, one commission. The unique constraint below is the idempotency key: the accrual
  -- trigger can fire more than once over an order's life and must never double-pay.
  order_id      uuid not null references public.invitation_orders (id) on delete restrict,

  -- Frozen at accrual, both of them. rate_bps is copied from the order (which froze it at
  -- insert); base_amount is what the rate was applied to.
  rate_bps      integer not null check (rate_bps between 0 and 10000),

  /*
   * What the percentage was taken of.
   *
   * Today this is invitation_orders.template_price, because an invitation template is Fremmo's
   * own product: there is no vendor split and no cost of goods on it, so the platform's net
   * take and the gross sale price are the same number. That is a fact about the current
   * catalogue, not a law, which is why the base is stored per row instead of being recomputed
   * from the order. If a licence fee or an artist royalty is ever introduced, the new base
   * applies to new rows and every historic statement still reconciles.
   */
  base_amount   app.paise not null,
  amount        app.paise not null,

  status        public.reseller_commission_status not null default 'pending',

  earned_at     timestamptz not null default now(),
  payable_at    timestamptz,
  paid_at       timestamptz,
  reversed_at   timestamptz,
  reversal_reason text,

  -- Free-text settlement handle: a bank reference, a UTR, an invoice number.
  settlement_ref text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint reseller_commissions_one_per_order unique (order_id),
  constraint reseller_commissions_paid_has_time
    check (status <> 'paid' or paid_at is not null),
  constraint reseller_commissions_reversed_has_time
    check (status <> 'reversed' or reversed_at is not null)
);

comment on table public.reseller_commissions is
  'Plan §5 money table. SELECT policies only — no client INSERT or UPDATE exists and none may '
  'be added. Every row is written by app.accrue_reseller_commission() under service-role.';

create index reseller_commissions_reseller_idx
  on public.reseller_commissions (reseller_id, status, earned_at desc);
create index reseller_commissions_status_idx
  on public.reseller_commissions (status, earned_at desc);

create trigger reseller_commissions_set_updated_at
  before update on public.reseller_commissions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Accrual and lifecycle
-- ---------------------------------------------------------------------------

/*
 * One trigger on invitation_orders drives the whole ledger.
 *
 * WHY A TRIGGER AND NOT A CALL INSIDE app.record_invitation_payment(). That RPC is today's only
 * way an order becomes paid, but it is not structurally the only one — a reconciliation script
 * or a manual fix applied under the service-role key bypasses it entirely, and those are
 * precisely the paths where a missing commission would go unnoticed for months. The trigger
 * fires on the state change itself, so every writer is covered by construction.
 *
 * ACCRUAL IS DRIVEN BY paid_at, NOT BY status. The status column can be moved by a console
 * action; paid_at is refused to every non-trusted caller by the column guard above. Hanging
 * real money off the column that cannot be forged is the cheaper of the two mistakes to avoid.
 *
 * The integer division is deliberate and floors. Fremmo keeps the sub-paise remainder, which is
 * at most one paise per order and is the only rounding direction that cannot pay out money the
 * platform did not collect.
 */
create or replace function app.accrue_reseller_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount bigint;
begin
  -- 1. The money landed. Accrue, once.
  if old.paid_at is null and new.paid_at is not null
     and new.reseller_id is not null
     and coalesce(new.reseller_commission_bps, 0) > 0
  then
    v_amount := (new.template_price::bigint * new.reseller_commission_bps) / 10000;

    insert into public.reseller_commissions
      (reseller_id, order_id, rate_bps, base_amount, amount, status, earned_at)
    values
      (new.reseller_id, new.id, new.reseller_commission_bps,
       new.template_price, v_amount, 'pending', new.paid_at)
    on conflict (order_id) do nothing;
  end if;

  -- 2. Delivered. What was provisional becomes settleable.
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    update public.reseller_commissions
       set status = 'payable', payable_at = now()
     where order_id = new.id and status = 'pending';
  end if;

  /*
   * 3. The money went back. So does the commission.
   *
   * 'paid' is excluded on purpose. Once a reseller has actually been settled, a later refund is
   * a debt to be recovered out of band, not a row to be quietly rewritten — flipping a paid
   * commission to reversed would make the ledger disagree with a bank transfer that really
   * happened. Finance sees the refunded order beside the paid commission and handles it.
   */
  if new.status in ('refunded', 'cancelled') and old.status is distinct from new.status then
    update public.reseller_commissions
       set status = 'reversed',
           reversed_at = now(),
           reversal_reason = 'Order ' || new.status
     where order_id = new.id and status in ('pending', 'payable');
  end if;

  return null;
end;
$$;

create trigger invitation_orders_accrue_commission
  after update on public.invitation_orders
  for each row execute function app.accrue_reseller_commission();

comment on function app.accrue_reseller_commission is
  'Writes and moves reseller_commissions in step with an order. Accrues on paid_at, which the '
  'column guard refuses to every non-trusted caller.';

-- ---------------------------------------------------------------------------
-- RLS
--
-- Every table here is read-only to clients. Resellers and their rates are written by the admin
-- console under the service-role key after requireSuper(), exactly as staff_roles are — see
-- lib/admin-users.ts. The ledger is written only by the trigger above.
-- ---------------------------------------------------------------------------

alter table public.resellers            enable row level security;
alter table public.reseller_customers   enable row level security;
alter table public.reseller_commissions enable row level security;

create policy resellers_select_staff on public.resellers
  for select using (app.is_staff());

/*
 * THERE IS DELIBERATELY NO `resellers_select_self` POLICY.
 *
 * The obvious one — `for select using (profile_id = auth.uid())` — was here and was wrong. RLS
 * has no column granularity: a policy admits the whole row or none of it, so that clause handed
 * every reseller their own `notes` column, which the console labels "Notes (internal)" and staff
 * fill with things like who introduced them and whether they settle on time.
 *
 * The application selecting five safe columns is not a defence. PostgREST takes the column list
 * from the request, so anyone holding the reseller's own session can ask for
 * `/rest/v1/resellers?select=notes` and read it. What a screen happens to render has never been
 * the boundary here; the policy is.
 *
 * A column-level `revoke select (notes)` does not work either, and the reason is worth writing
 * down before somebody tries it: staff are `authenticated` too, so revoking the column from that
 * role blinds the console that exists to write it.
 *
 * So resellers read public.my_reseller below, which is the same construction as
 * public.vendor_leads — a definer view whose WHERE clause is the boundary.
 */

create policy reseller_customers_select_staff on public.reseller_customers
  for select using (app.is_staff());

create policy reseller_customers_select_own on public.reseller_customers
  for select using (reseller_id = app.my_reseller_id());

create policy reseller_commissions_select_staff on public.reseller_commissions
  for select using (app.is_staff());

create policy reseller_commissions_select_own on public.reseller_commissions
  for select using (reseller_id = app.my_reseller_id());

-- No INSERT, UPDATE or DELETE policy on any of the three. See CLAUDE.md non-negotiable 2.

-- ---------------------------------------------------------------------------
-- What a reseller sees of an order
--
-- NOT a SELECT policy on invitation_orders. That table carries contact_name, contact_email and
-- contact_phone in the clear — staff read them because staff have to deliver the order, which
-- is the exemption written into that migration. A reseller has no such job. Giving them a
-- policy on the base table would hand every reseller the phone number of every customer they
-- introduced, which is the same mistake public.vendor_leads exists to prevent (CLAUDE.md
-- non-negotiable 5).
--
-- So: a masked view with definer semantics, and the WHERE clause is the security boundary.
-- security_barrier stops the planner pushing a user-supplied function down past the guard.
-- ---------------------------------------------------------------------------

create view public.reseller_orders
with (security_invoker = false, security_barrier = true)
as
select
  o.id                as order_id,
  o.reference,
  o.template_slug,
  o.template_name,
  o.template_price,
  o.status,
  o.created_at,
  o.paid_at,

  o.reseller_id,

  /*
   * The customer, named and nothing more.
   *
   * A first name alone is enough for a reseller to recognise their own introduction on a
   * statement and to raise a query about it. An email address or a phone number would let them
   * take the relationship off-platform, which is the disintermediation risk plan §11 is about.
   */
  split_part(btrim(o.contact_name), ' ', 1) as customer_first_name,

  c.rate_bps          as commission_rate_bps,
  c.amount            as commission_amount,
  c.status            as commission_status,
  c.earned_at         as commission_earned_at,
  c.paid_at           as commission_paid_at
from public.invitation_orders o
left join public.reseller_commissions c on c.order_id = o.id
where o.reseller_id is not null
  and o.reseller_id = app.my_reseller_id();

comment on view public.reseller_orders is
  'A reseller''s own attributed orders, customer contact details masked. The my_reseller_id() '
  'clause is a security boundary, not a filter — removing it exposes every order to every '
  'reseller. Definer semantics are required so it can read invitation_orders.';

grant select on public.reseller_orders to authenticated;

-- ---------------------------------------------------------------------------
-- The reseller's own record, minus anything staff wrote about them
-- ---------------------------------------------------------------------------

/*
 * What a reseller may know about themselves: their name, their code, their rate, their standing.
 *
 * `profile_id = auth.uid()` and NOT app.my_reseller_id(), and the difference is the whole reason
 * this keys on the profile. my_reseller_id() filters on `status = 'active'`, so a suspended
 * reseller would match nothing and their dashboard would render as though they had never
 * existed. Suspension has to be legible to the person it happened to — a screen that silently
 * shows zeros instead of "your account is suspended" turns a business decision into a bug
 * report.
 *
 * `notes` and `created_by` are absent on purpose. Those are the staff record *about* this
 * partner, not the partner's own data, and this view is the reason the base table now carries no
 * self-select policy at all.
 */
create view public.my_reseller
with (security_invoker = false, security_barrier = true)
as
select
  r.id,
  r.display_name,
  r.code,
  r.commission_bps,
  r.status,
  r.contact_email,
  r.contact_phone,
  r.created_at
from public.resellers r
where r.profile_id = (select auth.uid());

comment on view public.my_reseller is
  'A reseller''s own record, with the staff-internal notes and created_by columns withheld. The '
  'profile_id clause is a security boundary, not a filter. Keyed on profile_id rather than '
  'app.my_reseller_id() so a suspended reseller can still see that they are suspended.';

grant select on public.my_reseller to authenticated;
