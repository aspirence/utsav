# Utsava — working notes for Claude Code

All-events discovery and booking marketplace for India, photography-first.
`Utsava_Complete_Development_Plan_v2.pdf` at the repo root is the source of truth for
scope, sequencing and architecture. Code comments cite it as `plan §6`, `plan §S3` etc.

## Before changing anything

Read the relevant plan section first. The PDF has no text layer issues — extract it with:

```bash
python -c "from pypdf import PdfReader; print('\n'.join(p.extract_text() for p in PdfReader('Utsava_Complete_Development_Plan_v2.pdf').pages))"
```

## Non-negotiables

These are load-bearing product decisions, not preferences. Changing them needs an explicit
decision from the user, not a refactor.

1. **RLS is the authorization model.** Plan §6: "there is no trusted API between clients
   and Postgres for reads." Do not add a REST/tRPC layer to work around a policy. Fix the
   policy and add a pgTAP assertion.

2. **Money tables are service-role write-only.** `payments`, `payouts`, `refunds`,
   `bookings`, `subscriptions` have `SELECT` policies only. Never add an `INSERT` or
   `UPDATE` policy for `anon`/`authenticated`. Transitions go through
   `app.transition_booking()`.

3. **`app.vendor_rank()` must never reference `is_anchor_studio`.** Plan §11 promises the
   founder's studio gets no ranking preference and that this is "auditable in the ranking
   SQL". `supabase/tests/03_ranking_no_anchor_favour.sql` asserts it statically. Do not
   weaken that test.

4. **The 5-vendor cap is a database constraint**, not application logic. Enforced by
   `routed_seq` ∈ [1,5] plus `UNIQUE (enquiry_id, routed_seq)`.

5. **Contact masking lives in `public.vendor_leads`.** The `WHERE app.is_vendor_member(...)`
   clause in that view is a security boundary, not a filter. The view has definer semantics
   specifically so it can read `enquiries`; removing the guard exposes every customer's
   phone number to every vendor.

6. **Money is integer paise.** Never a float, never rupees in the database. Use
   `formatPaise` / `formatPriceBand` from `@utsava/db` for display.

## Conventions

- Server Components do all reads, RLS-scoped (plan §4). Client components only for
  Realtime, Storage uploads and form state.
- Each feature owns one zod-validated `actions.ts`.
- Schema changes are new migration files, never edits to applied ones. Add a pgTAP test
  in the same PR for anything touching leads, money or reviews.
- Media URLs go through `storageImageUrl()` (Supabase CDN transforms), never `next/image`
  — plan §12's mitigation for media cost at SEO scale.
- SQL helper functions are `SECURITY DEFINER` with `set search_path = ''` and fully
  qualified references.

## Gotchas already hit

- **`interface` vs `type` in `database.types.ts`.** postgrest-js requires table rows to
  satisfy `Record<string, unknown>`. TypeScript interfaces do *not* get implicit index
  signatures, so an `interface` row type silently collapses the entire schema to `never`.
  Always use `type`. This is why Supabase's generator emits type aliases.
- **`FORCE ROW LEVEL SECURITY` breaks the helper functions.** It applies RLS to
  `SECURITY DEFINER` functions too, causing infinite recursion when a policy calls a
  helper that reads the policy's own table. Use plain `ENABLE`.
- **`auth.uid()` stays populated inside `SECURITY DEFINER`.** The JWT lives in a GUC, not
  the role. Derived-metric writers (`app.refresh_vendor_stats` etc.) therefore call
  `app.set_trusted_write(true)` around their `UPDATE` so the column guards don't reject a
  vendor's own media upload.
- **`@supabase/ssr` must track `@supabase/supabase-js`.** Older ssr versions instantiate
  `SupabaseClient` with the pre-2.5x three-generic signature and resolve the schema to
  `never`. `UtsavaClient` is derived via `ReturnType<typeof createUtsavaServerClient>` so
  it can't drift.

## Verifying a change

```bash
pnpm typecheck && pnpm build     # both must pass
pnpm db:test                     # pgTAP, needs Docker
```

There is no Docker in the current environment, so the SQL is unexecuted. If you gain
Docker access, `pnpm db:reset` is the first thing to run — expect to fix a few things.
