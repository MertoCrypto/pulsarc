/**
 * NotFound.tsx — 404 page for Pulsarc.
 * Rendered by the wildcard <Route path="*"> in App.tsx.
 * Injects a noindex meta tag so search engines skip unknown URLs.
 */
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { NOT_FOUND_LINKS } from '@/lib/notFoundLinks'

export function NotFound() {
  // Add a single <meta name="robots" content="noindex"> while mounted.
  // Uses a stable data attribute so we only ever create one tag and
  // clean it up cleanly on unmount.
  useEffect(() => {
    const existing = document.head.querySelector('meta[data-not-found="1"]')
    if (existing) return                          // already present (StrictMode double-mount)

    const tag = document.createElement('meta')
    tag.setAttribute('name', 'robots')
    tag.setAttribute('content', 'noindex')
    tag.setAttribute('data-not-found', '1')
    document.head.appendChild(tag)

    return () => {
      document.head.querySelector('meta[data-not-found="1"]')?.remove()
    }
  }, [])

  return (
    <div className="space-y-12 pt-4">
      {/* ── page header ── */}
      <section>
        <p className="arc-eyebrow mb-5">404</p>
        <h1 className="arc-display text-[clamp(34px,4.3vw,60px)] text-white">
          That page does not exist.
        </h1>
        <p className="mt-6 max-w-[580px] text-lg font-light leading-relaxed text-[var(--muted)]">
          The address may be mistyped, or the page has moved to a different URL.
        </p>
      </section>

      {/* ── quick nav ── */}
      <nav aria-label="Suggested pages">
        <p className="mb-4 text-sm text-[var(--faint)]">Try one of these:</p>
        <ul className="flex flex-wrap gap-3">
          {NOT_FOUND_LINKS.map(({ to, label }) => (
            <li key={to}>
              <Link
                to={to}
                className="arc-btn-ghost inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.05] px-4 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--periwinkle)] hover:text-white"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
