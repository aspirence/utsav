import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * expire-leads — the scheduled sweep that closes leads nobody answered.
 * Plan §5: leads move routed → viewed → responded → quoted → converted, and expiry is the
 * one exception to forward-only. Plan §12: "timeouts are explicit, not implicit."
 *
 * All the logic is app.expire_stale_leads() (migration 001500). It flips
 * `status in ('routed','viewed') and expires_at < now()` to 'expired' and writes a
 * lead_activities row for each. This function exists only to give that SQL a clock.
 *
 * Why it cannot run from a browser: app.expire_stale_leads() is REVOKED from public, anon
 * and authenticated (migration 001500) and has no wrapper in the public schema (migration
 * 001600 says so explicitly). It is reachable only with the service-role key, which
 * Supabase injects into this function's environment and which never leaves it.
 *
 * Related to the outbox for a specific reason. An expired lead is what makes a vendor
 * eligible for a credit refund under app.refund_lead_credit(), so this sweep must run on a
 * schedule the vendor can rely on — a lead that stays 'routed' forever is a credit the
 * vendor paid for and can never reclaim. The sweep itself sends nothing; anything a vendor
 * or customer needs to be told goes through public.notifications and
 * supabase/functions/drain-notifications, so a crash here can neither lose a message nor
 * duplicate one.
 *
 * Deploy:
 *   supabase functions deploy expire-leads
 *   supabase secrets set WORKER_SECRET=...
 *
 * Schedule (every 15 minutes) with pg_cron, in a migration owned by the schema agent:
 *   select cron.schedule('expire-leads', '*\/15 * * * *', $$
 *     select net.http_post(
 *       url     := 'https://<ref>.supabase.co/functions/v1/expire-leads',
 *       headers := jsonb_build_object('x-fremmo-worker-secret', '<WORKER_SECRET>')
 *     );
 *   $$);
 *
 * Note for whoever owns supabase/config.toml: `.schema('app')` goes through PostgREST, so
 * "app" has to appear in `[api] schemas` for this call to resolve. Until it does, this
 * function returns the PostgREST error verbatim rather than pretending it swept anything.
 */

const HEADER_NAME = 'x-fremmo-worker-secret'

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('WORKER_SECRET')
  if (!secret) {
    // Fail closed: this runs under the service-role key and mutates lead state.
    return json({ status: 'unconfigured', message: 'WORKER_SECRET is not set.', expired: 0 }, 503)
  }

  if (!(await isAuthorized(request, secret))) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    return json(
      {
        status: 'unconfigured',
        message: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.',
        expired: 0,
      },
      503,
    )
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // The sweep is one statement inside the function, so it is atomic on its own. Running
  // twice is harmless: the second call finds nothing left matching `expires_at < now()`.
  const { data, error } = await supabase.schema('app').rpc('expire_stale_leads')

  if (error) {
    // PGRST106 is PostgREST refusing a schema that is not exposed. supabase/config.toml
    // currently lists only ["public", "graphql_public"], so this is the expected failure
    // until that file's owner adds "app". Say so plainly rather than leaving an operator to
    // decode the raw message at 3am.
    const hint =
      error.code === 'PGRST106'
        ? ' The "app" schema is not exposed over PostgREST — add it to `[api] schemas` in ' +
          'supabase/config.toml and to the same setting on the hosted project. ' +
          'app.expire_stale_leads() has no public wrapper by design (migration 001600).'
        : ''
    console.error('[expire-leads] app.expire_stale_leads() failed:', error.message + hint)
    return json({ status: 'error', message: error.message + hint, expired: 0 }, 200)
  }

  const expired = typeof data === 'number' ? data : 0
  if (expired > 0) {
    console.info(`[expire-leads] expired ${expired} stale lead(s).`)
  }

  return json({ status: 'ok', expired }, 200)
})

/**
 * Constant-time comparison over SHA-256 digests. Hashing is not for secrecy — it is how
 * both sides reach a fixed 32 bytes, so the comparison cannot leak the secret's length.
 */
async function isAuthorized(request: Request, secret: string): Promise<boolean> {
  const header = request.headers.get(HEADER_NAME)
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const presented = header ?? bearer ?? ''
  if (!presented) return false

  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(presented)),
    crypto.subtle.digest('SHA-256', encoder.encode(secret)),
  ])

  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  let diff = left.length ^ right.length
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
