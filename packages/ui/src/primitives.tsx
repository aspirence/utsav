/**
 * Utsava design system — primitives. Plan §S1 "design system v1".
 *
 * Everything here is a Server Component by default: no hooks, no event handlers.
 * Plan §4 puts all reads in Server Components, so the common case must not force a
 * client bundle. Interactive wrappers live in the app, next to their state.
 */

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

import { cn } from './cn'

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm',
  secondary: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 shadow-sm',
  outline: 'border border-ink-200 bg-surface-raised text-ink-800 hover:bg-ink-50 hover:border-ink-300',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-danger-500 text-white hover:bg-danger-700',
}

const buttonSizes: Record<ButtonSize, string> = {
  // 44px minimum touch target on mobile — plan §13 tests on mid-range Android.
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  )
}

/** Anchor styled as a button — the common case, since most CTAs are navigations. */
export interface LinkButtonProps extends HTMLAttributes<HTMLAnchorElement> {
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  children: ReactNode
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger'

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  primary: 'bg-primary-50 text-primary-700 ring-1 ring-primary-100',
  accent: 'bg-accent-50 text-accent-800 ring-1 ring-accent-200',
  success: 'bg-success-50 text-success-700 ring-1 ring-success-100',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        badgeTones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-ink-100 bg-surface-raised shadow-sm',
        'transition-shadow hover:shadow-md',
        className,
      )}
      {...props}
    />
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />
}

// ---------------------------------------------------------------------------
// Rating. Plan §2: reviews are booking-gated, so the count is a trust signal in its
// own right — an unreviewed vendor says "New" rather than showing zero stars.
// ---------------------------------------------------------------------------

export function Rating({
  value,
  count,
  size = 'md',
  className,
}: {
  value: number | null | undefined
  count?: number
  size?: 'sm' | 'md'
  className?: string
}) {
  if (value == null || !count) {
    return (
      <span className={cn('text-xs font-medium text-ink-500', className)}>New on Utsava</span>
    )
  }

  const dim = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      aria-label={`${value.toFixed(1)} out of 5 from ${count} reviews`}
    >
      <svg className={cn(dim, 'fill-accent-400')} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9z" />
      </svg>
      <span className={cn('font-semibold text-ink-900', size === 'sm' ? 'text-xs' : 'text-sm')}>
        {value.toFixed(1)}
      </span>
      <span className={cn('text-ink-500', size === 'sm' ? 'text-xs' : 'text-sm')}>({count})</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Media frame. Plan §12: Supabase CDN transforms, never the Vercel image optimizer.
// `src` of null renders the warm gradient placeholder instead of a broken image —
// which is what the demo seed relies on, since its Storage objects do not exist.
// ---------------------------------------------------------------------------

export function MediaFrame({
  src,
  alt,
  aspect = '4/3',
  className,
  priority,
  sizes,
}: {
  src: string | null
  alt: string
  aspect?: '4/3' | '3/2' | '1/1' | '16/9' | '3/4'
  className?: string
  priority?: boolean
  sizes?: string
}) {
  return (
    <div
      className={cn('u-media rounded-lg', !src && 'u-media-fallback', className)}
      style={{ aspectRatio: aspect.replace('/', ' / ') }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- plan §12: Storage CDN, not next/image
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          sizes={sizes}
        />
      ) : (
        <span className="sr-only">{alt}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)} {...props} />
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', className)}>
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl text-ink-900 sm:text-3xl">{title}</h2>
      {description && <p className="mt-2.5 text-ink-600">{description}</p>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-ink-100', className)} />
}
