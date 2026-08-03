import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'

import './globals.css'

/**
 * The typeface — singular.
 *
 * There used to be two: Playfair Display for headings and whatever the browser resolved
 * `Inter` to for everything else. The discovery-wall redesign replaced that pairing with one
 * geometric humanist sans carrying the whole interface, headings included, so a page reads as
 * one system rather than as an editorial serif sitting on top of UI text.
 *
 * DM Sans, because the reference face (Neue Plak) is not licensable here and DM Sans is its
 * closest free equivalent — same geometric skeleton, same generous x-height, and it holds up
 * at the 14px that most of this interface is set in.
 *
 * next/font downloads it at build time and serves it from our own origin, so there is no
 * request to fonts.gstatic.com at runtime — plan §13 measures LCP on 4G and a third-party font
 * handshake is exactly the kind of thing that blows it.
 *
 * `display: 'swap'` paints text in the fallback immediately and reflows when the real face
 * lands, rather than holding the headline invisible.
 *
 * Three weights and no more: 400 body, 600 titles and controls, 700 headings. Every extra
 * weight is another file on the critical path for a distinction nobody asked for.
 */
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-dm-sans',
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
    default: 'Fremmo — find and book wedding & event vendors in India',
    template: '%s · Fremmo',
  },
  description:
    'Discover photographers, venues, decorators and caterers by locality and price band. ' +
    'See real portfolios, compare packages per day, and enquire with vendors who are free on your date.',
  openGraph: { type: 'website', siteName: 'Fremmo', locale: 'en_IN' },
  robots: { index: true, follow: true },

  /*
   * Home-screen install, iOS side. The manifest at app/manifest.ts covers Android and desktop;
   * Safari still reads these three.
   *
   * `statusBarStyle: 'default'` keeps dark text on the light canvas. 'black-translucent' is the
   * one that looks tempting and is nearly always wrong — it puts the status bar *on top of* the
   * page rather than above it, so the clock lands in whatever the first 44px happen to be
   * unless every screen is designed around it.
   */
  appleWebApp: {
    capable: true,
    title: 'Fremmo',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

/**
 * `viewportFit: 'cover'` is load-bearing, not cosmetic.
 *
 * It lets the document extend under the notch and the home indicator, which is what makes
 * `env(safe-area-inset-*)` resolve to a real number. Without it every one of those insets is
 * 0px, and the bottom bar, the safe-area utilities in globals.css and the sticky headers all
 * quietly render the broken version — labels under the home indicator, no error anywhere.
 *
 * It is also what makes the page fill the screen when launched from the home screen, rather
 * than sitting in a letterbox with white bars top and bottom.
 *
 * NO `maximumScale` OR `userScalable: false`. Locking zoom is the usual next line here and it
 * is an accessibility failure: pinch-zoom is how a partially sighted person reads a price. The
 * double-tap-zoom delay it is normally added to avoid is handled per-control with
 * `touch-manipulation` instead — see components/bottom-nav.tsx.
 */
export const viewport: Viewport = {
  themeColor: '#B3402B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  )
}
