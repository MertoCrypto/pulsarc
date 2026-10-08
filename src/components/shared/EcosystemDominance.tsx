import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ARC_APPS, type AppCategory } from '@/data/apps'
import { useAllMetrics } from '@/hooks/useAllMetrics'

interface Share { category: AppCategory; tx: number; pct: number }

/**
 * Where on-chain activity goes, by category (last 24h). One hue, stepped by rank — rank
 * carries the information, so category colour would only add noise.
 */
export function EcosystemDominance() {
  const { items, isLoading } = useAllMetrics('24h', 'txCount', 'All', { defer: true })

  const shares = useMemo<Share[]>(() => {
    const by = new Map<AppCategory, number>()
    for (const { app, metrics } of items) by.set(app.category, (by.get(app.category) ?? 0) + metrics.txCount)
    const total = [...by.values()].reduce((a, b) => a + b, 0) || 1
    return [...by.entries()]
      .map(([category, tx]) => ({ category, tx, pct: (tx / total) * 100 }))
      .sort((a, b) => b.tx - a.tx)
  }, [items])

  const max = shares[0]?.pct || 1

  return (
    <section className="arc-card p-5">
      <header className="flex items-baseline justify-between">
        <p className="arc-eyebrow">Ecosystem</p>
        <p className="text-sm tabular-nums text-[var(--muted)]">{ARC_APPS.length} apps</p>
      </header>
      <p className="mt-1 text-xs text-[var(--faint)]">Share of transactions, last 24h</p>

      {isLoading || shares.length === 0 ? (
        <div className="mt-5 space-y-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-7 animate-pulse rounded bg-white/6" />)}
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {shares.map((s, i) => (
            <li key={s.category}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[15px] font-light text-white">{s.category}</span>
                <span className="text-sm tabular-nums text-[var(--muted)]">
                  {s.pct >= 1 ? `${Math.round(s.pct)}%` : '<1%'}
                </span>
              </div>
              <div className="h-px w-full bg-[var(--line)]">
                <motion.div
                  className="h-px origin-left bg-[var(--periwinkle)]"
                  style={{ opacity: Math.max(0.35, 1 - i * 0.11) }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: s.pct / max }}
                  transition={{ duration: 1.1, delay: 0.1 + i * 0.07, ease: [0.19, 1, 0.22, 1] }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
