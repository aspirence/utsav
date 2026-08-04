import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Container } from '@/components/ui'

/**
 * CMS pages. Plan §5 lists cms_pages; plan §S9 ships the content tooling that fills it.
 * Until the admin console lands, the legally required pages are held here so the site
 * has no broken links — the same slugs the seed inserts into cms_pages.
 */

type Props = { params: Promise<{ slug: string }> }

interface StaticPage {
  title: string
  intro: string
  sections: { heading: string; body: string }[]
}

const PAGES: Record<string, StaticPage> = {
  'anchor-studio-policy': {
    title: 'Our studio on Fremmo',
    intro:
      "Fremmo's founder operates a photography studio that lists on this platform. " +
      'We think you should know that before you use it, so here is exactly how it works ' +
      'and how we keep ourselves honest.',
    sections: [
      {
        heading: 'It is disclosed everywhere it appears',
        body:
          'Fremmo Studio carries a visible badge on its profile, on every search result card, ' +
          'and in every enquiry it receives. There is no version of this platform where you ' +
          'encounter it without being told who owns it.',
      },
      {
        heading: 'It gets no ranking preference',
        body:
          'Search ranking is computed by a single database function that takes portfolio ' +
          'completeness, review history, responsiveness and distance as inputs. It has no ' +
          'access to vendor ownership at all — it is not passed a vendor identifier, so it ' +
          'physically cannot look one up. An automated test in our CI pipeline fails the ' +
          'build if anyone adds such a reference.',
      },
      {
        heading: 'It takes overflow work only',
        body:
          'The studio is capped at roughly 5% of bookings in the photography category. ' +
          'Its role is to keep supply available on dates when independent studios are ' +
          'already booked, not to compete with them for the same work.',
      },
      {
        heading: 'Why it exists at all',
        body:
          'It funds the platform through its first year and produces the real-wedding ' +
          'galleries we launch with. It is also our own first customer: every feature a ' +
          'vendor uses — the lead inbox, the calendar, quotes, reviews and escrow — is ' +
          'used in anger by our own team before we ask anyone else to rely on it.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro:
      'How Fremmo collects, uses and protects your personal data under the Digital Personal ' +
      'Data Protection Act.',
    sections: [
      {
        heading: 'What we collect and why',
        body:
          'When you send an enquiry we collect your name, phone number, event date, city and ' +
          'budget. We verify the phone number with a one-time password. That information exists ' +
          'for one purpose: letting matching vendors respond to your enquiry.',
      },
      {
        heading: 'Who we share it with',
        body:
          'Your enquiry is shared with at most five vendors matching your category, city, date ' +
          'and budget. We tell you this before you submit, and the exact consent wording you ' +
          'agreed to is stored alongside your enquiry. We do not sell your details, and we do ' +
          'not share them with anyone else.',
      },
      {
        heading: 'When vendors see your number',
        body:
          'A vendor sees your phone number only after they open your enquiry. If a vendor never ' +
          'opens it, or if the enquiry expires, they never see it. If we refund a vendor for a ' +
          'mis-routed enquiry, their access to your details is withdrawn.',
      },
      {
        heading: 'Deletion',
        body:
          'You can request deletion of your account and personal data at any time, and we honour ' +
          'it within the statutory window. Some booking and tax records are retained where law ' +
          'requires it.',
      },
    ],
  },
  terms: {
    title: 'Terms of Use',
    intro: 'The terms governing use of the Fremmo platform by customers and vendors.',
    sections: [
      {
        heading: 'What Fremmo is',
        body:
          'Fremmo is a discovery and booking marketplace. Contracts for services are between ' +
          'you and the vendor. We are not a party to them.',
      },
      {
        heading: 'Prices',
        body:
          'Price bands and packages are declared by vendors and shown as-is. Final pricing is ' +
          'confirmed in a quote from the vendor.',
      },
      {
        heading: 'Reviews',
        body:
          'Only a customer with a completed booking made through Fremmo can leave a review, and ' +
          'exactly one review per booking. Vendors have a right of reply. Vendors cannot edit, ' +
          'hide or remove a review.',
      },
    ],
  },
  'vendor-terms': {
    title: 'Vendor Agreement',
    intro: 'Listing, lead, subscription and payout terms for vendors on Fremmo.',
    sections: [
      {
        heading: 'Leads',
        body:
          'Every enquiry is phone-verified and carries a budget and a date before it reaches ' +
          'you. Each enquiry goes to at most five vendors. If an enquiry is junk, tell us and ' +
          'we refund the credit.',
      },
      {
        heading: 'Ranking',
        body:
          'Ranking is based on portfolio completeness, review history, responsiveness and ' +
          'proximity. Subscription tier does not affect ranking.',
      },
      {
        heading: 'Payouts',
        body:
          'Once escrow is live, payouts require verified KYC (PAN and, where applicable, GSTIN) ' +
          'and are released after the event completes.',
      },
    ],
  },
}

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = PAGES[slug]
  if (!page) return {}
  return { title: page.title, description: page.intro.slice(0, 155) }
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params
  const page = PAGES[slug]
  if (!page) notFound()

  return (
    <Container className="py-14">
      <article className="mx-auto max-w-2xl">
        <h1 className="text-ink-900 text-3xl sm:text-4xl">{page.title}</h1>
        <p className="text-ink-600 mt-4 text-lg leading-relaxed">{page.intro}</p>

        <div className="mt-10 space-y-8">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-ink-900 text-xl">{section.heading}</h2>
              <p className="text-ink-700 mt-2 leading-relaxed">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </Container>
  )
}
