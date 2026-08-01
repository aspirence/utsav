/**
 * Create the first super admin on a fresh Supabase project.
 *
 * WHY THIS EXISTS. The console's local login (ADMIN_LOCAL_*) switches itself off the moment
 * NEXT_PUBLIC_SUPABASE_URL is set — see lib/admin-local-auth.ts, where that is the
 * single thing stopping it being a production backdoor. So attaching a database is also the
 * moment the only working login disappears, and without a staff row nobody can open /admin
 * again. This closes that gap in one step.
 *
 * WHAT IT DOES.
 *   1. Creates (or finds) an auth user with a confirmed email. The `on_auth_user_created`
 *      trigger in migration 20260727000300 writes the matching public.profiles row.
 *   2. Inserts a `super` row in public.staff_roles for that profile.
 *
 * Both through the service-role key, because staff_roles has no INSERT policy for
 * authenticated — plan §6 keeps privilege grants off the client entirely.
 *
 * IT IS IDEMPOTENT. Re-running finds the existing user and upserts the role, so it is safe
 * after a `db reset` wiped public but left auth, and safe to run twice by accident.
 *
 *   node scripts/bootstrap-super-admin.mjs <email> <password>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local at the
 * repository root.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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
    // Values may be quoted in the template; the keys themselves never contain quotes.
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

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  die('Usage: node scripts/bootstrap-super-admin.mjs <email> <password>')
}
// Supabase Auth's own minimum is 6; 12 is the floor for an account that can move money.
if (password.length < 12) {
  die('Password must be at least 12 characters — this account can approve payouts.')
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || url.startsWith('your-')) {
  die('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local.')
}
if (!serviceKey || serviceKey.startsWith('your-')) {
  die('SUPABASE_SERVICE_ROLE_KEY is not set in .env.local.')
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log(`\n  Supabase: ${url}`)
console.log(`  Account:  ${email}\n`)

// ---------------------------------------------------------------------------
// 1. The auth user.
//
// email_confirm: true skips the confirmation mail. A staff account created by an operator
// with the service-role key has already been vouched for; making them click a link only
// means the console is unreachable until SMTP is configured.
// ---------------------------------------------------------------------------
let userId

const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Super admin' },
})

if (created.error) {
  // Already there — find it and reset the password to what was passed, so this script is also
  // the way back in after a forgotten one.
  const existing = await findUserByEmail(email)
  if (!existing) die(`Could not create the user and could not find one: ${created.error.message}`)

  const updated = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  })
  if (updated.error) die(`User exists but the password could not be set: ${updated.error.message}`)

  userId = existing.id
  console.log('  · auth user already existed — password reset')
} else {
  userId = created.data.user.id
  console.log('  · auth user created')
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
// 2. The profile.
//
// The trigger writes it inside the same transaction as the auth insert, so it is normally
// already there. Checked rather than assumed: if the migrations have not been applied yet
// the table does not exist, and saying so is far more useful than a staff_roles FK violation.
// ---------------------------------------------------------------------------
const { data: profile, error: profileError } = await admin
  .from('profiles')
  .select('id')
  .eq('id', userId)
  .maybeSingle()

if (profileError) {
  die(
    `Could not read public.profiles: ${profileError.message}\n` +
      '    If this says the relation does not exist, the migrations have not been pushed yet —\n' +
      '    run `npx supabase db push` first.',
  )
}
if (!profile) {
  die('The auth user exists but has no profiles row — the on_auth_user_created trigger did not fire.')
}
console.log('  · profile row present')

// ---------------------------------------------------------------------------
// 3. The role.
//
// city_ids stays empty: plan §3 scopes field agents to their own city and leaves moderators,
// finance and super unscoped. revoked_at is nulled explicitly so re-running restores a role
// that was revoked, which is the whole point of running this again.
// ---------------------------------------------------------------------------
const { error: roleError } = await admin
  .from('staff_roles')
  .upsert(
    { profile_id: userId, role: 'super', city_ids: [], revoked_at: null },
    { onConflict: 'profile_id,role' },
  )

if (roleError) die(`Could not grant the super role: ${roleError.message}`)
console.log('  · super role granted\n')

console.log('  Done. Sign in at /login — the one login for every surface — with that email')
console.log('  and password. /dashboard reads the staff role and lands you on /admin.')
console.log('  Now remove ADMIN_LOCAL_EMAIL / _PASSWORD / _SECRET from .env.local —')
console.log('  they are already inert with Supabase attached, and a dead credential in a file')
console.log('  is one somebody will later assume still works.\n')
