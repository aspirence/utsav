-- ============================================================================
-- Fremmo — 000300 · Identity
-- Plan §3: "One human = one auth identity; capabilities come from memberships, not a
-- role column. A photographer booking a caterer for his own anniversary is one login
-- in two contexts. The UI is a context switcher; the database enforces everything."
-- ============================================================================

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text,
  phone           text unique,
  phone_verified  boolean not null default false,
  email           text,
  avatar_url      text,
  city_id         uuid,  -- FK added in 000400 once cities exists
  locale          text not null default 'en' check (locale in ('en', 'hi')),

  -- Plan §6: "DPDP consent at enquiry with purpose limitation". Consent is captured
  -- per-enquiry too; this is the account-level marketing preference.
  marketing_consent           boolean not null default false,
  marketing_consent_at        timestamptz,

  -- Plan §6: "deletion SLA honoured". Soft-delete first, hard purge by the batch job.
  deletion_requested_at       timestamptz,
  deleted_at                  timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint profiles_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')
);

comment on table public.profiles is
  'Plan §3: auth.users 1:1 profiles. Holds no role column by design — capabilities are derived '
  'from vendor_members / corporate_members / staff_roles.';
comment on column public.profiles.phone is 'E.164. The primary customer identity in India; OTP-verified at enquiry.';

create index profiles_phone_idx on public.profiles (phone) where deleted_at is null;
create index profiles_city_idx on public.profiles (city_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

-- Every auth.users row gets a profile. Runs as definer because the signup transaction
-- has no authenticated role yet.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, email, phone_verified)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone,
    new.email,
    new.phone_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Staff. Plan §3: "Field agent · moderator/support · finance (four-eyes) · super admin;
-- email + MFA" on a separate admin deploy behind SSO + IP allowlist.
-- ---------------------------------------------------------------------------

create table public.staff_roles (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        public.staff_role_kind not null,

  -- Plan §6: field agents are scoped "draft-only, own city". Empty array = all cities
  -- (moderators, finance, super).
  city_ids    uuid[] not null default '{}',

  granted_by  uuid references public.profiles (id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (profile_id, role)
);

comment on table public.staff_roles is
  'Plan §3: staff capabilities carried in JWT claims and re-derived here on every check.';
comment on column public.staff_roles.city_ids is
  'Plan §6: scopes a field_agent to their own city. Empty = unscoped.';

create index staff_roles_profile_idx on public.staff_roles (profile_id) where revoked_at is null;
create index staff_roles_role_idx on public.staff_roles (role) where revoked_at is null;

create trigger staff_roles_set_updated_at
  before update on public.staff_roles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log. Plan §3: "append-only audit log". Plan §12: manual escrow overrides are audited.
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles (id),
  actor_role    text,
  action        text not null,
  subject_type  text not null,
  subject_id    uuid,
  before_state  jsonb,
  after_state   jsonb,
  reason        text,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only. Plan §3/§12: every staff action and every manual money override lands here.';

create index audit_log_subject_idx on public.audit_log (subject_type, subject_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function app.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Default-deny. Plan §6: "default-deny on every table".
-- Policies are granted in 001300; until then nothing is reachable by anon/authenticated.
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.staff_roles   enable row level security;
alter table public.audit_log     enable row level security;

