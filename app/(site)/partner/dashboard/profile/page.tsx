import { formatPriceBand } from '@/lib/db'
import { Badge, Button, Card, CardBody } from '@/components/ui'

import { getVendorBySlug } from '@/lib/queries'

/**
 * Profile editor. Plan §S3: "vendor onboarding tool v1 in field hands — portfolio-first
 * profile editor, photo capture, price bands."
 *
 * The completeness meter mirrors app.refresh_vendor_stats() exactly. That is deliberate:
 * the score decides is_seo_eligible, which decides whether the listing is indexable AND
 * whether app.route_enquiry() will send it leads at all. A vendor who does not
 * understand why they get no leads is a vendor who does not renew (plan §1), so the
 * scoring is shown openly rather than hidden behind "improve your profile".
 */
export default async function PartnerProfilePage() {
  const vendor = await getVendorBySlug('lightleak-studio')
  if (!vendor) return null

  const photos = vendor.gallery.length
  const hasAbout = vendor.about.length >= 120
  const hasBand = vendor.priceBandLabel !== 'Price on request'
  const hasLocality = Boolean(vendor.localityName)
  const hasPackage = vendor.packages.length > 0
  const hasStyles = vendor.styleTags.length > 0

  const checks = [
    { label: 'A description of at least 120 characters', points: 15, done: hasAbout },
    { label: 'A price band', points: 20, done: hasBand },
    { label: 'A locality', points: 10, done: hasLocality },
    {
      label: `Portfolio photos (${Math.min(photos, 10)}/10 counted)`,
      points: 30,
      done: photos >= 10,
      partial: Math.min(30, photos * 3),
    },
    { label: 'At least one package', points: 15, done: hasPackage },
    { label: 'Style tags', points: 10, done: hasStyles },
  ]

  const score = checks.reduce(
    (sum, c) => sum + (c.partial !== undefined ? c.partial : c.done ? c.points : 0),
    0,
  )
  const eligible = photos >= 5 && hasBand && score >= 60

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-ink-900 text-2xl">Your listing</h1>
        <p className="text-ink-600 mt-1.5">
          This is what customers see, and what decides whether we can send you leads.
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-ink-900 text-lg">Profile completeness</h2>
            <Badge tone={eligible ? 'success' : 'warning'}>
              {eligible ? 'Live and receiving leads' : 'Not yet eligible'}
            </Badge>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="bg-ink-100 h-2.5 flex-1 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${eligible ? 'bg-success-600' : 'bg-accent-500'}`}
                style={{ width: `${Math.min(100, score)}%` }}
              />
            </div>
            <span className="font-display text-ink-900 text-xl">{score}</span>
          </div>

          <p className="text-ink-600 mt-2 text-sm">
            You need <strong>60 points and at least 5 photos</strong> to appear in search and start
            receiving enquiries.
          </p>

          <ul className="mt-4 space-y-2">
            {checks.map((c) => {
              const earned = c.partial !== undefined ? c.partial : c.done ? c.points : 0
              return (
                <li key={c.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                        earned === c.points
                          ? 'bg-success-600 text-white'
                          : earned > 0
                            ? 'bg-accent-400 text-white'
                            : 'bg-ink-200 text-ink-500'
                      }`}
                    >
                      {earned === c.points ? '✓' : ''}
                    </span>
                    <span className={earned === c.points ? 'text-ink-600' : 'text-ink-900'}>
                      {c.label}
                    </span>
                  </span>
                  <span className="text-ink-500 shrink-0 tabular-nums">
                    {earned}/{c.points}
                  </span>
                </li>
              )
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-display text-ink-900 text-lg">Details</h2>

          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ['Business name', vendor.displayName],
              ['Category', vendor.categoryName],
              ['Locality', vendor.localityName ?? 'Not set'],
              ['Established', vendor.establishedYear ? String(vendor.establishedYear) : 'Not set'],
              ['Team size', vendor.teamSize ? `${vendor.teamSize} people` : 'Not set'],
              ['Price band', vendor.priceBandLabel],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-ink-500 text-xs tracking-wide uppercase">{label}</dt>
                <dd className="text-ink-900 mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p className="text-ink-500 text-xs tracking-wide uppercase">Style tags</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {vendor.styleTags.map((t) => (
                <Badge key={t} tone="accent" className="capitalize">
                  {t.replace(/-/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="text-ink-500 text-xs tracking-wide uppercase">About</p>
            <p className="text-ink-700 mt-1.5 leading-relaxed">{vendor.about}</p>
          </div>

          <Button variant="outline">Edit details</Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-display text-ink-900 text-lg">Packages</h2>
          <p className="text-ink-600 mt-1 text-sm">
            Every package shows customers a per-day price so they can compare you against a
            three-day quote fairly.
          </p>
          <div className="mt-4 space-y-3">
            {vendor.packages.map((p) => (
              <div
                key={p.name}
                className="border-ink-100 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="text-ink-900 font-medium">{p.name}</p>
                  <p className="text-ink-500 text-sm">
                    {p.durationDays} {p.durationDays === 1 ? 'day' : 'days'}
                    {p.crewSize ? ` · ${p.crewSize} crew` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-ink-900 text-lg">{p.priceLabel}</p>
                  <p className="text-ink-500 text-xs">{p.perDayLabel}</p>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-4">
            Add a package
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-display text-ink-900 text-lg">Portfolio</h2>
          <p className="text-ink-600 mt-1 text-sm">
            {photos} photos. {formatPriceBand(null, null) === 'Price on request' ? '' : ''}
            Customers spend most of their time here — it is the single biggest driver of whether
            they enquire.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {vendor.gallery.slice(0, 12).map((img, i) => (
              <div
                key={i}
                className="u-media u-media-fallback aspect-square rounded"
                aria-label={img.alt}
              />
            ))}
          </div>
          <Button variant="outline" className="mt-4">
            Upload photos
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
