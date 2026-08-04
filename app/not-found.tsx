import { Container, LinkButton } from '@/components/ui'

export default function NotFound() {
  return (
    <Container className="py-28 text-center">
      <p className="font-display text-ink-200 text-6xl">404</p>
      <h1 className="text-ink-900 mt-4 text-3xl">We could not find that page</h1>
      <p className="text-ink-600 mx-auto mt-3 max-w-md">
        The listing may have been paused, or the link may be out of date.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <LinkButton href="/">Back to home</LinkButton>
        <LinkButton href="/lucknow/photography" variant="outline">
          Browse photographers
        </LinkButton>
      </div>
    </Container>
  )
}
