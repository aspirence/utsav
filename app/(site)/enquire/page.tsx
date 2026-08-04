import type { Metadata } from 'next'

import { Container } from '@/components/ui'

import { getCategories, getLaunchedCities, getVendorBySlug } from '@/lib/queries'

import { EnquiryForm } from './enquiry-form'

export const metadata: Metadata = {
  title: 'Send an enquiry',
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function EnquirePage({ searchParams }: Props) {
  const params = await searchParams
  const vendorSlug = typeof params.vendor === 'string' ? params.vendor : undefined

  const [cities, categories, vendor] = await Promise.all([
    getLaunchedCities(),
    getCategories(),
    vendorSlug ? getVendorBySlug(vendorSlug) : Promise.resolve(null),
  ])

  const defaultCategory = vendor?.categorySlug ?? categories[0]?.slug ?? 'photography'
  const defaultCity = vendor?.citySlug ?? cities[0]?.slug ?? 'lucknow'
  const styleTags = categories.find((c) => c.slug === defaultCategory)?.styleTags ?? []

  return (
    <Container className="py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        {/* text-2xl on a phone. At text-3xl a vendor name pushed "Check X's availability" onto
            three lines before the form even started. */}
        <h1 className="font-display text-ink-900 text-2xl leading-tight sm:text-3xl lg:text-4xl">
          {vendor ? `Check ${vendor.displayName}'s availability` : 'Tell us about your event'}
        </h1>
        <p className="text-ink-600 mt-3 text-sm leading-relaxed sm:text-base">
          {vendor
            ? `We will pass this to ${vendor.displayName} and, if you want options, up to four more vendors who match.`
            : 'We will send this to at most five vendors who match your category, date and budget.'}
        </p>

        <div className="mt-8 sm:mt-10">
          <EnquiryForm
            cities={cities.map((c) => ({ slug: c.slug, name: c.name }))}
            categories={categories.map((c) => ({ slug: c.slug, name: c.pluralName }))}
            styleTags={styleTags}
            defaultCity={defaultCity}
            defaultCategory={defaultCategory}
            {...(vendor ? { vendorName: vendor.displayName } : {})}
          />
        </div>
      </div>
    </Container>
  )
}
