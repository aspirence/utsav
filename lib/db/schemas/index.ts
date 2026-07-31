/**
 * Zod schemas.
 *
 * Plan §4: "each feature owns one zod-validated actions.ts". These are the shared
 * shapes that cross package boundaries; feature-local schemas stay with their action.
 *
 * Validation here mirrors the database CHECK constraints deliberately. The database is
 * the authority — these exist to give the user a good error before the round trip, not
 * to be the only gate.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** E.164, matching the profiles/enquiries phone CHECK constraints. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Enter a phone number with country code, e.g. +919845012345')

/** Accepts what an Indian customer actually types and normalises to E.164. */
export const indianPhoneInputSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .transform((v) => {
    if (/^\+/.test(v)) return v
    if (/^0\d{10}$/.test(v)) return `+91${v.slice(1)}`
    if (/^\d{10}$/.test(v)) return `+91${v}`
    if (/^91\d{10}$/.test(v)) return `+${v}`
    return v
  })
  .pipe(phoneSchema)

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slugs are lowercase words joined by hyphens')

/** Plan §5: money is integer paise. Reject anything fractional at the edge. */
export const paiseSchema = z
  .number()
  .int('Amounts must be whole paise')
  .nonnegative('Amounts cannot be negative')

export const eventTypeSchema = z.enum([
  'wedding',
  'engagement',
  'reception',
  'sangeet',
  'mehendi',
  'birthday',
  'anniversary',
  'baby_shower',
  'housewarming',
  'corporate',
  'conference',
  'festival',
  'other',
])

// ---------------------------------------------------------------------------
// Discovery. Plan §2: "Category × locality discovery with price bands and the
// 'free on my date' availability filter".
// ---------------------------------------------------------------------------

export const searchParamsSchema = z.object({
  city: slugSchema,
  category: slugSchema.optional(),
  locality: slugSchema.optional(),
  q: z.string().trim().max(120).optional(),
  styles: z.array(z.string()).max(8).optional(),
  budgetMax: paiseSchema.optional(),
  /** The 'free on my date' filter. */
  freeOn: z.string().date().optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating']).default('relevance'),
  page: z.number().int().min(1).max(200).default(1),
})

export type SearchParams = z.infer<typeof searchParamsSchema>

// ---------------------------------------------------------------------------
// Enquiry. Plan §1: "OTP verification, budget and date capture … are core MVP scope"
// because lead quality is what renewal depends on.
// ---------------------------------------------------------------------------

/**
 * Plan §6 DPDP: consent is captured with purpose limitation, and the exact copy shown
 * is stored on the enquiry so an audit can reproduce what the customer agreed to.
 * Bump the version whenever this wording changes.
 */
export const CONSENT_VERSION = '2026-07-01'
export const CONSENT_TEXT =
  'I agree that Utsava may share my name, phone number and event details with up to ' +
  '5 matching vendors so they can respond to this enquiry, and may contact me about it ' +
  'on WhatsApp, SMS and phone.'

export const enquiryDraftSchema = z
  .object({
    categorySlug: slugSchema,
    citySlug: slugSchema,
    localitySlug: slugSchema.optional(),

    eventType: eventTypeSchema,
    eventDate: z.string().date().optional(),
    dateFlexible: z.boolean().default(false),
    guestCount: z.number().int().positive().max(100_000).optional(),

    // Plan §2: budget capture is part of verification, not an optional extra.
    budgetMin: paiseSchema.optional(),
    budgetMax: paiseSchema,

    stylePreferences: z.array(z.string()).max(8).default([]),
    message: z.string().trim().max(2000).optional(),

    contactName: z.string().trim().min(2, 'Please enter your name').max(120),
    contactPhone: indianPhoneInputSchema,
    contactEmail: z.string().email().optional().or(z.literal('')),

    consentGiven: z.literal(true, {
      errorMap: () => ({ message: 'We need your consent before contacting vendors' }),
    }),
  })
  .refine((v) => !v.budgetMin || v.budgetMin <= v.budgetMax, {
    message: 'Minimum budget cannot exceed the maximum',
    path: ['budgetMin'],
  })
  .refine((v) => v.dateFlexible || Boolean(v.eventDate), {
    message: 'Pick a date, or tell us your dates are flexible',
    path: ['eventDate'],
  })

export type EnquiryDraft = z.infer<typeof enquiryDraftSchema>

export const otpVerifySchema = z.object({
  enquiryId: z.string().uuid(),
  phone: indianPhoneInputSchema,
  token: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

// ---------------------------------------------------------------------------
// Vendor-side. Plan §S3: the portfolio-first profile editor the field team uses.
// ---------------------------------------------------------------------------

export const vendorProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  about: z.string().trim().max(4000).optional(),
  establishedYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .optional(),
  teamSize: z.number().int().positive().max(500).optional(),
  travelsOutstation: z.boolean().default(false),
  localitySlug: slugSchema.optional(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  instagramHandle: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._]{1,30}$/, 'Instagram handles are letters, numbers, dots and underscores')
    .optional()
    .or(z.literal('')),
  priceBandMin: paiseSchema.optional(),
  priceBandMax: paiseSchema.optional(),
})

/** Plan §2: package cards normalise to per-day pricing. price_per_day is generated. */
export const packageSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  categorySlug: slugSchema,
  styleTags: z.array(z.string()).max(8).default([]),
  price: paiseSchema.refine((v) => v > 0, 'A package needs a price'),
  pricingUnit: z.enum(['per_day', 'per_event', 'per_plate', 'per_person', 'per_hour']),
  durationDays: z.number().positive().max(30).default(1),
  crewSize: z.number().int().positive().max(100).optional(),
  editedPhotoCount: z.number().int().nonnegative().optional(),
  deliveryDays: z.number().int().positive().max(365).optional(),
  deliverables: z.array(z.string().max(120)).max(20).default([]),
  inclusions: z.array(z.string().max(120)).max(20).default([]),
  exclusions: z.array(z.string().max(120)).max(20).default([]),
})

export const leadResponseSchema = z.object({
  leadId: z.string().uuid(),
  action: z.enum(['viewed', 'responded', 'quoted']),
  note: z.string().trim().max(1000).optional(),
})

// ---------------------------------------------------------------------------
// Reviews. Plan §2: booking-gated.
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  ratingQuality: z.number().int().min(1).max(5).optional(),
  ratingValue: z.number().int().min(1).max(5).optional(),
  ratingPunctuality: z.number().int().min(1).max(5).optional(),
  ratingProfessionalism: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(20, 'Tell other couples a little more').max(4000),
})

// ---------------------------------------------------------------------------
// Analytics. Plan §10: the funnel event names are a contract — vendor dashboards and
// board dashboards read the same semantic definitions "so the numbers always match".
// ---------------------------------------------------------------------------

export const ANALYTICS_EVENTS = {
  discover: ['search_performed', 'listing_viewed', 'shortlist_added'],
  enquire: ['enquiry_submitted', 'otp_verified', 'lead_qualified'],
  match: ['lead_routed', 'vendor_viewed_lead', 'vendor_responded'],
  transact: ['quote_sent', 'booking_initiated', 'escrow_paid', 'booking_completed'],
  trust: ['review_requested', 'review_published', 'story_published', 'dispute_opened'],
  monetise: ['subscription_started', 'subscription_renewed', 'invoice_paid'],
} as const

export type AnalyticsStage = keyof typeof ANALYTICS_EVENTS
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[AnalyticsStage][number]

export const analyticsEventSchema = z.object({
  name: z.string().min(1).max(64),
  vendorId: z.string().uuid().optional(),
  enquiryId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  properties: z.record(z.unknown()).default({}),
})
