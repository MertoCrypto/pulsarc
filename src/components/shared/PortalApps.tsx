import { ArrowUpRight } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { PORTAL, PORTAL_APPS } from '@/data/portal'

/**
 * Apps listed on Arc Portal that Pulsarc does not measure yet. They are shown as a plain list,
 * with no numbers, because a ranking only means something once an app's Arc contracts are verified.
 */
export function PortalApps() {
  return (
    <Reveal>
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="arc-eyebrow mb-3">Also on Arc</p>
            <h2 className="text-[clamp(24px,3vw,34px)] font-light leading-[1.1] tracking-tight text-white">Listed on Arc Portal, not ranked yet</h2>
          </div>
          <a href={`${PORTAL}/discover`} target="_blank" rel="noreferrer" className="arc-btn-ghost">
            Arc Portal <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PORTAL_APPS.map(a => (
            <li key={a.key}>
              <a
                href={`${PORTAL}/discover`}
                target="_blank"
                rel="noreferrer"
                className="arc-card group flex h-full items-center gap-3 p-3.5 transition-colors hover:border-[var(--periwinkle)]/60"
              >
                <img src={a.logo} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} className="h-10 w-[62px] shrink-0 rounded-lg object-cover" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-white">{a.name}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{a.note}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-[var(--faint)]">
          We add an app to the rankings once its contracts on Arc are verified, so every number stays tied to a real contract. Logos belong to their owners.
        </p>
      </section>
    </Reveal>
  )
}
