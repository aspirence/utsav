'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import { createUtsavaServerClient, hasSupabaseEnv } from '@/lib/db'

/**
 * Lead credit refunds. Plan §12: junk leads are "the single biggest threat to renewal",
 * so the console gives moderators a cheap, audited way to give a credit back.
 *
 * All of the work happens in app.refund_lead_credit(), reached from a browser session
 * through the public wrapper added in migration 001600. That function:
 *
 *   · checks app.is_staff('moderator', 'super') and raises insufficient_privilege
 *     otherwise — which is why a vendor reporting a junk lead from the partner dashboard
 *     files a moderation case instead of refunding themselves;
 *   · stamps credit_refunded_at and clears credit_charged, which returns the credit to
 *     the vendor's subscription and drops the lead out of their response-rate
 *     denominator;
 *   · revokes contact visibility, because app.lead_contact_visible() reads the same
 *     columns that public.vendor_leads masks on;
 *   · appends a `credit_refunded` row to public.lead_activities.
 *
 * None of that is re-implemented here. This file validates the input, calls the RPC on
 * the moderator's own session, records the decision in public.audit_log, and turns the
 * database's error messages into something a staff member can act on.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type RefundState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Input. Local rather than shared: the minimum length is an editorial call about what
// makes a usable refund record, not a database constraint.
// ---------------------------------------------------------------------------

const refundSchema = z.object({
  leadId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(10, 'One line on why the lead was junk — finance and the vendor both read this')
    .max(500),
})

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function refundLeadCredit(leadId: string, reason: string): Promise<RefundState> {
  if (!hasSupabaseEnv()) {
    // Ahead of validation on purpose: with no instance connected, this page renders a
    // fixture roster whose references are not lead UUIDs, and a validation error there
    // would describe the demo data rather than the situation.
    return {
      status: 'unconfigured',
      message:
        'This is the demo console — no Supabase instance is connected, so no credit was ' +
        'refunded. Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to work real leads.',
    }
  }

  const parsed = refundSchema.safeParse({ leadId, reason })
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Please check what you entered.',
    }
  }

  const supabase = await staffClient()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const { data: lead, error } = await supabase.rpc('refund_lead_credit', {
    p_lead_id: parsed.data.leadId,
    p_reason: parsed.data.reason,
  })

  if (error) return { status: 'error', message: explain(error.message) }

  const auditError = await writeAudit(supabase, parsed.data.leadId, parsed.data.reason, lead)

  revalidatePath('/admin/leads')

  const summary =
    'Credit refunded. It is back on the vendor’s plan, the lead is out of their ' +
    'response-rate denominator, and their access to the customer’s contact details is ' +
    'revoked.'

  if (auditError) {
    // The refund went through; the record of who authorised it did not. Plan §3 makes the
    // audit log the point of this console, so a silent gap in it is worse than an awkward
    // message.
    return {
      status: 'error',
      message:
        `${summary} However the audit entry could not be written (${auditError}). Please ` +
        'tell whoever runs the console — the refund itself does not need repeating.',
    }
  }

  return { status: 'done', message: summary }
}

// ---------------------------------------------------------------------------
// Internals. Nothing below is exported: a 'use server' module may export async
// functions and types only.
// ---------------------------------------------------------------------------

/**
 * Typed escape hatches. packages/db/src/generated/database.types.ts is hand-authored and
 * covers the read surface apps/web uses, so `refund_lead_credit`, `audit_log` and
 * `staff_roles` are absent from it. Narrowing at the call site keeps this typed without
 * editing a file `pnpm db:types` will regenerate wholesale.
 */
type WriteError = { code?: string; message: string } | null

interface RefundedLead {
  id: string
  vendor_id: string | null
  enquiry_id: string | null
  status: string | null
  credit_refunded_at: string | null
}

interface StaffClient {
  rpc: (
    fn: 'refund_lead_credit',
    args: { p_lead_id: string; p_reason: string },
  ) => PromiseLike<{ data: RefundedLead | null; error: WriteError }>
  auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> }
  from: (table: 'audit_log' | 'staff_roles') => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: WriteError }>
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        is: (
          column: string,
          value: null,
        ) => PromiseLike<{ data: { role: string }[] | null; error: WriteError }>
      }
    }
  }
}

/**
 * Request-scoped client carrying the moderator's session. apps/admin has no
 * lib/supabase.ts of its own, so the cookie adapter is wired here; the shape is
 * identical to apps/web/lib/supabase.ts.
 *
 * It has to be the caller's session, not createAdminClient(): app.refund_lead_credit()
 * gates on app.is_staff(), which reads auth.uid(). A service-role call would satisfy no
 * staff check at all and would leave the lead_activities row unattributed.
 */
async function staffClient(): Promise<StaffClient | null> {
  try {
    const store = await cookies()
    return createUtsavaServerClient({
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          store.set(name, value, options)
        }
      },
    }) as unknown as StaffClient
  } catch {
    return null
  }
}

/** Returns null on success, or a short reason the audit row could not be appended. */
async function writeAudit(
  supabase: StaffClient,
  leadId: string,
  reason: string,
  lead: RefundedLead | null,
): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser()
  const actorId = auth.user?.id ?? null

  // audit_log_insert_staff requires actor_id = auth.uid(). A caller without an identity
  // could never have passed app.is_staff(), so this only happens if the session expired
  // mid-request.
  if (!actorId) return 'your session has no signed-in identity'

  const { error } = await supabase.from('audit_log').insert({
    actor_id: actorId,
    actor_role: await actorRole(supabase, actorId),
    action: 'lead.credit_refunded',
    subject_type: 'lead',
    subject_id: leadId,
    before_state: { credit_charged: true },
    after_state: {
      credit_charged: false,
      credit_refunded_at: lead?.credit_refunded_at ?? null,
      vendor_id: lead?.vendor_id ?? null,
      enquiry_id: lead?.enquiry_id ?? null,
    },
    reason,
  })

  return error ? error.message : null
}

/**
 * The caller's own staff role, for the audit row. `staff_roles_select_own` allows
 * reading your own rows, and 'super' outranks the rest.
 */
async function actorRole(supabase: StaffClient, actorId: string): Promise<string | null> {
  const { data } = await supabase
    .from('staff_roles')
    .select('role')
    .eq('profile_id', actorId)
    .is('revoked_at', null)

  if (!data || data.length === 0) return null
  if (data.some((r) => r.role === 'super')) return 'super'
  return data[0]?.role ?? null
}

/** app.refund_lead_credit() raises with plain messages; turn them into staff-facing copy. */
function explain(message: string): string {
  if (message.includes('Staff only') || message.includes('insufficient_privilege')) {
    return (
      'Refunds need a moderator or super-admin role. Your account does not currently ' +
      'carry one — ask a super admin to grant it.'
    )
  }
  if (message.includes('already refunded')) {
    return 'That lead has already had its credit refunded, so nothing changed.'
  }
  if (message.includes('not found')) {
    return 'That lead reference does not exist. Check it against the vendor’s inbox.'
  }
  return `Could not refund the credit: ${message}`
}
