'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  NotSuperAdmin,
  ResellerConflict,
  assignCustomer,
  createReseller,
  findAssignableAccounts,
  markCommissionPaid,
  releaseCustomer,
  setResellerStatus,
  updateResellerRate,
  type AssignableAccount,
} from '@/lib/resellers'

/**
 * The six things /admin/resellers can do, each behind its own zod schema.
 *
 * NONE OF THESE CHECK WHO IS CALLING, and that is the same deliberate shape
 * app/admin/(console)/users/actions.ts describes. Every one of them lands in lib/resellers.ts,
 * where `requireSuper()` runs before the service-role key is touched. Putting the check here as
 * well would give two places to keep in step and would make it possible to add a seventh action
 * that has one but not the other — and on this path the service-role key bypasses RLS entirely,
 * so a missed check is not caught by a policy further down.
 *
 * The pages do call `notFound()` for a non-super staff member, but that is so the screen is
 * honest about not being theirs. It is not what refuses the write.
 *
 * ERRORS COME BACK AS STATE RATHER THAN THROWN, because these drive `useActionState` forms and a
 * thrown error there is an error boundary swallowing the reason. NotSuperAdmin and
 * ResellerConflict carry sentences written to be read by the person who pressed the button —
 * "release them from their current reseller first" rather than
 * `reseller_customers_one_live_owner`. Anything else is reported generically: an unexpected
 * Postgres message on a screen that decides who gets paid is more likely to be a leak than a help.
 *
 * ── WHY SEVERAL SCHEMAS CARRY A resellerId THEY DO NOT USE ───────────────────
 * `releaseCustomerAction` and `markSettledAction` identify their subject by assignment id and
 * commission id; the reseller is already implied by the row. The extra field exists only so this
 * file knows which detail page to `revalidatePath`. It is a cache hint, never an authorization
 * input — lib/resellers.ts re-reads the row it is about to touch and never trusts a caller's
 * claim about who owns it.
 */

export interface ResellerActionState {
  error?: string
  notice?: string
}

const STATUSES = ['active', 'suspended', 'closed'] as const

/**
 * A rate, as a form posts it.
 *
 * Parsed as a digit string rather than with `z.coerce.number()`, which turns an empty field into
 * NaN and reports "expected number, received nan" — true, and useless to somebody who left a box
 * blank. The regex also refuses "2.5", which is the mistake this field exists to catch: the label
 * says basis points, and a person who types the percentage anyway should be told so rather than
 * silently given 2 bps.
 *
 * 10000 is the check constraint's own ceiling (100%). assertBps() in lib/resellers.ts repeats
 * this, and both are repeating the database — this copy is here so the message is a sentence.
 */
const bpsField = z
  .string()
  .trim()
  .regex(/^\d{1,5}$/, 'A rate is a whole number of basis points — 250 is 2.5%, not 2.5.')
  .transform(Number)
  .refine((n) => n <= 10000, 'A rate cannot be more than 10000 basis points, which is 100%.')

/** Every write here is audited, and this is the free-text half of the audit row. */
const reasonField = z.string().trim().max(300).optional()

const createSchema = z.object({
  profileId: z.string().uuid('Pick an account from the search results.'),
  displayName: z.string().trim().min(2, 'A reseller needs a name.').max(120),
  commissionBps: bpsField,
  // Both contacts are optional, and both mirror a check constraint rather than inventing a rule:
  // resellers_email_shape and resellers_phone_format. Failing here means one message; failing in
  // Postgres means explainWrite() translating a constraint name.
  contactEmail: z.string().trim().email('That email address does not look right.').optional(),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'A phone number goes in +91… international form.')
    .optional(),
  notes: z.string().trim().max(1000).optional(),
})

const rateSchema = z.object({
  resellerId: z.string().uuid(),
  commissionBps: bpsField,
  reason: reasonField,
})

const statusSchema = z.object({
  resellerId: z.string().uuid(),
  status: z.enum(STATUSES),
  reason: reasonField,
})

const assignSchema = z.object({
  resellerId: z.string().uuid(),
  customerId: z.string().uuid('Pick an account from the search results.'),
  reason: reasonField,
})

const releaseSchema = z.object({
  assignmentId: z.string().uuid(),
  resellerId: z.string().uuid(),
  reason: reasonField,
})

const settleSchema = z.object({
  commissionId: z.string().uuid(),
  resellerId: z.string().uuid(),
  /*
   * Required, not optional, and the lib refuses a blank one too.
   *
   * Money leaves the company through a bank transfer somebody made out of band. This row is the
   * note that it happened, and a 'paid' row nobody can reconcile against a UTR is not a record —
   * it is a claim.
   */
  settlementRef: z
    .string()
    .trim()
    .min(3, 'A settlement needs a reference — the UTR, the bank reference or the invoice number.')
    .max(120),
  reason: reasonField,
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createResellerAction(
  _prev: ResellerActionState,
  form: FormData,
): Promise<ResellerActionState> {
  const parsed = createSchema.safeParse({
    profileId: text(form.get('profileId')),
    displayName: text(form.get('displayName')),
    commissionBps: text(form.get('commissionBps')) ?? '',
    contactEmail: text(form.get('contactEmail')),
    contactPhone: text(form.get('contactPhone')),
    notes: text(form.get('notes')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check those details.' }
  }

  let created: { id: string; code: string }
  try {
    created = await createReseller({
      profileId: parsed.data.profileId,
      displayName: parsed.data.displayName,
      commissionBps: parsed.data.commissionBps,
      contactEmail: parsed.data.contactEmail ?? null,
      contactPhone: parsed.data.contactPhone ?? null,
      notes: parsed.data.notes ?? null,
    })
  } catch (error) {
    return { error: message(error) }
  }

  revalidatePath('/admin/resellers')
  // The code is minted server-side and is the thing that goes on a statement, so it is the one
  // piece of the result worth putting in front of the operator rather than making them find.
  return { notice: `${parsed.data.displayName} created as ${created.code}.` }
}

export async function updateRateAction(
  _prev: ResellerActionState,
  form: FormData,
): Promise<ResellerActionState> {
  const parsed = rateSchema.safeParse({
    resellerId: text(form.get('resellerId')),
    commissionBps: text(form.get('commissionBps')) ?? '',
    reason: text(form.get('reason')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check that rate.' }
  }

  try {
    await updateResellerRate({
      resellerId: parsed.data.resellerId,
      commissionBps: parsed.data.commissionBps,
      reason: parsed.data.reason ?? null,
    })
  } catch (error) {
    return { error: message(error) }
  }

  revalidate(parsed.data.resellerId)
  // Says out loud what the write did *not* do. A rate change looks retroactive to anybody who has
  // not read the migration, and the first question after pressing this is always "does that
  // change last quarter's statement".
  return {
    notice: `Rate is now ${parsed.data.commissionBps} bps. Orders already placed keep the rate they were placed at.`,
  }
}

export async function updateStatusAction(
  _prev: ResellerActionState,
  form: FormData,
): Promise<ResellerActionState> {
  const parsed = statusSchema.safeParse({
    resellerId: text(form.get('resellerId')),
    status: text(form.get('status')),
    reason: text(form.get('reason')),
  })
  if (!parsed.success) return { error: 'Could not work out which status to set.' }

  try {
    await setResellerStatus({
      resellerId: parsed.data.resellerId,
      status: parsed.data.status,
      reason: parsed.data.reason ?? null,
    })
  } catch (error) {
    return { error: message(error) }
  }

  revalidate(parsed.data.resellerId)
  return { notice: STATUS_NOTICE[parsed.data.status] }
}

export async function assignCustomerAction(
  _prev: ResellerActionState,
  form: FormData,
): Promise<ResellerActionState> {
  const parsed = assignSchema.safeParse({
    resellerId: text(form.get('resellerId')),
    customerId: text(form.get('customerId')),
    reason: text(form.get('reason')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Pick an account to assign.' }
  }

  try {
    await assignCustomer({
      resellerId: parsed.data.resellerId,
      customerId: parsed.data.customerId,
      reason: parsed.data.reason ?? null,
    })
  } catch (error) {
    return { error: message(error) }
  }

  revalidate(parsed.data.resellerId)
  return { notice: 'Assigned. Their next invitation order pays this reseller.' }
}

export async function releaseCustomerAction(
  _prev: ResellerActionState,
  form: FormData,
): Promise<ResellerActionState> {
  const parsed = releaseSchema.safeParse({
    assignmentId: text(form.get('assignmentId')),
    resellerId: text(form.get('resellerId')),
    reason: text(form.get('reason')),
  })
  if (!parsed.success) return { error: 'Could not work out which assignment to release.' }

  try {
    await releaseCustomer({
      assignmentId: parsed.data.assignmentId,
      reason: parsed.data.reason ?? null,
    })
  } catch (error) {
    return { error: message(error) }
  }

  revalidate(parsed.data.resellerId)
  return {
    notice: 'Released. Commission already earned is untouched; future orders are not attributed.',
  }
}

export async function markSettledAction(
  _prev: ResellerActionState,
  form: FormData,
): Promise<ResellerActionState> {
  const parsed = settleSchema.safeParse({
    commissionId: text(form.get('commissionId')),
    resellerId: text(form.get('resellerId')),
    settlementRef: text(form.get('settlementRef')) ?? '',
    reason: text(form.get('reason')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check that settlement reference.' }
  }

  try {
    await markCommissionPaid({
      commissionId: parsed.data.commissionId,
      settlementRef: parsed.data.settlementRef,
      reason: parsed.data.reason ?? null,
    })
  } catch (error) {
    return { error: message(error) }
  }

  revalidate(parsed.data.resellerId)
  return { notice: `Recorded as settled under ${parsed.data.settlementRef}.` }
}

/**
 * Account lookup for the create and assign forms. Read-only, and RLS-scoped like every other
 * console read — it runs on the operator's own session, not the service-role key.
 */
export async function searchAssignableAccounts(query: string): Promise<AssignableAccount[]> {
  return findAssignableAccounts(query)
}

// ---------------------------------------------------------------------------

/**
 * Both screens, always.
 *
 * Every write here changes a number on the index as well as on the detail page — a rate change
 * moves the index's rate column, a settlement moves the money split and the analytics block. The
 * index is `force-dynamic`, so this costs nothing beyond correctness, and revalidating only the
 * page the operator is standing on is the reliable way to leave a stale total behind them.
 */
function revalidate(resellerId: string): void {
  revalidatePath('/admin/resellers')
  revalidatePath(`/admin/resellers/${resellerId}`)
}

/**
 * What each status actually does, said at the moment it is set.
 *
 * These are the migration's definitions rather than this file's: app.my_reseller_id() and
 * app.reseller_for_customer() both filter on `status = 'active'`, so suspension is a lockout and
 * an attribution stop in one write, and the difference between suspension and non-payment is that
 * commission already accrued stays payable.
 */
const STATUS_NOTICE: Record<(typeof STATUSES)[number], string> = {
  active: 'Active. New orders from their customers are attributed again.',
  suspended:
    'Suspended. Their dashboard is closed and new orders stop being attributed; commission already earned stays payable.',
  closed: 'Closed. This is final — working with them again means a new reseller record.',
}

function message(error: unknown): string {
  if (error instanceof NotSuperAdmin || error instanceof ResellerConflict) return error.message
  return 'That did not go through. Try again, and check the audit log if it half-worked.'
}

function text(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}
