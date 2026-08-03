-- ============================================================================
-- Fremmo — 000100 · Extensions, schemas and shared trigger utilities
-- Plan §4: "Postgres-native search first (FTS + pg_trgm + PostGIS ranking function)"
-- ============================================================================

create schema if not exists extensions;
create schema if not exists app;

comment on schema app is
  'Trusted server-side helpers: authorization predicates, state-machine RPCs, triggers. '
  'Never exposed through PostgREST (not in config.toml api.schemas).';

create extension if not exists pgcrypto      with schema extensions;
create extension if not exists pg_trgm       with schema extensions;
create extension if not exists unaccent      with schema extensions;
create extension if not exists btree_gist    with schema extensions;
create extension if not exists postgis       with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;

-- Plan §6: "policies are tested code — a pgTAP suite asserts who sees what, in CI on
-- every migration." Without this the suite in supabase/tests/ cannot run at all.
-- Installed into public so the bare assertion names (plan, ok, throws_ok…) resolve.
create extension if not exists pgtap with schema public;

-- Plan §S7: "WhatsApp/SMS/FCM via outbox + pgmq". pgmq is not present on every local
-- image, and the notifications outbox table is the source of truth either way, so the
-- queue is best-effort: a missing extension must not break `supabase db reset`.
do $$
begin
  create extension if not exists pgmq;
exception
  when others then
    raise notice 'pgmq unavailable (%). Outbox drains via polling until it is enabled.', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at is
  'BEFORE UPDATE trigger. Attach to every table carrying updated_at.';

-- Immutability guard for append-only tables (audit_log, lead_activities).
create or replace function app.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table %.% is append-only; % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function app.forbid_mutation is
  'BEFORE UPDATE OR DELETE trigger for append-only tables. Plan §5: audit_log is append-only.';

-- ---------------------------------------------------------------------------
-- Money. Plan §5: "money in integer paise" — never float, never numeric-with-scale drift.
-- ---------------------------------------------------------------------------

create domain app.paise as bigint
  constraint paise_non_negative check (value >= 0);

comment on domain app.paise is
  'Indian currency as integer paise (1 INR = 100 paise). Plan §5 mandates integer money.';

-- Lock down the helper schema: only trusted roles may execute helpers directly.
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, anon, service_role;
