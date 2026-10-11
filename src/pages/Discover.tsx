import { ExternalLink, Info } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { useDiscover, buildDisplayList, shortAddress } from '@/hooks/useDiscover'
import { useLatest } from '@/hooks/useLatest'
import { ARC_APPS } from '@/data/apps'
import { NETWORK, EXPLORER_URL } from '@/lib/chain'

const net = NETWORK.id === 5042 ? 'mainnet' : 'testnet'

// Build the set of tracked anchor addresses (lowercased) from apps.ts
const TRACKED_ADDRESSES = new Set(
  ARC_APPS.flatMap(a => a.anchors.map(anc => anc.address.toLowerCase()))
)

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toString()
}

function fmtFee(n: number): string {
  if (n < 0.001) return '<0.001'
  return n.toFixed(3)
}

export function Discover() {
  const { data, isLoading } = useDiscover(net)
  const { data: latest } = useLatest(net)

  const networkTxs = latest?.windows['24h']?.txs ?? 0

  const list = data
    ? buildDisplayList(data.snap, data.labels, TRACKED_ADDRESSES, networkTxs)
    : []

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Discovery</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(34px,4.3vw,60px)] text-white"
            lines={[
              { text: 'Untracked busy' },
              { text: 'contracts.', className: 'text-[var(--periwinkle)]' },
            ]}
          />
          <p className="mt-6 max-w-[580px] text-lg font-light leading-relaxed text-[var(--muted)]">
            The busiest contracts in the last 24 hours that Pulsarc does not rank yet. A contract is not an app: some are bots, routers or tokens.
          </p>
        </section>
      </Reveal>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="arc-card h-14 animate-pulse" />)}
        </div>
      )}

      {!isLoading && !data && (
        <p className="arc-panel px-4 py-3 text-sm text-[var(--muted)]">
          Discovery data not available right now.
        </p>
      )}

      {!isLoading && data && list.length === 0 && (
        <p className="arc-panel px-4 py-3 text-sm text-[var(--muted)]">
          No untracked contracts found in the last 24 hours.
        </p>
      )}

      {!isLoading && list.length > 0 && (
        <Reveal>
          <div className="arc-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="px-5 py-3.5 text-left text-xs uppercase tracking-wider text-[var(--faint)]">#</th>
                    <th className="px-5 py-3.5 text-left text-xs uppercase tracking-wider text-[var(--faint)]">Contract</th>
                    <th className="px-5 py-3.5 text-right text-xs uppercase tracking-wider text-[var(--faint)]">Txs (24h)</th>
                    <th className="px-5 py-3.5 text-right text-xs uppercase tracking-wider text-[var(--faint)]">Network share</th>
                    <th className="px-5 py-3.5 text-right text-xs uppercase tracking-wider text-[var(--faint)]">≤ Wallet-hrs</th>
                    <th className="px-5 py-3.5 text-right text-xs uppercase tracking-wider text-[var(--faint)]">Fees (USDC)</th>
                    <th className="px-5 py-3.5 text-center text-xs uppercase tracking-wider text-[var(--faint)]">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c, i) => (
                    <tr key={c.address} className="arc-row border-b border-[var(--line)] last:border-0">
                      <td className="px-5 py-3.5 text-sm tabular-nums text-[var(--faint)]">{i + 1}</td>
                      <td className="px-5 py-3.5">
                        <a
                          href={`${EXPLORER_URL}/address/${c.address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-white hover:text-[var(--periwinkle)]"
                        >
                          {c.displayName ? (
                            <>
                              <span>{c.displayName}</span>
                              <span className="font-['Geist_Mono'] text-xs text-[var(--faint)]">
                                {shortAddress(c.address)}
                              </span>
                            </>
                          ) : (
                            <span className="font-['Geist_Mono'] text-xs">{shortAddress(c.address)}</span>
                          )}
                          <ExternalLink className="h-3 w-3 shrink-0 text-[var(--faint)]" />
                        </a>
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-white">{fmtNum(c.txs)}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">
                        {c.networkShare !== null ? `${c.networkShare.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">
                        {fmtNum(c.walletHours)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">
                        {fmtFee(c.fees)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {c.automatedLooking && (
                          <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                            automated-looking
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Note about automated-looking */}
          <div className="mt-4 flex items-start gap-2 text-xs text-[var(--faint)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Automated-looking means 50 or more transactions per sender per hour on average (txs ÷ wallet-hours ≥ 50, and total txs ≥ 1,000). It describes behaviour, not intent — a high-frequency protocol is not necessarily a bot.
            </p>
          </div>
        </Reveal>
      )}

      <p className="text-xs text-[var(--faint)]">
        Source: Pulsarc indexer, discover.json. Last 24 hours. Tracked apps are excluded.
      </p>
    </div>
  )
}
