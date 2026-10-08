import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUpRight, Image, Search, Users } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { useNfts, type NftKind } from '@/hooks/useNfts'
import { count, explorerToken } from '@/lib/arcscan'

type Filter = 'All' | NftKind
type SortKey = 'holders' | 'items' | 'transfers'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'holders', label: 'Holders' },
  { key: 'items', label: 'Items' },
  { key: 'transfers', label: 'Transfers' },
]

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function NFTs() {
  const { data, isLoading, error } = useNfts()
  const [filter, setFilter] = useState<Filter>('All')
  const [sort, setSort] = useState<SortKey>('holders')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? [])
      .filter(c => (filter === 'All' || c.kind === filter) &&
        (!q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)))
      .sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1))
  }, [data, filter, sort, query])

  const totalHolders = (data ?? []).reduce((s, c) => s + c.holders, 0)

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">NFTs · Arc Testnet</p>
          <SplitLines as="h1" className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[{ text: 'Collections,' }, { text: 'by who holds them.', className: 'text-[var(--periwinkle)]' }]} />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            The most-held ERC-721 and ERC-1155 collections on Arc, straight from ArcScan. No floor prices — testnet NFTs have no market.
          </p>
        </section>
      </Reveal>

      <section>
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Collections listed" value={data?.length ?? 0} format={n => Math.round(n).toString()} subValue="top ERC-721 and ERC-1155" icon={Image} isLoading={isLoading} />
          <StatCard label="Largest holder base" value={data?.[0]?.holders ?? 0} format={n => count(n)} subValue={data?.[0]?.name} icon={Users} isLoading={isLoading} />
          <StatCard label="Holder slots" value={totalHolders} format={n => count(n)} subValue="summed across listed collections" icon={Users} isLoading={isLoading} />
        </Reveal>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-2">
            {(['All', 'ERC-721', 'ERC-1155'] as Filter[]).map(f => (
              <button key={f} className="arc-chip" data-active={filter === f} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="arc-panel flex items-center gap-2 px-3.5 py-2.5">
              <Search className="h-3.5 w-3.5 text-[var(--muted)]" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, symbol or address"
                className="w-[200px] bg-transparent text-sm text-white outline-none placeholder:text-[var(--faint)]" />
            </label>
            <div className="flex items-center gap-1">
              <span className="arc-eyebrow mr-2 !text-[10px]">Sort</span>
              {SORTS.map(s => (
                <button key={s.key} className="arc-chip !px-3 !py-1.5" data-active={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</button>
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
                  <th className="arc-eyebrow !text-[10px] px-3 py-3.5 text-left font-normal">Collection</th>
                  <th className="arc-eyebrow !text-[10px] px-3 py-3.5 text-left font-normal">Standard</th>
                  {SORTS.map(s => (
                    <th key={s.key} className="arc-eyebrow !text-[10px] px-3 py-3.5 text-right font-normal">
                      <span className="inline-flex items-center gap-1">{s.label} {sort === s.key && <ArrowDown className="h-3 w-3" />}</span>
                    </th>
                  ))}
                  <th className="arc-eyebrow !text-[10px] px-5 py-3.5 text-right font-normal">Contract</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b border-[rgba(170,196,234,0.09)]"><td colSpan={7} className="px-5 py-4"><div className="h-5 animate-pulse rounded bg-white/6" /></td></tr>
                ))}
                {rows.map((c, i) => (
                  <tr key={c.address} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                    <td className="px-5 py-3.5 text-sm tabular-nums text-[var(--faint)]">{i + 1}</td>
                    <td className="px-3 py-3.5">
                      <p className="max-w-[260px] truncate text-[15px] text-white">{c.name}</p>
                      <p className="font-['Geist_Mono'] text-[11px] text-[var(--muted)]">{c.symbol}</p>
                    </td>
                    <td className="px-3 py-3.5 text-sm text-[var(--muted)]">{c.kind}</td>
                    <td className="px-3 py-3.5 text-right text-sm tabular-nums text-white">{c.holders.toLocaleString()}</td>
                    <td className="px-3 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{c.items === null ? '—' : count(c.items)}</td>
                    <td className="px-3 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{c.transfers === null ? '—' : count(c.transfers)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <a href={explorerToken(c.address)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-['Geist_Mono'] text-xs text-[var(--muted)] transition-colors hover:text-white">
                        {short(c.address)} <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-14 text-center text-sm text-[var(--muted)]">
                    {error ? 'ArcScan did not answer. It will retry on its own.' : 'No collections match that filter.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="mt-4 max-w-[640px] text-sm leading-relaxed text-[var(--faint)]">
          "Items" is the total the contract reports (ERC-1155 contracts usually do not). Transfer counts are all-time and are loaded for the 30 largest collections only. Many testnet collections are free airdrops, so holder counts show reach, not demand.
        </p>
      </section>
    </div>
  )
}
