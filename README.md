# Utsava

All-events discovery and booking marketplace for India — weddings, social celebrations
and corporate events, with **photography as the wedge category**.

This repository implements the architecture in `Utsava_Complete_Development_Plan_v2.pdf`.
Section references throughout the code (`plan §6`, `plan §S3`) point back to that document,
which remains the single source of truth for scope and sequencing.

> "Utsava" is a working title. Dates, estimates, prices and tool choices in the plan are
> planning assumptions to re-validate at build time.

---

## Quick start

```bash
pnpm install
pnpm dev              # http://localhost:3000
```

The web app runs **with no database and no Docker**. Every read falls back to
`apps/web/lib/fixtures.ts`, a fixture set mirroring `supabase/seed/03_demo.sql`, so you
get a working site immediately. Set `NEXT_PUBLIC_SUPABASE_URL` and the fallback stops
being used.

### With a real database

Requires **Docker Desktop** (not currently installed on this machine).

```bash
cp .env.example .env.local
pnpm db:start          # supabase start — boots Postgres, Auth, Storage, Studio
pnpm db:reset          # applies all migrations, then seeds
pnpm db:types          # regenerates packages/db/src/generated/database.types.ts
pnpm db:test           # runs the pgTAP RLS suite
pnpm dev
```

`pnpm db:start` prints the local anon and service-role keys — paste them into `.env.local`.

---

## Repository shape

Follows plan §4.1 exactly.

```
utsava/
├─ apps/web                    # ONE Next.js app: customer site + partner PWA + admin
│    middleware.ts             #   /admin IP allowlist + hardening headers
│    app/layout.tsx            #   document shell only — no chrome
│    app/(site)/               #   customer surface (route group — adds nothing to URLs)
│      layout.tsx              #     site header + footer
│      (marketing)/            #     home
│      (discover)/[city]/[category]/[locality]
│      vendor/[slug]           #     portfolio-first profile
│      stories/                #     real-wedding galleries
│      enquire/                #     OTP-gated enquiry flow
│      partner/dashboard/      #     partner PWA: leads · calendar · profile · quotes
│      p/[slug]                #     legal + the anchor-studio disclosure policy
│    app/admin/                #   staff console at /admin — its own dark chrome
│      page.tsx                #     launch-readiness gates (§13)
│      moderation/             #     queue + decision screen, SLA-ordered
│      vendors/                #     listing management + status transitions
│      pipeline/               #     field-team onboarding board (§S3)
│      leads/                  #     routing health + credit refunds
│    app/api/workers/          #   notification outbox drain
├─ apps/vendor-app             # Expo React Native, Android-first (not yet built)
├─ packages/db                 # Supabase clients, types, zod schemas, money helpers
├─ packages/ui                 # design system (Tailwind v4 + tokens)
└─ supabase/
     migrations/               # 16 PR-reviewed SQL migrations
     seed/                     # geo · catalog · plans · demo
     tests/                    # pgTAP RLS suite
```

`pnpm dev` serves everything on **:3000** — the customer site at `/`, the staff console at
`/admin`. To reach it from another device on the same network, bind to all interfaces:

```bash
pnpm --filter @utsava/web dev -- --hostname 0.0.0.0
```

### Two deviations from the plan, both deliberate

**1. The admin console is a path, not a separate deploy.** Plan §3 specifies "a separate
deploy, SSO + IP allowlist". It now lives at `/admin` on the same origin by explicit
product decision. The network-level isolation that implied is replaced by
`apps/web/middleware.ts`, which enforces `ADMIN_IP_ALLOWLIST` on `/admin/*` (returning
404, not 403 — a 403 confirms the console exists) and sets `noindex`, `no-store`,
`X-Frame-Options: DENY`. Set `ADMIN_IP_ALLOWLIST` in production; it is skipped when empty
so local and preview work. **The real authorization boundary is unchanged**: it is
`public.staff_roles` plus RLS, not this file.

**2. Discovery pages render per request.** `/[city]/[category]` reads `searchParams` for
the filter bar, and a page that reads `searchParams` is dynamic in Next 15 — that is the
framework's rule, and URL-driven server-side filtering is what plan §4 asks for. Plan §12
flags the cost of that at SEO scale, so the mitigation is plan §4's own: the query is
wrapped in `unstable_cache` and tagged `discover:{city}:{category}`, so repeat traffic
never reaches Postgres and a listing edit still refreshes immediately via
`revalidateTag`. Measured: 442 ms cold → 229 ms warm. Everything else — home, city hubs,
vendor profiles, stories, legal pages — is statically generated.

---

## What is built

### Database — the full migration pack

15 migrations covering ~45 tables across the nine domains in plan §5, plus RLS, search
and the state-machine RPCs.

| Migration | Contents |
|---|---|
| `000100` | extensions (postgis, pg_trgm, pgmq), `app` schema, `app.paise` domain |
| `000200` | the four status enums that drive the product (§5) |
| `000300` | identity — profiles, staff_roles, append-only audit_log |
| `000400` | geo — cities, localities (locality = the SEO unit) |
| `000500` | catalog — vendors, packages, media, style tags, availability, `vendor_private` |
| `000600` | demand spine — events → enquiries → leads (5-vendor cap) → activities |
| `000700` | money — quotes, bookings, payments, payouts, refunds, disputes |
| `000800` | trust — booking-gated reviews, moderation queue, real-wedding stories |
| `000900` | monetisation — plans, subscriptions, GST-ready invoices |
| `001000` | ops — checklists, notifications outbox, e-invites, onboarding pipeline, analytics |
| `001100` | corporate Phase 2 — orgs, RFPs, bids (shipped dark) |
| `001200` | authorization helpers — the predicates every policy is built from |
| `001300` | **RLS policies** — plan §6's matrix, table by table |
| `001400` | search & ranking — FTS + trigram + PostGIS, one ranking function |
| `001500` | contact-masking view + state-machine RPCs |

Three design decisions worth knowing about, because they depart from a literal reading
of the plan's table list:

1. **`vendor_private` exists.** Plan §6 grants the public `SELECT` on `vendors` where
   status is live. RLS is row-level, not column-level, so any column left on that table
   is world-readable the moment a listing goes live. Vendor phone/email and PAN/GSTIN
   therefore live in a separate owner-and-staff-only table, and `public.vendors` is safe
   by construction rather than by remembering to exclude columns in every query.

2. **The 5-vendor cap is declarative.** `leads.routed_seq` is constrained to 1–5 with a
   `UNIQUE (enquiry_id, routed_seq)` index. A counting trigger would race under
   concurrent routing; here two transactions competing for slot 5 simply collide and one
   rolls back. A sixth lead is impossible even by direct INSERT.

3. **`FORCE ROW LEVEL SECURITY` is deliberately not used.** It would apply RLS to the
   `SECURITY DEFINER` helper functions too, so a `vendor_members` policy calling a helper
   that reads `vendor_members` would recurse infinitely. Plain `ENABLE` gives the
   default-deny plan §6 requires for every client role.

### The rules the schema actually enforces

These are not conventions — they are constraints, and `supabase/tests/` asserts them:

- An enquiry cannot reach `verified` without a `phone_verified_at` timestamp (CHECK).
- An unverified enquiry cannot be routed (`app.route_enquiry` raises).
- A vendor sees a customer's phone only in permitted lead states, via
  `public.vendor_leads` — a `routed` but unopened lead returns `NULL`. Vendors have **no**
  RLS policy on `enquiries` at all.
- A refunded junk-lead credit revokes contact visibility again.
- A review requires a *completed* booking, and `reviews.booking_id` is `UNIQUE`.
- Money tables have `SELECT` policies only — no client `INSERT`/`UPDATE` policy exists,
  so only service-role code can write them.
- `app.vendor_rank()` takes no vendor identifier, so it physically cannot read
  `is_anchor_studio`. `tests/03_ranking_no_anchor_favour.sql` fails the build if anyone
  adds such a reference (plan §11's "auditable in the ranking SQL").

### Verified

`pnpm typecheck` and `pnpm build` pass across all four workspace packages.
**124 prerendered pages** in `apps/web`, 8 in `apps/admin`, and 40 content assertions
covering the behaviours the plan actually commits to — including a per-card audit
proving the contact-masking rule holds on every lead state.

### Web app

- **Discovery** at `/[city]/[category]` and `/[city]/[category]/[locality]`, with the
  style-taxonomy filter, price bands and "free on my date".
- **Portfolio-first vendor profiles** with packages normalised to per-day pricing — the
  three-day package renders ₹1.1 L/day against the one-day package's ₹1.4 L/day, which is
  the comparison plan §2 asks for.
- **Enquiry flow** with budget/date capture and verbatim, versioned DPDP consent.
- **Programmatic SEO**: sitemap, robots, canonical URLs, and a quality threshold —
  a locality page with fewer than 3 live listings renders `noindex` rather than shipping
  a doorway page.
- **Anchor-studio disclosure** on the profile, on every result card, and in the footer,
  linking to a published policy page (plan §11/§12 channel-conflict mitigation).

---

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Next dev server |
| `pnpm build` | Production build of every package |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm format` | Prettier |
| `pnpm db:start` / `db:stop` | Local Supabase stack (needs Docker) |
| `pnpm db:reset` | Re-apply all migrations + seed |
| `pnpm db:types` | Regenerate the Supabase TypeScript types |
| `pnpm db:test` | pgTAP RLS suite |
| `pnpm db:lint` | Supabase schema linter |

**Demo logins** (after `pnpm db:reset`) — password `utsava123`:

| Email | Role |
|---|---|
| `priya@example.com` | customer with a completed booking + review |
| `studio@example.com` | owner of Utsava Studio (the anchor studio) |
| `lensai@example.com` | owner of Lightleak Studio |
| `admin@utsava.test` | super admin |
| `field@utsava.test` | field agent, Lucknow only |

---

## Progress against the plan's own epic backlog (§7.2)

| Epic | Wks | State |
|---|---:|---|
| Identity, RLS harness & accounts | 10 | RLS + pgTAP done; account UI outstanding |
| Catalog: profiles, taxonomy, media | 16 | Schema + public profile + partner editor UI done; upload pipeline outstanding |
| Search, ranking & SEO engine | 14 | Ranking fn, ISR pages, sitemap, thresholds done |
| Discovery, availability filter, shortlists | 13 | Discovery + availability done; shortlist UI outstanding |
| Package cards & pricing display | 3 | Done |
| Enquiry & lead verification | 10 | Form, action, OTP RPC done; round-trip needs a live instance |
| Lead routing & caps | 8 | DB engine + cap done; partner inbox done |
| Reviews & trust | 8 | Schema + display done; write flow outstanding |
| Design system | 8 | Tokens + primitives + admin chrome done |
| Admin console & moderation | 12 | Readiness, moderation, vendors, pipeline, leads done |
| Notifications (outbox + pgmq) | 6 | Table + enqueue fn done; **workers outstanding** |
| Analytics & instrumentation | 6 | Event table + names done; dashboards outstanding |
| Vendor onboarding tool | 10 | Pipeline board done; field capture app outstanding |
| Vendor app (Expo, Android) | 16 | **Not started** |

## Start here next session

Two blockers, in this order. Nothing else is worth doing before them.

**1. Authentication — there is none.** No sign-in page, no `middleware.ts`. Every RLS
policy in the schema keys off `auth.uid()`, so the partner dashboard and the account area
cannot work against real data until a session exists. Needed:

- `apps/web/app/(auth)/login` — phone OTP for customers, email+password for vendor owners
- `apps/web/middleware.ts` — Supabase session refresh (`@supabase/ssr` writes cookies
  there; see the comment in `packages/db/src/clients.ts` about Server Components not
  being able to set them)
- Route protection for `/partner/dashboard/**` and `/account/**`
- The admin app needs the same, plus the SSO + IP allowlist plan §3 calls for

**2. The SQL has still never run.** No Docker in the build environment. Install Docker
Desktop, then `pnpm db:start && pnpm db:reset && pnpm db:test`. A 49-agent review already
found and fixed 22 defects, but expect more on first execution.

## Also not yet built

- `apps/vendor-app` — Expo Android vendor app (plan S6–S8), 16 dev-weeks, the single
  largest remaining epic and Must-tier for the April 2027 launch
- Account area — shortlists, events, enquiry history (plan §2 Must)
- Global search page and the help/FAQ topic pages
- Media upload pipeline (Storage + transforms, plan §S2)
- Escrow payment integration — state machine and schema complete, aggregator webhooks not
- E-invites and planning checklist UI (plan §2 Should)
- Corporate RFP UI (Phase 2 — schema is shipped dark)
- Analytics dashboards over `public.analytics_events`
- Playwright E2E on the ten critical journeys (plan §9)

## Caveats

- **The SQL has never been executed.** No Docker or Postgres is available in this
  environment, so the migration pack is reviewed but not run. Expect to fix a few things
  on the first `pnpm db:reset`.
- `packages/db/src/generated/database.types.ts` is **hand-authored** and covers only the
  read surface the web app uses. Replace it wholesale with `pnpm db:types` once the local
  stack is up; plan §9 gates CI on generated-type drift.
- Demo media paths point at Storage objects that do not exist; the UI renders a warm
  gradient placeholder instead of a broken image.
- Fonts fall back to Georgia and system-ui. Self-host Fraunces + Inter (with Devanagari
  for the plan §2 Hindi UI) before launch.
