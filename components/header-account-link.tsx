import Link from 'next/link'

/**
 * The header's one action: log in, or go to your dashboard.
 *
 * A Server Component. `signedIn` comes from SiteHeader's getSessionUser() and is correct on
 * every route today — verified against a production build, where a signed-in request to
 * /vendor/[slug] and /[city]/[category] both render "Dashboard" and an anonymous one renders
 * "Log in". Those routes are marked SSG in the build output, but the layout's session read
 * bails them out to a per-request render, so the cookie is there to be read.
 *
 * THAT BAIL-OUT IS NOT FREE, and it is the thing to look at before adding anything else to this
 * bar. 416 pages are prerendered at build time and then re-rendered on every request, so the
 * prerender buys nothing — plan §12 wants that HTML served flat, for SEO cost at scale. Making
 * it flat means the header can no longer read the session on the server at all, and this
 * component would have to hydrate the label in the browser instead.
 *
 * SIGNED IN GOES TO /dashboard, NEVER /account. The same person can be a customer, a studio
 * owner and a moderator at once (plan §3), and that route reads their memberships and forwards.
 * Linking straight to /account would drop a super admin on their own shortlists every morning.
 */
export function HeaderAccountLink({
  signedIn,
  initial,
}: {
  signedIn: boolean
  /** One letter for the avatar, or null when the account has nothing to take one from. */
  initial: string | null
}) {
  if (!signedIn) {
    return (
      <Link href="/login" className={SIGNED_OUT}>
        Log in
      </Link>
    )
  }

  return (
    <Link href="/dashboard" className={SIGNED_IN}>
      <span aria-hidden="true" className={AVATAR}>
        {initial ?? '·'}
      </span>
      Dashboard
    </Link>
  )
}

/*
 * Both states are pills, and both carry the header's two colour variants — ink on the white bar,
 * white over the homepage hero. A class with only one of them is invisible on exactly one route
 * at exactly one scroll position, which is the kind of bug that ships. See site-header-shell.tsx
 * for where `data-transparent` comes from.
 *
 * Signed out is the outlined default the design system calls for. Signed in is quieter and
 * carries the avatar instead: "you are already here" is not an action worth shouting, and the
 * initial says whose session it is at a glance — which is the thing a shared laptop gets wrong.
 */
const SIGNED_OUT =
  'inline-flex h-10 items-center rounded-full border-[1.5px] px-5 text-sm font-semibold transition-colors ' +
  'border-primary-600 text-primary-700 hover:bg-primary-50 ' +
  'group-data-[transparent]:border-white group-data-[transparent]:text-white ' +
  'group-data-[transparent]:hover:bg-white/15'

const SIGNED_IN =
  'inline-flex h-10 items-center gap-2 rounded-full border pl-1.5 pr-4 text-sm font-semibold transition-colors ' +
  'border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50 ' +
  'group-data-[transparent]:border-white/40 group-data-[transparent]:text-white ' +
  'group-data-[transparent]:hover:bg-white/15'

const AVATAR =
  'flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white ' +
  'group-data-[transparent]:bg-white group-data-[transparent]:text-ink-900'
