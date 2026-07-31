import type { Metadata } from 'next'

import { Badge, Card, CardBody, Container, LinkButton, SectionHeading } from '@/components/ui'

export const metadata: Metadata = {
  title: 'List your business on Utsava',
  description:
    'Verified enquiries with a budget and a date, capped at five vendors, with honest ' +
    'dashboards. List your photography, venue, decor or catering business on Utsava.',
}

/**
 * Plan §1: "Supply tooling before demand product: the vendor onboarding tool ships in
 * September 2026, seven months before customers arrive, because 3,000 concierge-quality
 * listings are the launch asset."
 *
 * The pitch here is deliberately the plan's own lead-quality thesis, because that is
 * what renewal depends on (§1) and renewal is the model's most sensitive assumption.
 */
export default function PartnerPage() {
  return (
    <>
      <section className="border-b border-ink-100 bg-gradient-to-b from-primary-50/50 to-surface">
        <Container className="py-16 sm:py-20">
          <div className="max-w-3xl">
            <Badge tone="primary" className="mb-5">
              Onboarding photographers in Lucknow and Delhi NCR
            </Badge>
            <h1 className="text-4xl leading-tight text-ink-900 sm:text-5xl">
              Enquiries worth answering. Not a lead dump.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-ink-600">
              Every enquiry you receive is phone-verified and carries a real budget and a
              real date. It goes to at most five vendors — including you. If a lead turns
              out to be junk, tell us and we refund the credit.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/partner/signup" size="lg">
                Get listed
              </LinkButton>
              <LinkButton href="/p/vendor-terms" variant="outline" size="lg">
                Read the vendor terms
              </LinkButton>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-16">
        <SectionHeading
          eyebrow="How it works"
          title="Built around the thing vendors actually complain about"
          description="Lead quality. Everything below exists because bad leads are why vendors stop paying."
        />

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: 'Phone-verified, always',
              body: 'No enquiry reaches you until the customer has passed an OTP. An unverified enquiry is never routed and never billed.',
            },
            {
              title: 'Budget and date, up front',
              body: 'We ask for both before the enquiry is sent, and we only route it to vendors whose price band actually fits.',
            },
            {
              title: 'Five vendors, hard cap',
              body: 'Not ten, not "as many as respond". Five. The cap is enforced in the database, not by a policy someone can override.',
            },
            {
              title: 'Never on a booked date',
              body: 'Block dates in your calendar and we stop routing enquiries for them. Customers can filter for who is genuinely free.',
            },
            {
              title: 'Honest dashboards',
              body: 'Your response time and response rate are computed once and shown to you and to customers identically. No vanity numbers.',
            },
            {
              title: 'Ranking you can reason about',
              body: 'Portfolio completeness, review history, responsiveness, proximity. Your subscription tier is not an input.',
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardBody>
                <h3 className="font-display text-lg text-ink-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{item.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </Container>

      <Container className="pb-20">
        <Card className="bg-ink-900">
          <CardBody className="p-8 sm:p-10">
            <h2 className="font-display text-2xl text-white sm:text-3xl">
              We come to you for the first shoot
            </h2>
            <p className="mt-3 max-w-2xl text-ink-200">
              Our field team photographs your work, writes your profile, and sets your price
              bands with you. You approve it before it goes live. There is no self-serve
              signup form that dumps a half-finished listing onto the platform.
            </p>
            <LinkButton href="/partner/signup" variant="primary" size="lg" className="mt-7">
              Request a visit
            </LinkButton>
          </CardBody>
        </Card>
      </Container>
    </>
  )
}
