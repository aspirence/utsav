-- The comment on public.vendor_categories.attributes was written when the app lived at
-- apps/web/, and it names that path. The repository was flattened to a single Next.js app
-- at the root on 2026-07-31, so the file is now lib/category-attributes.ts.
--
-- Migrations are append-only, so this restates the comment rather than editing
-- 20260730000300_vendor_category_attributes.sql. COMMENT ON is idempotent and touches only
-- pg_description, so re-running it costs nothing and no data moves.

comment on column public.vendor_categories.attributes is
  'Category-specific details. Shape defined and validated in lib/category-attributes.ts.';
