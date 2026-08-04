'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getServerClientOrNull, hasSupabaseEnv } from '@/lib/admin-supabase'

/**
 * Moderation decisions. Plan §3: "Admin console — separate deploy, SSO + IP allowlist,
 * append-only audit log."
 *
 * Three things are true of every function in this file.
 *
 * 1. It runs on the staff member's own session, never on the service-role key.
 *    `moderation_queue_staff`, `vendors_update_staff`, `reviews_all_moderator` and
 *    `audit_log_insert_staff` all key off app.is_staff(), which reads public.staff_roles
 *    for auth.uid(). Service-role would bypass every one of them and leave an audit row
 *    with nobody's name on it. If the caller is not a moderator or super admin, the reads
 *    below return nothing and the writes touch nothing — RLS is the check, not an `if`
 *    in this file (CLAUDE.md non-negotiable 1).
 *
 * 2. Vendor status transitions are additionally guarded by app.guard_vendor_columns(),
 *    a BEFORE UPDATE trigger that raises `insufficient_privilege` when a non-staff caller
 *    writes `status`, `published_at` or the derived metrics. It short-circuits for
 *    app.is_staff('moderator', 'super') and for the service role, which is exactly why
 *    approveItem() on a vendor has to run on a staff session (or, in a future Edge
 *    Function, service-role) and cannot be delegated to the vendor's own client.
 *
 * 3. Nothing is decided without a row in public.audit_log. The table is append-only by
 *    trigger (app.forbid_mutation), so the record cannot be tidied up afterwards.
 *
 * On atomicity. PostgREST gives one statement per request, so "one transaction" is not
 * literally available from here; a genuinely atomic version belongs in an
 * app.decide_moderation_item() SECURITY DEFINER RPC, which is a migration and therefore
 * not this task's to write. What decide() does instead is order the sequence so that a
 * failure at any step is recoverable and visible: the subject changes first, the queue
 * row second, the audit row last. A crash after step one leaves the item still showing as
 * pending — a moderator re-opens it, sees the vendor is already live, and the retry is
 * idempotent. The opposite order would mark the queue decided while the vendor stayed
 * hidden, and nobody would ever look at it again.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type ModerationDecisionState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string }
  | { status: 'unconfigured'; message: string }

// ---------------------------------------------------------------------------
// Input schemas. Nothing here fits a shared schema in '@/lib/db' — these shapes are
// specific to the staff console — so they are defined locally, per the §4 convention.
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  id: z.string().uuid('That is not a moderation queue reference.'),
})

const rejectionSchema = itemSchema.extend({
  // Plan §3: the vendor reads this verbatim. "Rejected" with no sentence attached is the
  // single most common reason a supply team loses a listing it had already paid to shoot.
  reason: z
    .string()
    .trim()
    .min(10, 'Write at least one full sentence — the vendor sees this word for word.')
    .max(1000, 'Keep the reason under 1000 characters.'),
})

// ---------------------------------------------------------------------------
// Typed escape hatch.
//
// packages/db/src/generated/database.types.ts is hand-authored today and covers only the
// read surface apps/web uses, so moderation_queue, audit_log and staff_roles are absent
// from it — and the subject table is chosen at runtime from subject_type, which no static
// table union can express anyway. Narrowing the client at the call site keeps these calls
// honest without editing a package this app does not own and that `pnpm db:types` will
// regenerate wholesale. Same approach as apps/web/app/partner/dashboard/leads/actions.ts.
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>
type WriteError = { code?: string; message: string } | null

interface Outcome<T> {
  data: T | null
  error: WriteError
}

interface Selection<T> extends PromiseLike<Outcome<T[]>> {
  eq(column: string, value: string): Selection<T>
  is(column: string, value: null): Selection<T>
  maybeSingle(): PromiseLike<Outcome<T>>
}

interface Mutation extends PromiseLike<Outcome<null>> {
  eq(column: string, value: string): Mutation
  select<T = JsonRecord>(columns: string): Selection<T>
}

interface StaffTable {
  select<T = JsonRecord>(columns: string): Selection<T>
  update(values: JsonRecord): Mutation
  insert(values: JsonRecord): PromiseLike<Outcome<null>>
}

interface StaffWriter {
  from(table: string): StaffTable
}

// ---------------------------------------------------------------------------
// What a decision actually does to the thing being moderated.
//
// Every column below is checked against supabase/migrations/20260727000500_catalog.sql
// and ...000800_trust.sql, including the CHECK constraints that make some of these pairs
// non-optional: `vendors_live_requires_publish` means status='live' without published_at
// is rejected by the database, and `reviews_published_requires_approval` means
// published_at without moderation='approved' is too.
// ---------------------------------------------------------------------------

type SubjectType = 'vendor' | 'package' | 'media' | 'review' | 'story' | 'enquiry'

interface SubjectSpec {
  table: string
  /** Captured verbatim into before_state / after_state, so the diff is the audit. */
  columns: string
  /** null means the decision changes the queue and the log but not the subject. */
  approve: (now: string) => JsonRecord | null
  reject: (reason: string, now: string) => JsonRecord | null
  approved: string
  rejected: string
}

const SUBJECTS: Record<SubjectType, SubjectSpec> = {
  vendor: {
    table: 'vendors',
    columns: 'id, display_name, status, published_at, suspended_reason',
    approve: (now) => ({ status: 'live', published_at: now, suspended_reason: null }),
    // Back to draft rather than suspended: a listing that failed review is unfinished
    // work for the field team, not a punished vendor. published_at is left alone so a
    // previously live listing keeps its original publication date.
    //
    // public.vendors has no rejected_reason column, and suspended_reason is its only
    // vendor-visible free-text field, so that is where the sentence goes. Worth a
    // dedicated column the next time the catalog schema is touched.
    reject: (reason) => ({ status: 'draft', suspended_reason: reason }),
    approved: 'The listing is live and publicly discoverable.',
    rejected: 'The listing is back in draft, with your reason on it for the vendor to read.',
  },
  package: {
    table: 'packages',
    columns: 'id, name, price, is_active',
    approve: () => ({ is_active: true }),
    reject: () => ({ is_active: false }),
    approved: 'The package is active and shows on the listing.',
    rejected:
      'The package is deactivated. It has no reason column of its own, so your sentence ' +
      'lives on the queue item and in the audit log.',
  },
  media: {
    table: 'media',
    columns: 'id, storage_path, moderation, is_cover',
    approve: () => ({ moderation: 'approved' }),
    reject: () => ({ moderation: 'rejected' }),
    approved: 'The photos are approved and visible on the profile.',
    rejected: 'The photos are rejected and stay hidden.',
  },
  review: {
    table: 'reviews',
    columns: 'id, rating, moderation, published_at, rejected_reason',
    approve: (now) => ({ moderation: 'approved', published_at: now, rejected_reason: null }),
    reject: (reason) => ({ moderation: 'rejected', published_at: null, rejected_reason: reason }),
    approved: 'The review is published and counts towards the vendor’s rating.',
    rejected: 'The review is rejected and will not publish. The author sees your reason.',
  },
  story: {
    table: 'stories',
    columns: 'id, slug, status, published_at',
    approve: (now) => ({ status: 'published', published_at: now }),
    reject: () => ({ status: 'draft', published_at: null }),
    approved: 'The story is published.',
    rejected: 'The story is back in draft with the photographer.',
  },
  // An enquiry reaches this queue only because a routed vendor reported it as junk
  // (see apps/web/app/partner/dashboard/leads/actions.ts). The polarity is therefore
  // inverted: approving means the enquiry is genuine and nothing about it changes.
  enquiry: {
    table: 'enquiries',
    columns: 'id, status, contact_name',
    approve: () => null,
    reject: () => ({ status: 'spam' }),
    approved: 'The enquiry stands — it was not junk. Nothing on it changed.',
    rejected:
      'The enquiry is marked spam. Refunding the reporting vendor’s credit is a separate ' +
      'decision, on the leads screen.',
  },
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Approve. The item is fine: the vendor goes live, the review publishes, the story ships.
 *
 * No reason is required, but the before/after diff still lands in audit_log — plan §11
 * promises the anchor studio is moderated on identical terms, and "identical terms" is
 * only checkable if approvals are as traceable as rejections.
 */
export async function approveItem(id: string): Promise<ModerationDecisionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = itemSchema.safeParse({ id })
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) ?? 'Please check that reference.' }
  }

  return decide(parsed.data.id, 'approved', null)
}

/**
 * Reject, with a reason the vendor reads verbatim.
 *
 * The reason is validated here and again by the caller's UI, but the real reason it is
 * mandatory is downstream: it is written to the subject row (vendors.suspended_reason,
 * reviews.rejected_reason) as well as to moderation_queue.decision_note and audit_log.
 * A rejection with an empty reason would be a listing that silently stopped being live.
 */
export async function rejectItem(id: string, reason: string): Promise<ModerationDecisionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = rejectionSchema.safeParse({ id, reason })
  if (!parsed.success) {
    return {
      status: 'error',
      message: firstIssue(parsed.error) ?? 'Please check what you entered.',
    }
  }

  return decide(parsed.data.id, 'rejected', parsed.data.reason)
}

/**
 * Escalate to a super admin. Deliberately does not touch the subject at all — an
 * escalation is a statement that this moderator should not be the one deciding, so
 * deciding anything would defeat it.
 *
 * decided_by and decided_at stay null for the same reason: the item is not decided. Who
 * escalated it, and when, is in audit_log, which is the append-only record the [id]
 * screen's audit trail reads.
 */
export async function escalateItem(id: string): Promise<ModerationDecisionState> {
  const guard = envGuard()
  if (guard) return guard

  const parsed = itemSchema.safeParse({ id })
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error) ?? 'Please check that reference.' }
  }

  return decide(parsed.data.id, 'escalated', null)
}

// ---------------------------------------------------------------------------
// Internals. Nothing below is exported: a 'use server' module may export async functions
// and types only, and a stray `const` export breaks the whole route at build time.
// ---------------------------------------------------------------------------

type Decision = 'approved' | 'rejected' | 'escalated'

interface QueueRow {
  id: string
  subject_type: SubjectType
  subject_id: string
  vendor_id: string | null
  status: string
  priority: number
  reason: string | null
  decision_note: string | null
  decided_by: string | null
  decided_at: string | null
}

const QUEUE_COLUMNS =
  'id, subject_type, subject_id, vendor_id, status, priority, reason, decision_note, ' +
  'decided_by, decided_at'

function envGuard(): ModerationDecisionState | null {
  if (hasSupabaseEnv()) return null
  // Checked before validation on purpose: with no instance connected, lib/admin-data.ts
  // serves a demo queue whose ids ("mq-1") are not UUIDs, and a "that is not a valid
  // reference" error there would describe the fixture rather than the situation.
  return {
    status: 'unconfigured',
    message:
      'This is the demo queue — no Supabase instance is connected, so nothing was written. ' +
      'Run `pnpm db:start` and set NEXT_PUBLIC_SUPABASE_URL to work real items.',
  }
}

/** Structural, not `z.ZodError<T>` — the generic parameter would fight the call sites. */
function firstIssue(error: { issues: { message: string }[] }): string | undefined {
  return error.issues[0]?.message
}

/**
 * The whole decision, in the order described at the top of this file:
 * subject → queue → audit.
 */
async function decide(
  id: string,
  decision: Decision,
  reason: string | null,
): Promise<ModerationDecisionState> {
  const supabase = await getServerClientOrNull()
  if (!supabase) {
    return { status: 'error', message: 'Could not reach the database. Please try again.' }
  }

  const staff = supabase as unknown as StaffWriter

  // Who is deciding. audit_log_insert_staff requires actor_id = auth.uid(), so an
  // unauthenticated console session cannot write a decision under someone else's name.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      status: 'error',
      message: 'Your session has expired. Sign in to the console again before deciding items.',
    }
  }

  const { data: queueBefore, error: caseError } = await staff
    .from('moderation_queue')
    .select<QueueRow>(QUEUE_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (caseError) {
    return { status: 'error', message: 'Could not read that item just now. Please try again.' }
  }

  if (!queueBefore) {
    // Either the row is gone, or moderation_queue_staff denied the read. Both look the
    // same from here by design — RLS does not leak the existence of rows it hides.
    return {
      status: 'error',
      message:
        'That item is not in the queue, or your account does not carry a moderator or ' +
        'super admin role.',
    }
  }

  const already = alreadySettled(queueBefore.status, decision)
  if (already) return already

  // Annotated as possibly undefined on purpose: subject_type is `text` coming back from
  // PostgREST, so a member added to public.moderation_subject by a later migration would
  // arrive here before this file knows about it.
  const spec: SubjectSpec | undefined = SUBJECTS[queueBefore.subject_type]
  if (!spec) {
    return {
      status: 'error',
      message: `This console does not know how to decide a "${queueBefore.subject_type}" item yet.`,
    }
  }

  const now = new Date().toISOString()
  const actorRole = await readActorRole(staff, user.id)

  // --- Step 1: the subject ------------------------------------------------
  //
  // Read-then-write rather than a blind UPDATE: before_state has to be the row as it
  // stood, and the returning row proves the write actually landed (a policy denial comes
  // back as zero rows updated, not as an error).
  const { data: subjectBefore } = await staff
    .from(spec.table)
    .select(spec.columns)
    .eq('id', queueBefore.subject_id)
    .maybeSingle()

  const patch =
    decision === 'approved'
      ? spec.approve(now)
      : decision === 'rejected'
        ? spec.reject(reason ?? '', now)
        : null

  let subjectAfter: JsonRecord | null = subjectBefore

  if (patch) {
    const { data: updated, error: subjectError } = await staff
      .from(spec.table)
      .update(patch)
      .eq('id', queueBefore.subject_id)
      .select(spec.columns)
      .maybeSingle()

    if (subjectError) {
      return { status: 'error', message: explainWrite(subjectError.message, spec.table) }
    }

    if (!updated) {
      return {
        status: 'error',
        message:
          'Nothing was changed — the item this refers to no longer exists, or your role ' +
          'does not cover its city. The queue is untouched.',
      }
    }

    subjectAfter = updated
  }

  // --- Step 2: the queue row ----------------------------------------------
  const queuePatch: JsonRecord =
    decision === 'escalated'
      ? // An escalation is by definition the most urgent thing in the queue, and it is
        // explicitly not a decision — decided_by / decided_at stay null.
        { status: 'escalated', priority: 1 }
      : {
          status: decision,
          decided_by: user.id,
          decided_at: now,
          decision_note: reason,
        }

  const { data: queueAfter, error: queueError } = await staff
    .from('moderation_queue')
    .update(queuePatch)
    .eq('id', id)
    .select<QueueRow>(QUEUE_COLUMNS)
    .maybeSingle()

  if (queueError || !queueAfter) {
    revalidateItem(id)
    return {
      status: 'error',
      message: patch
        ? 'The change was applied, but the queue item could not be closed. Re-open it and ' +
          'try again — the second attempt is safe.'
        : 'Could not update the queue item. Please try again.',
    }
  }

  // --- Step 3: the audit row ----------------------------------------------
  const { error: auditError } = await staff.from('audit_log').insert({
    actor_id: user.id,
    actor_role: actorRole,
    action: `moderation.${decision}`,
    subject_type: queueBefore.subject_type,
    subject_id: queueBefore.subject_id,
    before_state: { queue: queueBefore, subject: subjectBefore },
    after_state: { queue: queueAfter, subject: subjectAfter },
    reason,
  })

  revalidateItem(id)

  if (auditError) {
    // The decision stands — audit_log is append-only, so there is no honest way to undo
    // it from here, and silently swallowing the gap is worse than saying so. Plan §3
    // makes this log the record of staff action; a missing row is an incident.
    return {
      status: 'error',
      message:
        'The decision was applied but could not be written to the audit log. Tell ' +
        'engineering before deciding anything else — that log is the record.',
    }
  }

  return { status: 'done', message: successCopy(decision, spec) }
}

/** Reads the caller's own staff role for audit_log.actor_role. */
async function readActorRole(staff: StaffWriter, actorId: string): Promise<string | null> {
  // staff_roles_select_own permits profile_id = auth.uid(), so this needs no privilege
  // the caller does not already have. A moderator who is also a super admin records the
  // strongest role they hold, because that is the one that let the write through.
  const { data } = await staff
    .from('staff_roles')
    .select<{ role: string }>('role')
    .eq('profile_id', actorId)
    .is('revoked_at', null)

  const roles = (data ?? []).map((r) => r.role)
  if (roles.length === 0) return null

  const strongest = ['super', 'moderator', 'finance', 'field_agent'].find((r) => roles.includes(r))
  return strongest ?? roles[0] ?? null
}

/** Guards against deciding the same item twice from two open tabs. */
function alreadySettled(current: string, decision: Decision): ModerationDecisionState | null {
  if (current === 'approved' || current === 'rejected') {
    return {
      status: 'error',
      message: `This item was already ${current} by someone else. Reload the queue to see the decision.`,
    }
  }

  if (current === 'escalated' && decision === 'escalated') {
    return {
      status: 'error',
      message: 'This item is already with a super admin.',
    }
  }

  return null
}

function successCopy(decision: Decision, spec: SubjectSpec): string {
  if (decision === 'approved') {
    return `Approved. ${spec.approved} The decision is in the audit log with your name on it.`
  }
  if (decision === 'rejected') {
    return `Rejected. ${spec.rejected} The decision is in the audit log with your name on it.`
  }
  return (
    'Escalated. The item is back at the top of the queue for a super admin, and nothing ' +
    'about the item itself has changed.'
  )
}

/**
 * Column guards and CHECK constraints raise in SQL. Turn the ones a moderator can act on
 * into plain sentences, and pass everything else through so it is not lost.
 */
function explainWrite(message: string, table: string): string {
  if (message.includes('insufficient_privilege') || message.includes('cannot be written')) {
    return (
      'The database refused that write. Vendor status and publication are guarded by ' +
      'app.guard_vendor_columns(), which only accepts a moderator or super admin session — ' +
      'check the role on your account.'
    )
  }
  if (message.includes('violates row-level security')) {
    return 'Your role does not cover this item. Nothing was changed.'
  }
  if (message.includes('violates check constraint')) {
    return `The database rejected that change to ${table}: ${message}`
  }
  return `Could not apply the decision: ${message}`
}

function revalidateItem(id: string): void {
  revalidatePath('/admin/moderation')
  revalidatePath(`/admin/moderation/${id}`)
}
