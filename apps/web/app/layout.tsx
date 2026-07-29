import type { Metadata, Viewport } from 'next'
import { Playfair_Display } from 'next/font/google'

import './globals.css'

/**
 * Display face. next/font downloads Playfair at build time and serves it from our own
 * origin, so there is no request to fonts.gstatic.com at runtime - plan §13 measures LCP
 * on 4G and a third-party font handshake is exactly the kind of thing that blows it.
 *
 * `display: 'swap'` means text paints in the fallback immediately and reflows when the
 * real face lands, rather than holding the headline invisible.
 *
 * Weights are deliberately light. Playfair at 600+ is heavier than the Georgia fallback it
 * replaces; 400 and 500 are what give it the thin, high-contrast look it is chosen for.
 */
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Root layout — the document shell only.
 *
 * Deliberately carries no header, footer or navigation. Two very different surfaces sit
 * underneath it: the customer site in the (site) route group, and the staff console at
 * /admin. Putting the public chrome here would leak it into the admin panel, and a
 * moderator who cannot instantly tell which surface they are on is a moderator who
 * eventually suspends the wrong listing.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Utsava — find and book wedding & event vendors in India',
    template: '%s · Utsava',
  },
  description:
    'Discover photographers, venues, decorators and caterers by locality and price band. ' +
    'See real portfolios, compare packages per day, and enquire with vendors who are free on your date.',
  openGraph: { type: 'website', siteName: 'Utsava', locale: 'en_IN' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#B3402B',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={playfair.variable}>
      <body>{children}</body>
    </html>
  )
}
