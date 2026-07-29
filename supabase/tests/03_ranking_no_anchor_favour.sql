-- ============================================================================
-- pgTAP — Plan §11: the founder's anchor studio runs "under disclosed, overflow-first
-- rules with no ranking favour (auditable in the ranking SQL)".
-- Plan §12 risk: "Channel-conflict backlash — vendors discover the platform runs a
-- studio". Mitigation: "same ranking SQL".
--
-- This file is that audit, mechanised. It fails if anyone ever adds an anchor-studio
-- term to app.vendor_rank(), whether deliberately or by copy-paste.
-- ============================================================================

begin;
select plan(6);

-- ---------------------------------------------------------------------------
-- Static audit: the ranking function's own source must not mention the flag.
-- ---------------------------------------------------------------------------

select ok(
  (select prosrc from pg_proc
    where proname = 'vendor_rank' and pronamespace = 'app'::regnamespace)
  not ilike '%anchor%',
  'app.vendor_rank() source contains no reference to anchor studios'
);

select ok(
  (select prosrc from pg_proc
    where proname = 'vendor_rank' and pronamespace = 'app'::regnamespace)
  not ilike '%is_anchor_studio%',
  'app.vendor_rank() does not read vendors.is_anchor_studio'
);

-- The ranking inputs are passed explicitly, so the function physically cannot reach
-- the vendors table. Confirm the signature has not grown a vendor_id parameter.
select ok(
  (select count(*) from pg_proc
    where proname = 'vendor_rank' and pronamespace = 'app'::regnamespace
      and 'uuid'::regtype = any (proargtypes)) = 0,
  'app.vendor_rank() takes no vendor identifier — it cannot look anything up'
);

-- ---------------------------------------------------------------------------
-- Behavioural check: identical inputs must produce identical scores regardless of
-- which vendor they came from.
-- ---------------------------------------------------------------------------

select is(
  app.vendor_rank(0.5::real, 0.3::real, 80::smallint, 4.6, 40, 90::smallint, 45, 1200.0),
  app.vendor_rank(0.5::real, 0.3::real, 80::smallint, 4.6, 40, 90::smallint, 45, 1200.0),
  'the ranking function is deterministic on identical inputs'
);

-- Plan §10 KPI: median vendor response under two hours should be worth ranking for.
select ok(
  app.vendor_rank(0, 0, 80::smallint, 4.5, 50, 95::smallint, 30, null)
  > app.vendor_rank(0, 0, 80::smallint, 4.5, 50, 95::smallint, 900, null),
  'a faster-responding vendor outranks an identical slow one'
);

-- Bayesian rating: one 5-star review must not beat a long, strong track record.
select ok(
  app.vendor_rank(0, 0, 80::smallint, 4.8, 200, 90::smallint, 60, null)
  > app.vendor_rank(0, 0, 80::smallint, 5.0, 1, 90::smallint, 60, null),
  '4.8 over 200 reviews outranks 5.0 over a single review'
);

select * from finish();
rollback;
