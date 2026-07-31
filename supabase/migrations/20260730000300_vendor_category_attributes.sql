-- ---------------------------------------------------------------------------
-- Category-specific details on a listing.
--
-- Everything on `vendors` is true of every listing: a name, an about, a price band, a team size.
-- None of it says how many people a lawn seats, what a caterer charges per plate, or whether a
-- makeup artist travels to the venue — and those are the questions a customer actually filters and
-- decides on.
--
-- WHY IT HANGS OFF vendor_categories AND NOT vendors. The grain is the vendor *in a category*. A
-- farmhouse that also does its own catering is one vendors row and two vendor_categories rows, and
-- it has a seated capacity in one and a per-plate rate in the other. Putting these on `vendors`
-- would force one set of answers onto both.
--
-- WHY JSONB AND NOT COLUMNS. Fourteen categories with a dozen fields each is ~170 columns, all but
-- a dozen of them null on any given row, and a migration every time a category gains a question.
-- The shape is defined in apps/web/lib/category-attributes.ts and validated at the write boundary;
-- Postgres holds it and indexes what discovery needs.
--
-- The trade is real and worth naming: the database will not stop `{"seated": "loads"}` from being
-- written by something that skips that validation. The CHECK below is the floor — an object, not a
-- scalar or an array — and everything above it is the application's job.
-- ---------------------------------------------------------------------------

alter table public.vendor_categories
  add column attributes jsonb not null default '{}'::jsonb;

comment on column public.vendor_categories.attributes is
  'Category-specific details. Shape defined and validated in apps/web/lib/category-attributes.ts.';

-- An object, never a scalar, an array or null. Cheap to enforce and it rules out the shapes that
-- would make every reader defensive.
alter table public.vendor_categories
  add constraint vendor_categories_attributes_object
  check (jsonb_typeof(attributes) = 'object');

/*
 * A GIN index so discovery can filter on these without a sequential scan.
 *
 * jsonb_path_ops rather than the default: it indexes only the containment operator (@>), which is
 * what a filter like "venues that seat 500" compiles to, and it builds a third the size. Existence
 * queries (?) are not supported by it — nothing needs them, and a filter that wants one should say
 * so and change the opclass deliberately.
 */
create index vendor_categories_attributes_idx
  on public.vendor_categories using gin (attributes jsonb_path_ops);
