/**
 * Create the three test logins described in the README — one per dashboard.
 *
 * WHY THIS EXISTS. /dashboard resolves to one of three surfaces from the caller's memberships
 * (lib/viewer.ts), so testing that resolution needs an account with each shape. Two of the three
 * cannot be made from the UI at all: the site has no vendor sign-up, and `vendor_members` has no
 * INSERT policy for `authenticated` — plan §6 keeps privilege grants off the client entirely.
 * Without this, checking the partner dashboard means hand-writing rows in the Supabase console.
 *
 * WHAT IT MAKES.
 *   1. dummy@utsava.test  — a plain customer. No memberships, so /dashboard sends it to /account.
 *   2. vendor@utsava.test — owner of a vendor named "Dummy Studio", so /dashboard sends it to
 *      /partner/dashboard.
 *   3. staff@utsava.test  — a super admin, so /dashboard sends it to /admin. It can open
 *      /admin/users and grant or revoke everybody else's roles.
 *
 * The vendor is created with `status = 'draft'` and that is not incidental. `vendors_select_live`
 * admits only live rows to anonymous readers, so a draft listing is invisible to every public
 * query and its profile URL is a 404 — the fixture cannot leak into the catalogue.
 *
 * THE SUPER ADMIN IS A FIXTURE, NOT A REAL ACCOUNT. It exists so the console can be opened on a
 * fresh database without a second command, and its password is in the README. For an account a
 * person will actually use, run the other script and choose a password nobody has published:
 *
 *   node scripts/bootstrap-super-admin.mjs <email> <password>
 *
 * IT IS IDEMPOTENT. Re-running finds existing rows and resets the passwords, so it is safe after
 * a `db reset` and safe to run twice by accident.
 *
 *   node scripts/create-test-logins.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local at the
 * repository root.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CUSTOMER = {
  email: 'dummy@utsava.test',
  password: 'DummyUtsava2026!',
  fullName: 'Dummy Customer',
}

const VENDOR_OWNER = {
  email: 'vendor@utsava.test',
  password: 'DummyVendor2026!',
  fullName: 'Dummy Studio Owner',
}

const SUPER_ADMIN = {
  email: 'staff@utsava.test',
  // bootstrap-super-admin.mjs enforces 12 characters on the grounds that this account can
  // approve payouts. This one is a fixture and still clears that bar, so the two scripts do not
  // disagree about what a super-admin password is allowed to be.
  password: 'DummyStaff2026!!',
  fullName: 'Dummy Super Admin',
}

const VENDOR = {
  slug: 'dummy-studio',
  displayName: 'Dummy Studio',
  about: 'Test-only listing. status=draft keeps it out of every public query.',
}

function loadEnv() {
  const path = join(ROOT, '.env.local')
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    die(`No ${path}. Copy .env.example to .env.local and fill in the Supabase keys.`)
  }

  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return env
}

function die(message) {
  console.error(`\n  ✗ ${message}\n`)
  process.exit(1)
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || url.startsWith('your-')) die('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local.')
if (!serviceKey || serviceKey.startsWith('your-')) {
  die('SUPABASE_SERVICE_ROLE_KEY is not set in .env.local.')
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log(`\n  Supabase: ${url}\n`)

/**
 * Create or reset an auth user, and return its id.
 *
 * `email_confirm: true` skips the confirmation mail. The project has confirmations on and no
 * custom SMTP, so an unconfirmed fixture would be an account nobody can ever sign in to.
 *
 * The profiles row follows from the `on_auth_user_created` trigger in migration 000300.
 */
async function upsertUser({ email, password, fullName }) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (!created.error) {
    console.log(`  · ${email} created`)
    return created.data.user.id
  }

  const existing = await findUserByEmail(email)
  if (!existing) die(`Could not create ${email} and could not find it: ${created.error.message}`)

  const updated = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  })
  if (updated.error) die(`${email} exists but its password could not be set: ${updated.error.message}`)

  console.log(`  · ${email} already existed — password reset`)
  return existing.id
}

/** admin.listUsers is paginated; walk it rather than assuming one page. */
async function findUserByEmail(target) {
  const wanted = target.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const hit = data.users.find((u) => u.email?.toLowerCase() === wanted)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

// ---------------------------------------------------------------------------
// 1. The plain customer.
// ---------------------------------------------------------------------------
await upsertUser(CUSTOMER)

// ---------------------------------------------------------------------------
// 2. The super admin.
//
// `staff_roles` has no INSERT policy for any client role — migration 001300 keeps privilege
// grants to the service-role key, which is what this script is holding. city_ids stays empty:
// plan §3 scopes field agents to their own city and leaves super unscoped. `revoked_at` is
// nulled explicitly so re-running restores a role that was revoked, which is the point of
// running it again.
// ---------------------------------------------------------------------------
const superId = await upsertUser(SUPER_ADMIN)

const { error: roleError } = await admin
  .from('staff_roles')
  .upsert(
    { profile_id: superId, role: 'super', city_ids: [], revoked_at: null },
    { onConflict: 'profile_id,role' },
  )
if (roleError) die(`Could not grant the super role: ${roleError.message}`)
console.log('  · super role granted')

// ---------------------------------------------------------------------------
// 3. The vendor owner, its business, and the membership that ties them together.
// ---------------------------------------------------------------------------
const ownerId = await upsertUser(VENDOR_OWNER)

/**
 * `vendors.city_id` is NOT NULL with an FK to public.cities, so the fixture has to borrow a real
 * city rather than invent one. Any city will do — the listing is never shown.
 */
const { data: city, error: cityError } = await admin
  .from('cities')
  .select('id, name')
  .limit(1)
  .maybeSingle()

if (cityError) {
  die(
    `Could not read public.cities: ${cityError.message}\n` +
      '    If this says the relation does not exist, the migrations have not been pushed yet —\n' +
      '    run `npx supabase db push` first.',
  )
}
if (!city) die('public.cities is empty — seed the reference data before running this.')

const { data: vendor, error: vendorError } = await admin
  .from('vendors')
  .upsert(
    {
      slug: VENDOR.slug,
      display_name: VENDOR.displayName,
      // Not 'live'. See the note at the top: draft is what keeps this out of the catalogue.
      status: 'draft',
      city_id: city.id,
      about: VENDOR.about,
    },
    { onConflict: 'slug' },
  )
  .select('id, slug, status')
  .single()

if (vendorError) die(`Could not create the vendor: ${vendorError.message}`)
console.log(`  · vendor ${vendor.slug} (${vendor.status}) in ${city.name}`)

/**
 * `accepted_at` must be set and `revoked_at` must be null, or this is not a membership.
 * app.is_vendor_member() applies both conditions, so a row missing either would advertise a
 * dashboard whose every query comes back empty — which looks like a broken page, not a
 * permissions problem.
 */
const { error: memberError } = await admin.from('vendor_members').upsert(
  {
    vendor_id: vendor.id,
    profile_id: ownerId,
    role: 'owner',
    accepted_at: new Date().toISOString(),
    revoked_at: null,
  },
  { onConflict: 'vendor_id,profile_id' },
)

if (memberError) die(`Could not create the membership: ${memberError.message}`)
console.log('  · membership: owner\n')

console.log('  Done. Sign in at /login on the Email tab:')
console.log(`    ${CUSTOMER.email} / ${CUSTOMER.password}      → /account`)
console.log(`    ${VENDOR_OWNER.email} / ${VENDOR_OWNER.password}     → /partner/dashboard`)
console.log(`    ${SUPER_ADMIN.email} / ${SUPER_ADMIN.password}     → /admin (super admin)`)
console.log('\n  For a real staff account with a password nobody has published:')
console.log('    node scripts/bootstrap-super-admin.mjs <email> <password>\n')
