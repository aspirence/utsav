# Attaching a Supabase project

Written for the first run against a hosted project, because there is no Docker in this
environment and `supabase start` needs it. The local path is at the bottom.

Everything here is idempotent — re-running is how you recover, not something to avoid.

## 1. Create the project

At [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

- **Region: South Asia (Mumbai) `ap-south-1`.** Every customer is in India and every read is
  RLS-scoped through Postgres, so the round trip to the database is on the critical path of
  each page render. A US region adds roughly 200 ms to that, per request.
- **Database password: generate it and save it.** It is shown once, it is what
  `supabase link` and `db push` authenticate with, and resetting it later invalidates the
  pooler connection strings.
- Free tier is enough to launch on. It pauses after a week of no traffic; a request wakes it.

## 2. Fill in `.env.local`

From **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon / publishable key>"
SUPABASE_SERVICE_ROLE_KEY="<service_role / secret key>"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

The service-role key bypasses RLS entirely. It belongs in `.env.local` and in the host's
server-side environment, never in anything prefixed `NEXT_PUBLIC_`.

**Setting `NEXT_PUBLIC_SUPABASE_URL` switches off the local admin login.** That is deliberate
— see `lib/admin-local-auth.ts`, where it is the one thing preventing that block
from being a production backdoor. Step 5 is what gets you back into the console, so do not
stop before it.

**Rebuild after changing these.** The build output itself depends on whether Supabase env
exists: with none, the discovery pages prerender static, because nothing reaches for
`cookies()`. Add the env and the Supabase server client does reach for it, and the already-
built static page fails at runtime with

```
Error: Page changed from static to dynamic at runtime /photographers, reason: cookies
```

`pnpm build` again and the same routes come out dynamic. This applies in both directions —
switching Supabase off needs a rebuild too.

**`hasSupabaseEnv()` only checks that the two values are present, never that they work.** A
mistyped anon key still flips the app onto the real database and still disables the local
login, and every read then fails at the API gateway with `Invalid API key`. Verify the key
before relying on it:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"    # 200 = good, 401 = bad key
```

## 3. Push the schema

```bash
npx supabase login                 # opens a browser
npx supabase link --project-ref <ref>
npx supabase db push               # applies all migrations in order
```

`db push` runs migrations only. It does not seed.

## 4. Seed the reference data

The Studio SQL editor, or `psql` against the connection string in **Project Settings →
Database**. In this order:

| File | What it is | Hosted? |
|---|---|---|
| `seed/00_geo.sql` | cities and localities | yes |
| `seed/01_catalog.sql` | the 14 categories | yes |
| `seed/02_plans.sql` | subscription plans | yes |
| `seed/03_demo.sql` | demo vendors, packages, reviews | **no** |

`03_demo.sql` creates `auth.users` rows whose password is `fremmo123`, and says so at the
top. On a project with a public URL those are real accounts anyone can sign into. Local only.

Two consequences of skipping it, both expected:

- Discovery pages have no listings until real ones are added through the console.
- `invitation_templates` has no rows, so Curated Collections renders empty. Nothing seeds
  that table yet — the designs have to be added in the admin panel.

## 5. Create the first super admin

```bash
pnpm db:bootstrap <email> <password>
```

Creates the auth user (email pre-confirmed), relies on the `on_auth_user_created` trigger for
the `profiles` row, and grants `super` in `public.staff_roles`. Re-running resets the password
and restores a revoked role, so it is also the way back in after a lockout.

Then delete `ADMIN_LOCAL_EMAIL` / `_PASSWORD` / `_SECRET` from `.env.local`. They are already
inert with Supabase attached, and a dead credential left in a file is one somebody will later
assume still works.

## 6. Regenerate the types

```bash
npx supabase gen types typescript --project-id <ref> --schema public \
  > lib/db/generated/database.types.ts
pnpm typecheck
```

That file is hand-maintained today. Generating it will overwrite the hand-written
`Relationships: []` entries with real foreign keys, which is a good thing — it is what
currently forces flat queries instead of postgrest embeds. Expect the diff to be large and
the typecheck to surface a few places worth fixing.

Keep the `type` aliases the generator emits. An `interface` row type has no implicit index
signature, fails postgrest-js's `Record<string, unknown>` constraint, and collapses the whole
schema to `never` — see the note in `CLAUDE.md`.

## 7. Run the policy tests

`supabase test db` needs a local database, so with no Docker, run the files in `tests/`
through the Studio SQL editor instead. They need pgTAP:

```sql
create extension if not exists pgtap with schema extensions;
```

`00_default_deny.sql` first — if that fails, nothing after it means anything.

---

## The local path, once Docker exists

```bash
pnpm db:start     # supabase start
pnpm db:reset     # migrations + all four seeds, including demo
pnpm db:test      # pgTAP
pnpm db:types     # generate from --local
```

`db reset` is destructive and runs `03_demo.sql`. That is correct locally and wrong anywhere
else.
