-- ============================================================================
-- Fremmo — app.trg_refresh_vendor_search() fires on all three of its tables
--
-- The regression this pins: 20260727001400 read the vendor key with one CASE over
-- tg_table_name, which fails to plan on public.vendors because PL/pgSQL resolves
-- new.vendor_id against NEW's real type whether or not that branch is taken. Every
-- listing insert died with `record "new" has no field "vendor_id"`. Fixed in
-- 20260731130000.
--
-- The search index is two columns on public.vendors — search_document and search_vector —
-- not a table of its own. The assertions are about the trigger firing and the document
-- being populated, not about the tsvector's weights: app.build_vendor_search() owns those,
-- and a test restating them would fail on every legitimate tuning change.
-- ============================================================================

begin;
select plan(9);

create temporary table t_ids (k text primary key, v uuid);

insert into t_ids (k, v) select 'city', id from public.cities where slug = 'lucknow';
insert into t_ids (k, v) select 'category', id from public.categories where slug = 'photography';

-- ---------------------------------------------------------------------------
-- 1–3. The insert that used to fail outright.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.vendors (slug, display_name, status, city_id)
    values ('pgtap-search-probe', 'PgTAP Search Probe', 'draft',
            (select v from t_ids where k = 'city'))$$,
  'inserting a vendor fires vendors_refresh_search without error'
);

insert into t_ids (k, v) select 'vendor', id from public.vendors where slug = 'pgtap-search-probe';

select isnt(
  (select v from t_ids where k = 'vendor'), null,
  'the vendor row exists after the trigger ran'
);

select isnt(
  (select search_vector from public.vendors where slug = 'pgtap-search-probe'), null,
  'the trigger populated search_vector on insert'
);

-- ---------------------------------------------------------------------------
-- 4–5. The update path, which also reads NEW on a vendors row.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$update public.vendors set display_name = 'PgTAP Probe Renamed'
     where slug = 'pgtap-search-probe'$$,
  'updating a watched column fires the trigger without error'
);

select ok(
  (select search_document from public.vendors where slug = 'pgtap-search-probe')
    like '%Renamed%',
  'the rebuilt document reflects the new name'
);

-- ---------------------------------------------------------------------------
-- 6–7. vendor_categories — the branch that always worked, pinned so that folding
--      this back into a single CASE breaks here as well as on vendors.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.vendor_categories (vendor_id, category_id, is_primary)
    values ((select v from t_ids where k = 'vendor'),
            (select v from t_ids where k = 'category'), true)$$,
  'inserting a vendor_categories row fires the trigger without error'
);

select lives_ok(
  $$delete from public.vendor_categories
     where vendor_id = (select v from t_ids where k = 'vendor')$$,
  'deleting it reads OLD.vendor_id without error'
);

-- ---------------------------------------------------------------------------
-- 8. packages — the third table on the same function.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.packages (vendor_id, category_id, name, price, is_active)
    values ((select v from t_ids where k = 'vendor'),
            (select v from t_ids where k = 'category'), 'PgTAP Package', 5000000, true)$$,
  'inserting a package fires packages_refresh_search without error'
);

-- ---------------------------------------------------------------------------
-- 9. Delete on vendors, which reads OLD.id — the other half of the fixed branch.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$delete from public.vendors where slug = 'pgtap-search-probe'$$,
  'deleting the vendor cascades without the trigger erroring'
);

select * from finish();
rollback;
