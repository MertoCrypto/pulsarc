import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUpRight, Coins, Search, Users } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { useChainOverview, useTokens, type TokenGroup } from '@/hooks/useTokens'
import { compact, explorerToken } from '@/lib/arcscan'

type Filter = 'All' | TokenGroup
type SortKey = 'holders' | 'supply' | 'name'

const FILTERS: Filter[] = ['All', 'Stablecoin', 'RWA', 'LP & Vaults', 'Other']
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'holders', label: 'Holders' },
  { key: 'supply', label: 'Supply' },
  { key: 'name', label: 'Name' },
]

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function Tokens() {
  const { data: tokens, isLoading, error } = useTokens()
  const overview = useChainOverview()
  const [filter, setFilter] = useState<Filter>('All')
  const [sort, setSort] = useState<SortKey>('holders')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (tokens ?? []).filter(t =>
      (filter === 'All' || t.group === filter) &&
      (!q || t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)),
    )
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort],
    )
  }, [tokens, filter, sort, query])

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: tokens?.length ?? 0 }
    for (const t of tokens ?? []) c[t.group] = (c[t.group] ?? 0) + 1
    return c
  }, [tokens])

  const topHolders = tokens?.[0]?.holders ?? 0

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Tokens · Arc Testnet</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[{ text: 'Every token,' }, { text: 'counted by holders.', className: 'text-[var(--periwinkle)]' }]}
          />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            The 200 most-held ERC-20 tokens on Arc, straight from ArcScan. No invented prices — a token only shows a price when the explorer has one.
          </p>
        </section>
      </Reveal>

      <section>
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Tokens listed" value={tokens?.length ?? 0} format={n => Math.round(n).toString()}
            subValue="top 200 by holder count" icon={Coins} isLoading={isLoading} />
          <StatCard label="Largest holder base" value={topHolders} format={n => compact(n, 1)}
            subValue={tokens?.[0] ? `${tokens[0].symbol} · addresses holding it` : undefined} icon={Users} isLoading={isLoading} />
          <StatCard label="Addresses on Arc" value={overview.data?.totalAddresses ?? 0} format={n => compact(n, 1)}
            subValue="all-time, testnet" icon={Users} isLoading={overview.isLoading} />
          <StatCard label="Transactions · last full day" value={overview.data?.transactionsToday ?? 0} format={n => compact(n, 2)}
            subValue={overview.data ? `${compact(overview.data.totalTransactions, 0)} all-time` : undefined} icon={ArrowUpRight} isLoading={overview.isLoading} />
        </Reveal>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button key={f} className="arc-chip" data-active={filter === f} onClick={() => setFilter(f)}>
                {f}
                <span className="ml-2 font-['Geist_Mono'] text-[11px] opacity-60">{counts[f] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="arc-panel flex items-center gap-2 px-3.5 py-2.5">
              <Search className="h-3.5 w-3.5 text-[var(--muted)]" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Name, symbol or address"
                className="w-[200px] bg-transparent text-sm text-white outline-none placeholder:text-[var(--faint)]"
              />
            </label>
            <div className="flex items-center gap-1">
              <span className="arc-eyebrow mr-2 !text-[10px]">Sort</span>
              {SORTS.map(s => (
                <button key={s.key} className="arc-chip !px-3 !py-1.5" data-active={sort === s.key} onClick={() => setSort(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Reveal className="arc-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="arc-eyebrow !text-[10px] w-14 px-5 py-3.5 text-left font-normal">#</th>
                  <th className="arc-eyebrow !text-[10px] px-3 py-3.5 text-left font-normal">Token</th>
                  <th className="arc-eyebrow !text-[10px] px-3 py-3.5 text-left font-normal">Type</th>
                  <th className="arc-eyebrow !text-[10px] px-3 py-3.5 text-right font-normal">
                    <span className="inline-flex items-center gap-1">Holders {sort === 'holders' && <ArrowDown className="h-3 w-3" />}</span>
                  </th>
                  <th className="arc-eyebrow !text-[10px] px-3 py-3.5 text-right font-normal">
                    <span className="inline-flex items-center gap-1">Supply {sort === 'supply' && <ArrowDown className="h-3 w-3" />}</span>
                  </th>
                  <th className="arc-eyebrow !text-[10px] px-5 py-3.5 text-right font-normal">Contract</th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 8 }, (_, i) => (
                    <tr key={i} className="border-b border-[rgba(170,196,234,0.09)]">
                      <td colSpan={6} className="px-5 py-4"><div className="h-5 animate-pulse rounded bg-white/6" /></td>
                    </tr>
                  ))}

                {rows.map((t, i) => (
                  <tr key={t.address} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                    <td className="px-5 py-3.5 text-sm tabular-nums text-[var(--faint)]">{i + 1}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-3">
                        {t.iconUrl ? (
                          <img src={t.iconUrl} alt="" className="h-8 w-8 rounded-full border border-[var(--line)] bg-[#0b182c] object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-strong)] font-['Geist_Mono'] text-[10px] uppercase text-[var(--periwinkle)]">
                            {t.symbol.slice(0, 2)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-[260px] truncate text-[15px] text-white">{t.name}</p>
                          <p className="font-['Geist_Mono'] text-[11px] text-[var(--muted)]">{t.symbol}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-sm text-[var(--muted)]">{t.group}</td>
                    <td className="px-3 py-3.5 text-right text-sm tabular-nums text-white">{t.holders.toLocaleString()}</td>
                    <td className="px-3 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">
                      {t.supply > 0 ? compact(t.supply, 2) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        href={explorerToken(t.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-['Geist_Mono'] text-xs text-[var(--muted)] transition-colors hover:text-white"
                      >
                        {short(t.address)} <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}

                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-14 text-center text-sm text-[var(--muted)]">
                    {error ? 'ArcScan did not answer. It will retry on its own.' : 'No tokens match that filter.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Reveal>

        <p className="mt-4 max-w-[640px] text-sm leading-relaxed text-[var(--faint)]">
          Types are our own labels, guessed from token names — ArcScan does not classify tokens. Supply is the raw on-chain total, so testnet faucet tokens can show very large numbers. Several different tokens share the same symbol.
        </p>
      </section>
    </div>
  )
}
