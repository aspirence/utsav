import Link from 'next/link'

import { PageHeader } from '@/components/admin-ui'
import { getAdminReference } from '@/lib/admin-reference'

import { CreateVendorForm } from './create-form'

export const metadata = { title: 'New listing' }

/**
 * File a new listing — a photographer, caterer, venue, decorator, anyone.
 *
 * Plan §S3 puts this in the field team's hands: they walk into a studio, record what they
 * find, and the listing sits as a draft until a moderator publishes it. There is no
 * self-signup path that skips that.
 *
 * ONE FORM FOR EVERY CATEGORY, not one screen per kind of vendor. A venue and a photographer
 * differ in what they charge for and what they show, but `public.vendors` is one table and the
 * columns are the same for both — the category is a row in vendor_categories, not a schema.
 * Building "Add a caterer" separately from "Add a photographer" would be five copies of this
 * page that have to be kept in step, and a sixth category would need a sixth.
 */
export default async function NewVendorPage() {
  const { cities, categories, isLive } = await getAdminReference()

  return (
    <>
      <PageHeader
        title="New listing"
        description="Everything filed here starts as a draft — not publicly visible, not receiving enquiries — until a moderator publishes it."
        action={
          <Link
            href="/admin/vendors"
            className="border-ink-300 text-ink-800 hover:bg-ink-50 rounded-md border bg-white px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Back to vendors
          </Link>
        }
      />

      {!isLive && (
        <p className="border-warning-500/40 bg-warning-50 text-warning-700 mb-5 rounded-md border px-3 py-2.5 text-sm">
          The cities and categories below are the seed lists, not live data — no Supabase instance
          is attached, so submitting this form will not write anything.
        </p>
      )}

      <div className="max-w-3xl">
        <CreateVendorForm cities={cities} categories={categories} isLive={isLive} />

        {/*
          Two limits an operator will hit, said here rather than discovered.

          The role limit is in the policy: vendors_insert_field admits field_agent and super
          only. A moderator reaching this page will get a clear error on save rather than a
          hidden button, because hiding it would need the console to read the caller's staff
          role for layout purposes and then still be wrong if the role changed mid-session.

          The contact-details limit is the one worth flagging to whoever runs this product:
          the person doing the visit cannot record the vendor's phone number.
        */}
        <section className="border-ink-200 mt-8 border-t pt-5">
          <h2 className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase">
            Two things this form cannot do
          </h2>
          <dl className="text-ink-600 mt-3 space-y-4 text-sm leading-relaxed">
            <div>
              <dt className="text-ink-900 font-medium">Contact details are not on it.</dt>
              <dd className="mt-1 max-w-2xl">
                A vendor&rsquo;s phone, email and WhatsApp live in <code>vendor_private</code>, and
                writes to that table are limited to super admins and finance. A field agent — the
                person actually standing in the studio — cannot write it, so the field is left off
                rather than added and silently ignored. If the field team needs to capture a number
                on the visit, that is a decision about who may hold a vendor&rsquo;s personal number
                before they have agreed to anything, and it needs a policy change rather than a form
                change.
              </dd>
            </div>
            <div>
              <dt className="text-ink-900 font-medium">
                Only field agents and super admins may save.
              </dt>
              <dd className="mt-1 max-w-2xl">
                Moderators approve listings; they do not create them. If you are a moderator, this
                form will refuse on save and say so.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  )
}
