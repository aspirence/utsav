import { formatPaise } from '@/lib/db'
import {
  CATEGORY_ATTRIBUTES,
  type AttributeField,
  type AttributeMap,
  type AttributeValue,
} from '@/lib/category-attributes'

/**
 * The half of a listing that differs by what it actually is.
 *
 * Everything else on a vendor profile — name, about, price band, team size — is true of a
 * photographer, a caterer and a banquet lawn alike, and decides nothing. What a couple
 * actually chooses on is the seated capacity, the per-plate rate, whether the artist travels
 * to the venue on the morning. Staff have been able to enter those since migration
 * 20260730000300; until now no public page read the column, so the answers went into the
 * database and stopped there.
 *
 * ONE DEFINITION LIST, SHARED WITH THE FORM. The labels, units and types come from
 * lib/category-attributes.ts — the same constant the console form renders from and the same
 * one its server action validates against. A separate display list here would drift, and the
 * failure mode of drift is a number labelled as the wrong thing.
 *
 * UNANSWERED FIELDS ARE OMITTED, not shown empty. A public profile is a sales page: a grid
 * half full of dashes reads as a vendor who could not be bothered, when the truth is usually
 * that the question does not apply to them.
 *
 * BOOLEANS ARE SPLIT INTO YES AND NO, and both are kept. "Outside caterer allowed: no" is
 * exactly the kind of thing a couple needs before they visit — dropping the negatives would
 * make the section flattering and useless.
 */
export function VendorCategoryDetails({
  categorySlug,
  categoryName,
  attributes,
}: {
  categorySlug: string
  categoryName: string
  attributes: AttributeMap
}) {
  const set = CATEGORY_ATTRIBUTES[categorySlug]
  if (!set) return null

  const answered = set.fields.filter((f) => isAnswered(attributes[f.key]))
  if (answered.length === 0) return null

  const facts = answered.filter((f) => f.type !== 'boolean')
  const flags = answered.filter((f) => f.type === 'boolean')

  return (
    <section className="mt-12">
      <h2 className="font-display text-ink-900 text-2xl">{categoryName} details</h2>
      <p className="text-ink-600 mt-1.5 max-w-2xl text-sm leading-relaxed">{set.intro}</p>

      {facts.length > 0 && (
        <dl className="border-ink-100 mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-6 sm:grid-cols-3 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.key}>
              <dt className="text-ink-500 text-xs tracking-wide uppercase">{f.label}</dt>
              <dd className="font-display text-ink-900 mt-1 text-lg leading-snug">
                {formatValue(f, attributes[f.key]!)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {flags.length > 0 && (
        <ul className="border-ink-100 mt-6 flex flex-wrap gap-x-6 gap-y-2.5 border-t pt-6 text-sm">
          {flags.map((f) => {
            const on = attributes[f.key] === true
            return (
              <li key={f.key} className="text-ink-700 flex items-center gap-2">
                {/* aria-hidden on the glyph: the yes/no is already carried by the text that
                    follows it, and a screen reader announcing "check mark" adds nothing. */}
                <span aria-hidden="true" className={on ? 'text-success-700' : 'text-ink-500'}>
                  {on ? '✓' : '✕'}
                </span>
                <span className={on ? '' : 'text-ink-500'}>
                  {f.label}
                  <span className="sr-only">{on ? ': yes' : ': no'}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * `false` is an answer; empty is not.
 *
 * A plain falsy check would hide "alcohol permitted: no" and "outside caterer: no" — the two
 * facts most likely to rule a venue out, and therefore the two a couple most needs before
 * they drive across the city to see it.
 */
function isAnswered(v: AttributeValue | undefined): boolean {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

function formatValue(field: AttributeField, value: AttributeValue): string {
  switch (field.type) {
    // Integer paise in the column (plan §5), rupees on the page. compact, because these are
    // lakh-scale figures and "₹1.8 L" is read faster than "₹1,80,000".
    case 'money':
      return typeof value === 'number' ? formatPaise(value, { compact: true }) : String(value)

    case 'number':
      return field.unit ? `${value} ${field.unit}` : String(value)

    case 'tags':
      return Array.isArray(value) ? value.join(' · ') : String(value)

    default:
      return String(value)
  }
}
