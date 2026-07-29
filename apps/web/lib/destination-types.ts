import 'server-only'

import type { DestinationCard } from '@/components/destination-slider'

/**
 * Destination wedding settings.
 *
 * Four, deliberately - which is two pages of two. The list was eight; the extra four
 * (backwaters, desert, vineyards, resort) were removed rather than parked below a
 * cut-off, because a slider whose arrows mostly reveal filler teaches people to stop
 * pressing the arrows.
 *
 * Plan section 2 puts "category x locality discovery" in the Must tier, and a
 * destination wedding is the case that breaks it: the couple lives in Lucknow, the
 * wedding is in Udaipur, and the vendor has to travel. `vendors.travels_outstation`
 * exists in the schema for exactly this, which is what these cards search on.
 *
 * The copy names the actual place and the actual constraint - permits, season, the
 * reason people pick it - because "celebrate in paradise" tells a couple nothing they
 * can plan around.
 */
export function getDestinationTypes(citySlug: string): DestinationCard[] {
  const find = (q: string) => `/${citySlug}/photography?q=${encodeURIComponent(q)}`

  /** Variants come from `pnpm images`. The 1920 file is really 1536px wide - the script
      never upscales - so the descriptor states 1536w rather than repeating the filename. */
  const art = (name: string) => ({
    imageUrl: `/${name}-1280.webp`,
    imageSrcSet: `/${name}-768.webp 768w, /${name}-1280.webp 1280w, /${name}-1920.webp 1536w`,
  })

  return [
    {
      slug: 'historical',
      script: 'Wedding at',
      title: 'Historical Places',
      blurb:
        'City Palace in Udaipur, Amber in Jaipur, Falaknuma in Hyderabad. Permits take months and the light at 4pm is the whole reason.',
      href: find('destination heritage palace'),
      ...art('historical'),
    },
    {
      slug: 'temple',
      script: 'Temple',
      title: 'Spiritual Wedding',
      blurb:
        'Guruvayur, Tirupati, Rishikesh by the Ganga. Short ceremonies, strict timings, and photography rules that vary by temple.',
      href: find('temple traditional'),
      ...art('temple'),
    },
    {
      slug: 'beach',
      script: 'Barefoot on',
      title: 'The Beach',
      blurb:
        'Goa, Gokarna, Alibaug. November to February only - the monsoon takes the rest of the year, and sunset decides the muhurat.',
      href: find('destination beach goa'),
      ...art('beach'),
    },
    {
      slug: 'mountains',
      script: 'Dream weddings in',
      title: 'The Mountains',
      blurb:
        'Coorg, Mussoorie, Shillong. Small guest lists because the roads decide, and weather that changes the plan twice a day.',
      href: find('destination hills mountains'),
      ...art('mountain'),
    },
  ]
}
