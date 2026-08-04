'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createAdminClient, hasSupabaseEnv, leadResponseSchema, type LeadStatus } from '@/lib/db'

import { getServerClientOrNull } from '@/lib/supabase'

/**
 * Lead inbox actions. Plan §5: the lead state machine, and plan §6: contact masking.
 *
 * Two rules shape every function here.
 *
 * 1. There is no vendor UPDATE policy on public.leads. State changes go through
 *    app.transition_lead(), reached from a browser session via the public wrapper added
 *    in migration 001600. The RPC re-checks membership and transition legality, so this
 *    file is a validator and a copywriter — it is not the authorization boundary.
 *
 * 2. Nothing here ever returns a customer phone number. Opening a lead stamps
 *    contact_revealed_at and unmasks the number in public.vendor_leads; the page then
 *    re-renders from that view. If the server has not returned the number, the screen
 *    must not show one — see revalidateLead() below.
 *
 * markNotAFit() and reportJunkLead() write to tables a vendor session cannot touch
 * (public.lead_activities has a SELECT policy only; public.moderation_queue is staff-
 * only for everything). They therefore authorize the caller through public.vendor_leads
 * on the caller's own session first — that view's WHERE app.is_vendor_member(...) is the
 * security boundary — and only then use the service-role client for the insert.
 */

export type LeadActionState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Input schemas. leadResponseSchema comes from @/lib/db because it is the shared
// shape; the decline and junk-report reasons are local to this screen.
// ---------------------------------------------------------------------------

const respondSchema = leadResponseSchema.extend({
  note: z
    .string()
    .trim()
    .min(5, 'Say briefly what you told them — a few words is enough')
    .max(1000),
})

const declineSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().min(5, 'Tell us what was off about this match').max(500),
})

const junkSchema = z.object({
  leadId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(10, 'Give our moderators something to act on — one line is enough')
    .max(500),
})

// ---------------------------------------------------------------------------
// Typed escape hatches.
//
// packages/db/src/generated/database.types.ts is hand-authored today and covers only
// the read surface apps/web uses, so `transition_lead`, `lead_activities` and
// `moderation_queue` are absent from it. Narrowing the client at the call site keeps
// these calls typed without editing a file that `pnpm db:types` will regenerate
// wholesale — the same approach as app/enquire/otp-actions.ts.
// ---------------------------------------------------------------------------

type WriteError = { code?: string; message: string } | null

interface TransitionLeadRpc {
  rpc: (
    fn: 'transition_lead',
    args: { p_lead_id: string; p_to: LeadStatus; p_note?: string | null },
  ) => PromiseLike<{ error: WriteError }>
}

interface ModerationCaseRow {
  id: string
  reason: string | null
}

interface PrivilegedWriter {
  from: (table: 'lead_activities' | 'moderation_queue') => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: WriteError }>
    select: (columns: string) => {
      match: (filter: Record<string, unknown>) => {
        maybeSingle: () => PromiseLike<{ data: ModerationCaseRow | null; error: WriteError }>
      }
    }
    update: (values: Record<string, unknown>) => {
      match: (filter: Record<string, unknown>) => PromiseLike<{ error: WriteError }>
    }
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * routed → viewed. This is the reveal: app.transition_lead() stamps
 * contact_revealed_at, and app.lead_contact_visible() then lets public.vendor_leads
 * return contact_name / contact_phone / contact_email for this lead.
 *
 * It is a POST from a button rather than a side effect of loading the page on purpose —
 * a link prefetch or a bot following the URL would otherwise spend the reveal, and the
 * audit row would say the vendor opened a lead they never actually looked at.
 */
export async function openLead(leadId: string): Promise<LeadActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = leadResponseSchema.safeParse({ leadId, action: 'viewed' })
  if (!parsed.success) return { status: 'error', message: 'That lead reference is not valid.' }

  return transition(
    parsed.data.leadId,
    'viewed',
    null,
    'Lead opened. The customer’s phone number and email are now on this page — they were ' +
      'masked until now, and the reveal is stamped against your account.',
  )
}

/**
 * viewed → responded (routed → responded is legal too, for a vendor who calls straight
 * from the inbox). This is the transition app.refresh_vendor_response_metrics() reads,
 * so it sets the response time shown on the public profile and used by app.vendor_rank().
 *
 * The note lands in public.lead_activities. Both our staff and the customer can read
 * that table for this lead — the UI says so.
 */
export async function respondToLead(leadId: string, note: string): Promise<LeadActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = respondSchema.safeParse({ leadId, action: 'responded', note })
  if (!parsed.success) {
    return {
      status: 'error',
      message: firstIssue(parsed.error) ?? 'Please check what you entered.',
    }
  }

  return transition(
    parsed.data.leadId,
    'responded',
    parsed.data.note,
    'Logged as responded. Your response time on this lead is measured from the moment it ' +
      'was routed to you, and it feeds the median shown on your public profile.',
  )
}

/**
 * "Not a fit" — a decline, recorded but not a state change.
 *
 * The lead is deliberately left alone. `expired` is what the sweep writes: it means
 * nobody replied before expires_at, and app.expire_stale_leads() (service-role, revoked
 * from anon and authenticated) is what sets it. app.lead_transition_allowed() would
 * technically permit routed → expired from a vendor session, but using it here would
 * relabel a considered decline as an unworked lead in the customer's activity feed and
 * in the §10 Match-stage KPIs. So there is no client transition for expiry, and this
 * action only appends to public.lead_activities.
 *
 * Note the kind: public.lead_activity_kind has no `not_a_fit` member and this feature
 * may not add a migration, so the row is written as `viewed` — the one thing that is
 * unambiguously true when a vendor declines — with the decline itself in `note` and in
 * machine-readable form in `metadata`. Worth a `not_a_fit` enum member next time the
 * demand schema is touched.
 */
export async function markNotAFit(leadId: string, reason: string): Promise<LeadActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = declineSchema.safeParse({ leadId, reason })
  if (!parsed.success) {
    return {
      status: 'error',
      message: firstIssue(parsed.error) ?? 'Please check what you entered.',
    }
  }

  const lead = await loadOwnLead(parsed.data.leadId)
  if (lead.status === 'failed') return lead.state

  const { row, actorId } = lead
  if (!['routed', 'viewed', 'responded', 'quoted'].includes(row.status)) {
    return { status: 'error', message: 'This lead is already closed, so there is nothing to mark.' }
  }

  const writer = adminWriter()
  if ('state' in writer) return writer.state

  const { error } = await writer.client.from('lead_activities').insert({
    lead_id: row.lead_id,
    actor_id: actorId,
    kind: 'viewed',
    note: `Not a fit — ${parsed.data.reason}`,
    metadata: { outcome: 'not_a_fit', reason: parsed.data.reason, source: 'partner_dashboard' },
  })

  if (error) {
    return { status: 'error', message: 'Could not record that just now. Please try again.' }
  }

  revalidateLead(row.lead_id)
  return {
    status: 'done',
    message:
      'Recorded. The lead stays as it is — nothing is sent to the customer and it still ' +
      'expires on its own — but our routing team now knows why this match was wrong.',
  }
}

/**
 * Junk lead → a case in public.moderation_queue for staff to action.
 *
 * Deliberately NOT a call to refund_lead_credit(). That RPC checks
 * app.is_staff('moderator', 'super') and raises `insufficient_privilege` for anybody
 * else, so a vendor calling it would simply be rejected — and rightly: a vendor cannot
 * be the one who decides their own credit comes back. The moderator decides, and the
 * refund happens on their session.
 *
 * public.moderation_queue is UNIQUE (subject_type, subject_id), so one enquiry has one
 * case however many of the five routed vendors report it. A duplicate therefore appends
 * this vendor's reason to the open case rather than failing.
 */
export async function reportJunkLead(leadId: string, reason: string): Promise<LeadActionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = junkSchema.safeParse({ leadId, reason })
  if (!parsed.success) {
    return {
      status: 'error',
      message: firstIssue(parsed.error) ?? 'Please check what you entered.',
    }
  }

  const lead = await loadOwnLead(parsed.data.leadId)
  if (lead.status === 'failed') return lead.state

  const { row } = lead
  if (row.credit_refunded_at) {
    return {
      status: 'error',
      message: 'The credit for this lead has already been refunded, so there is nothing to review.',
    }
  }

  const writer = adminWriter()
  if ('state' in writer) return writer.state

  const line = `Lead ${row.lead_id}: ${parsed.data.reason}`

  const { error } = await writer.client.from('moderation_queue').insert({
    // The customer's enquiry is what a moderator actually judges — the lead is one of
    // five copies of it. city_id is left null: public.vendor_leads does return it, but
    // the hand-authored row type does not model it yet, and staff resolve the city from
    // the enquiry anyway.
    subject_type: 'enquiry',
    subject_id: row.enquiry_id,
    vendor_id: row.vendor_id,
    // Above the default 5: a junk lead is a billing question as well as a quality one,
    // and plan §13 puts moderation on an SLA.
    priority: 4,
    reason: line,
    auto_flags: ['vendor_reported_junk'],
  })

  if (error) {
    if (error.code !== '23505') {
      return { status: 'error', message: 'Could not file that report just now. Please try again.' }
    }

    const { data: existing } = await writer.client
      .from('moderation_queue')
      .select('id, reason')
      .match({ subject_type: 'enquiry', subject_id: row.enquiry_id })
      .maybeSingle()

    const { error: appendError } = existing
      ? await writer.client
          .from('moderation_queue')
          .update({ reason: [existing.reason, line].filter(Boolean).join('\n') })
          .match({ id: existing.id })
      : { error: { message: 'Open case not found' } }

    if (appendError) {
      return {
        status: 'error',
        message:
          'This enquiry is already with our moderators, but your reason could not be added ' +
          'to the case. Please try again.',
      }
    }

    revalidateLead(row.lead_id)
    return {
      status: 'done',
      message:
        'Another vendor had already flagged this enquiry, so your reason has been added to ' +
        'the same case. A moderator will look at it, usually within a day.',
    }
  }

  revalidateLead(row.lead_id)
  return {
    status: 'done',
    message:
      'Reported. A moderator reviews it — usually within a day — and refunds the credit if ' +
      'the lead was junk. We also use these reports to tune routing.',
  }
}

// ---------------------------------------------------------------------------
// Internals. Nothing below is exported: a 'use server' module may export async
// functions and types only.
// ---------------------------------------------------------------------------

interface LoadedLead {
  status: 'ok'
  row: {
    lead_id: string
    vendor_id: string
    enquiry_id: string
    status: LeadStatus
    credit_refunded_at: string | null
  }
  actorId: string | null
}

type LoadFailure = { status: 'failed'; state: LeadActionState }

function envGuard(): LeadActionState | null {
  if (hasSupabaseEnv()) return null
  // The env check comes before validation on purpose: with no instance connected,
  // lib/partner-queries.ts serves a demo inbox whose lead ids are not UUIDs, and a
  // validation error there would describe the fixture rather than the situation.
  return {
    status: 'unconfigured',
    message:
      'This is the demo inbox — no Supabase instance is connected, so nothing was written. ' +
      'Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to work real leads.',
  }
}

/** Structural, not `z.ZodError<T>` — the generic parameter would fight the call sites. */
function firstIssue(error: { issues: { message: string }[] }): string | undefined {
  return error.issues[0]?.message
}

/** Revalidate both the list and this lead, so the reveal comes from the view. */
function revalidateLead(leadId: string): void {
  revalidatePath('/partner/dashboard/leads')
  revalidatePath(`/partner/dashboard/leads/${leadId}`)
}

async function transition(
  leadId: string,
  to: LeadStatus,
  note: string | null,
  successMessage: string,
): Promise<LeadActionState> {
  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const { error } = await (supabase as unknown as TransitionLeadRpc).rpc('transition_lead', {
    p_lead_id: leadId,
    p_to: to,
    p_note: note,
  })

  if (error) return { status: 'error', message: explain(error.message) }

  revalidateLead(leadId)
  return { status: 'done', message: successMessage }
}

/** app.transition_lead() raises with plain messages; turn them into vendor-facing copy. */
function explain(message: string): string {
  if (message.includes('Illegal lead transition')) {
    return 'This lead has already moved on. Reload the page to see where it stands.'
  }
  if (message.includes('Not a member')) {
    return 'This lead belongs to a different vendor account.'
  }
  if (message.includes('not found')) {
    return 'That lead no longer exists.'
  }
  return `Could not update the lead: ${message}`
}

/**
 * Read the lead on the caller's own session. public.vendor_leads carries the
 * membership guard, so a row coming back is proof this vendor may work this lead —
 * which is what makes the service-role write below safe.
 */
async function loadOwnLead(leadId: string): Promise<LoadedLead | LoadFailure> {
  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return {
      status: 'failed',
      state: { status: 'error', message: 'Could not reach the database. Please try again.' },
    }
  }

  const [{ data: auth }, { data: row, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('vendor_leads')
      .select('lead_id, vendor_id, enquiry_id, status, credit_refunded_at')
      .eq('lead_id', leadId)
      .maybeSingle(),
  ])

  if (error || !row) {
    return {
      status: 'failed',
      state: {
        status: 'error',
        message: 'That lead is not in your inbox. Sign in again if you switched accounts.',
      },
    }
  }

  return { status: 'ok', row, actorId: auth.user?.id ?? null }
}

/** Service-role client, or a state explaining why there isn't one. */
function adminWriter(): { client: PrivilegedWriter } | { state: LeadActionState } {
  try {
    return { client: createAdminClient() as unknown as PrivilegedWriter }
  } catch {
    // createAdminClient() throws when SUPABASE_SERVICE_ROLE_KEY is absent (and if it
    // ever runs in a browser). Degrade with a message rather than a 500.
    return {
      state: {
        status: 'unconfigured',
        message:
          'This action is recorded on the server and needs SUPABASE_SERVICE_ROLE_KEY to be ' +
          'set. Nothing was written.',
      },
    }
  }
}
