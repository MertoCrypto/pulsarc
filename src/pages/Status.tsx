import { Activity, Clock, Database, ExternalLink } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { useIndexerState, deriveStatus, timeAgo } from '@/hooks/useIndexerState'
import { NETWORK } from '@/lib/chain'
import { DataFreshnessCard } from '@/components/status/DataFreshnessCard'

const net = NETWORK.id === 5042 ? 'mainnet' : 'testnet'

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

function Badge({ stale }: { stale: boolean }) {
  if (!stale) return null
  return (
    <span className="inline-flex items-center rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-2 py-0.5 text-xs text-[#f87171]">
      Stale
    </span>
  )
}

function SourceBadge({ source }: { source: 'indexer' | 'arcscan' }) {
  const isIndexer = source === 'indexer'
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${
        isIndexer
          ? 'border-[var(--periwinkle)]/40 bg-[var(--periwinkle)]/10 text-[var(--periwinkle)]'
          : 'border-white/10 bg-white/[0.04] text-[var(--muted)]'
      }`}
    >
      {isIndexer ? 'indexer' : 'ArcScan'}
    </span>
  )
}

export function Status() {
  const { data, isLoading } = useIndexerState(net)

  const derived = data ? deriveStatus(data.state, data.meta) : null

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Indexer</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(34px,4.3vw,60px)] text-white"
            lines={[
              { text: 'Indexer status' },
            ]}
          />
          <p className="mt-6 max-w-[580px] text-lg font-light leading-relaxed text-[var(--muted)]">
            Live state of the Pulsarc indexer GitHub Action that powers rankings, anomalies, and the weekly digest.
          </p>
        </section>
      </Reveal>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <div key={i} className="arc-card h-16 animate-pulse" />)}
        </div>
      )}

      {!isLoading && !derived && (
        <p className="arc-panel px-4 py-3 text-sm text-[var(--muted)]">
          Status not available right now.
        </p>
      )}

      <DataFreshnessCard net={net} />

      {!isLoading && derived && (
        <Reveal className="space-y-6">
          {/* Main facts table */}
          <div className="arc-card overflow-hidden">
            <div className="grid grid-cols-[28px_1fr_auto] gap-x-4 border-b border-[var(--line)] px-5 py-3 text-xs uppercase tracking-wider text-[var(--faint)]">
              <span />
              <span>Property</span>
              <span>Value</span>
            </div>

            {[
              {
                icon: <Database className="h-4 w-4 text-[var(--periwinkle)]" />,
                label: 'Last indexed block',
                value: derived.lastIndexedBlock.toLocaleString('en-US'),
              },
              {
                icon: <Activity className="h-4 w-4 text-[var(--periwinkle)]" />,
                label: 'Chain tip',
                value: derived.tip.toLocaleString('en-US'),
              },
              {
                icon: <Activity className="h-4 w-4 text-[var(--muted)]" />,
                label: 'Lag',
                value: `${derived.lagBlocks.toLocaleString('en-US')} blocks`,
              },
              {
                icon: <Clock className="h-4 w-4 text-[var(--muted)]" />,
                label: 'Last run',
                value: (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{timeAgo(derived.updatedAgoMs)}</span>
                    <span className="text-[var(--faint)]">({fmtDate(derived.updatedAt)})</span>
                    <Badge stale={derived.isStale} />
                  </span>
                ),
              },
              {
                icon: <Clock className="h-4 w-4 text-[var(--muted)]" />,
                label: 'Open hour',
                value: derived.openHour ?? '—',
              },
            ].map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[28px_1fr_auto] items-center gap-x-4 border-b border-[var(--line)] px-5 py-3.5 last:border-0"
              >
                <span className="shrink-0">{row.icon}</span>
                <span className="text-sm text-[var(--muted)]">{row.label}</span>
                <span className="text-right text-sm text-white">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Rankings source */}
          <div className="arc-card overflow-hidden">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <p className="arc-eyebrow">Rankings data source</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[340px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-[var(--faint)]">Window</th>
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-[var(--faint)]">Source</th>
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-[var(--faint)]">Needs</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.coverage.map(c => (
                    <tr key={c.window} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-5 py-3 text-sm text-white">{c.window}</td>
                      <td className="px-5 py-3"><SourceBadge source={c.source} /></td>
                      <td className="px-5 py-3 text-sm text-[var(--faint)]">{c.requiredHours}h coverage</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--faint)]">
              Indexer is used when coverage hours reach the window length and the snapshot is fresh. Otherwise Rankings reads from ArcScan.
            </p>
          </div>

          {/* Skipped blocks */}
          {derived.skipped.length > 0 && (
            <div className="arc-card overflow-hidden">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <p className="arc-eyebrow">Skipped block ranges</p>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {derived.skipped.map((s, i) => (
                  <li key={i} className="flex items-center justify-between px-5 py-3.5">
                    <span className="font-['Geist_Mono'] text-sm text-white">
                      {s.from.toLocaleString('en-US')} – {s.to.toLocaleString('en-US')}
                    </span>
                    <span className="text-sm text-[var(--muted)]">{s.count.toLocaleString('en-US')} blocks</span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--faint)]">
                When the indexer falls more than 24 hours behind it jumps ahead; counts for these blocks are missing.
              </p>
            </div>
          )}

          {/* Method changes */}
          <div className="arc-card overflow-hidden">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <p className="arc-eyebrow">Method changes</p>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {[
                {
                  date: '2026-10-11',
                  text: 'Anomaly detection now ignores the hour that is still in progress.',
                },
                {
                  date: '2026-10-10',
                  text: 'Indexer keeps its open hour between runs and rotates four public RPC endpoints.',
                },
              ].map((entry, i) => (
                <li key={i} className="px-5 py-3.5">
                  <span className="mr-3 font-['Geist_Mono'] text-xs text-[var(--faint)]">{entry.date}</span>
                  <span className="text-sm text-[var(--muted)]">{entry.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Source link */}
          <a
            href="https://github.com/MertoCrypto/pulsarc-indexer"
            target="_blank"
            rel="noreferrer"
            className="arc-btn-ghost inline-flex items-center gap-2 text-sm"
          >
            Indexer source on GitHub <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Reveal>
      )}

      <p className="text-xs text-[var(--faint)]">
        Source: Pulsarc indexer, state.json and apps-latest.json.
      </p>
    </div>
  )
}
