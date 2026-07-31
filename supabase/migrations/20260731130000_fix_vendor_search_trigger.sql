-- ============================================================================
-- Utsava — fix app.trg_refresh_vendor_search()
--
-- Every insert into public.vendors failed with:
--
--   record "new" has no field "vendor_id"
--   PL/pgSQL assignment "v_id := case tg_table_name when 'vendors'
--                                then new.id else new.vendor_id end"
--
-- WHY THE CASE DID NOT PROTECT IT. 20260727001400 read the key with a single CASE
-- expression, on the reasonable-looking assumption that only the matching branch is
-- evaluated. That is true of the *values* and false of the *field references*: PL/pgSQL
-- hands the whole expression to the SQL parser, which must resolve every column mentioned
-- in it against the actual composite type of NEW before anything runs. NEW is a
-- public.vendors row on that trigger, public.vendors has no vendor_id, and the statement
-- fails to plan — so the branch that would never have been taken is what kills the insert.
--
-- The same function is attached to vendor_categories and packages, which do have
-- vendor_id, so those two paths worked and the fault only ever appeared on vendors —
-- which is to say, on creating a listing at all.
--
-- THE FIX is to give each field reference its own statement. PL/pgSQL plans a statement on
-- its first execution, not at function definition, so a branch that never runs is never
-- planned and its column reference is never resolved. Nesting the tg_op test inside the
-- table test is what keeps every NEW/OLD reference inside a branch that only runs for the
-- table that has the column.
--
-- Behaviour is otherwise identical: same key, same call, same AFTER-trigger null return.
--
-- Found by running supabase/tests/00_default_deny.sql against the first live database, on
-- 2026-07-31. Regression test in supabase/tests/06_vendor_search_trigger.sql.
-- ============================================================================

create or replace function app.trg_refresh_vendor_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Branch on the table FIRST. new.vendor_id and new.id must never appear in the same
  -- statement, because whichever one this table lacks would fail to resolve.
  if tg_table_name = 'vendors' then
    -- NEW is unassigned on DELETE and OLD is unassigned on INSERT; touching the wrong one
    -- raises "record is not assigned yet", so tg_op is still tested before either is read.
    if tg_op = 'DELETE' then
      v_id := old.id;
    else
      v_id := new.id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_id := old.vendor_id;
    else
      v_id := new.vendor_id;
    end if;
  end if;

  if v_id is not null then
    perform app.build_vendor_search(v_id);
  end if;

  return null;  -- AFTER trigger
end;
$$;

comment on function app.trg_refresh_vendor_search() is
  'Rebuilds a vendor''s search row when its name, categories or packages change. Reads the '
  'vendor key in per-table branches: a single CASE over tg_table_name fails to plan on '
  'public.vendors, because PL/pgSQL resolves every column in an expression against NEW''s '
  'actual type regardless of which branch would be taken. See migration 20260731130000.';
