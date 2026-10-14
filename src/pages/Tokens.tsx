import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUpRight, Coins, Search, Users } from 'lucide-react'
import { TokenBTC, TokenEURC, TokenUSDC } from '@web3icons/react'
import { getTokenLogo } from '@/lib/tokenLogos'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { useChainOverview, useCatalogMeta, useTokens } from '@/hooks/useTokens'
import { compact, explorerToken } from '@/lib/arcscan'
import { tokenGroupCounts, verifiedTokenSet, visibleTokens, type TokenFilter, type TokenSortKey } from '@/lib/catalogView'
import { FxRateCard } from '@/components/tokens/FxRateCard'
import { NETWORK } from '@/lib/chain'
import { appsForNetwork } from '@/data/appRegistries'

type Filter = TokenFilter
type SortKey = TokenSortKey

// ─── Token logo cell ─────────────────────────────────────────────────────────

/**
 * Renders a 32 px circle with the token's logo.
 * Priority: catalog iconUrl → verified address logo → letter badge.
 */
function TokenIcon({ address, symbol, iconUrl }: { address: string; symbol: string; iconUrl: string | null }) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className="h-8 w-8 rounded-full border border-[var(--line)] bg-[#0b182c] object-cover"
        loading="lazy"
      />
    )
  }
  const logo = getTokenLogo(address)
  if (logo !== null) {
    if (logo.kind === 'web3icon') {
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[#0b182c]">
          {logo.icon === 'usdc' && <TokenUSDC variant="branded" size={24} />}
          {logo.icon === 'eurc' && <TokenEURC variant="branded" size={24} />}
          {logo.icon === 'btc'  && <TokenBTC  variant="branded" size={22} />}
        </span>
      )
    }
    return (
      <img
        src={logo.src}
        alt=""
        className="h-8 w-8 rounded-full border border-[var(--line-strong)] bg-[#0b182c] object-contain p-0.5"
        loading="lazy"
      />
    )
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-strong)] font-['Geist_Mono'] text-[10px] uppercase text-[var(--periwinkle)]">
      {symbol.slice(0, 2)}
    </span>
  )
}

const FILTERS: Filter[] = ['All', 'Stablecoin', 'RWA', 'LP & Vaults', 'Other']

// Testnet shows all three sort keys; mainnet omits 'holders' (catalog has none).
const SORTS_TESTNET: { key: SortKey; label: string }[] = [
  { key: 'holders', label: 'Holders' },
  { key: 'supply', label: 'Supply' },
  { key: 'name', label: 'Name' },
]
const SORTS_MAINNET: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'supply', label: 'Supply' },
  { key: 'name', label: 'Name' },
]

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** Format an ISO timestamp as "Oct 13, 2026 UTC" — local helper, no global import needed. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ' UTC'
}

const IS_MAINNET = NETWORK.id === 5042

// ─── Testnet token table ──────────────────────────────────────────────────────

function TokensTestnetContent() {
  const { data: tokens, isLoading, error } = useTokens()
  const overview = useChainOverview()
  const [filter, setFilter] = useState<Filter>('All')
  const [sort, setSort] = useState<SortKey>('holders')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => visibleTokens(tokens ?? [], filter, sort, query), [tokens, filter, sort, query])
  const counts = useMemo(() => tokenGroupCounts(tokens ?? []), [tokens])
  const topHolders = tokens?.[0]?.holders ?? 0

  return (
    <>
      <section>
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Tokens listed" value={tokens?.length ?? 0} format={(n: number) => Math.round(n).toString()}
            subValue="top 200 by holder count" icon={Coins} isLoading={isLoading} />
          <StatCard label="Largest holder base" value={topHolders} format={(n: number) => compact(n, 1)}
            subValue={tokens?.[0] ? `${tokens[0].symbol} · addresses holding it` : undefined} icon={Users} isLoading={isLoading} />
          <StatCard label="Addresses on Arc" value={overview.data?.totalAddresses ?? 0} format={(n: number) => compact(n, 1)}
            subValue="all-time, testnet" icon={Users} isLoading={overview.isLoading} />
          <StatCard label="Transactions · last full day" value={overview.data?.transactionsToday ?? 0} format={(n: number) => compact(n, 2)}
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
              {SORTS_TESTNET.map(s => (
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
                        <TokenIcon address={t.address} symbol={t.symbol} iconUrl={t.iconUrl ?? null} />
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
    </>
  )
}

// ─── Mainnet token table ──────────────────────────────────────────────────────

function TokensMainnetContent() {
  const { data: tokens, isLoading, error } = useTokens()
  const { data: meta } = useCatalogMeta()
  const [filter, setFilter] = useState<Filter>('All')
  // Mainnet default sort is 'featured'; 'holders' is not offered (catalog has none).
  const [sort, setSort] = useState<SortKey>('featured')
  const [query, setQuery] = useState('')

  const verified = useMemo(() => verifiedTokenSet(appsForNetwork(NETWORK.id)), [])
  const rows = useMemo(() => visibleTokens(tokens ?? [], filter, sort, query, verified), [tokens, filter, sort, query, verified])
  const counts = useMemo(() => tokenGroupCounts(tokens ?? []), [tokens])

  // Catalog not produced yet — honest empty state
  const catalogBuilding = !isLoading && !error && (tokens ?? []).length === 0 && !meta

  return (
    <>
      {/* Catalog coverage banner */}
      {meta && (
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
          <span>Coverage: <span className="text-white">{meta.coverage}</span></span>
          <span className="text-[var(--faint)]">·</span>
          <span>Updated <span className="text-white">{formatDate(meta.generatedAt)}</span></span>
        </div>
      )}

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
              {SORTS_MAINNET.map(s => (
                <button key={s.key} className="arc-chip !px-3 !py-1.5" data-active={sort === s.key} onClick={() => setSort(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mb-3 text-sm text-[var(--muted)]">
          Token names and symbols come from the contracts themselves and can imitate real companies. Only tokens labelled by Pulsarc are verified.
        </p>

        <Reveal className="arc-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="arc-eyebrow !text-[10px] w-14 px-5 py-3.5 text-left font-normal">#</th>
                  <th className="arc-eyebrow !text-[10px] px-3 py-3.5 text-left font-normal">Token</th>
                  <th className="arc-eyebrow !text-[10px] px-3 py-3.5 text-left font-normal">Type</th>
                  {/* Holders column — catalog does not carry holder counts; always '—' */}
                  <th
                    className="arc-eyebrow !text-[10px] px-3 py-3.5 text-right font-normal"
                    title="The indexer does not count holders yet."
                  >
                    Holders
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
                        <TokenIcon address={t.address} symbol={t.symbol} iconUrl={null} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="max-w-[220px] truncate text-[15px] text-white">{t.name}</p>
                            {!verified.has(t.address.toLowerCase()) && (
                              <span
                                className="arc-chip !px-1.5 !py-0.5 !text-[10px] opacity-60"
                                title="Name and symbol are set by whoever deployed the contract; Pulsarc has not verified them."
                              >
                                Unverified
                              </span>
                            )}
                          </div>
                          <p className="font-['Geist_Mono'] text-[11px] text-[var(--muted)]">{t.symbol}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-sm text-[var(--muted)]">{t.group}</td>
                    {/* Holders — not available in mainnet catalog; shown as '—' regardless of value */}
                    <td className="px-3 py-3.5 text-right text-sm tabular-nums text-[var(--faint)]">—</td>
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

                {!isLoading && (catalogBuilding || rows.length === 0) && (
                  <tr><td colSpan={6} className="px-5 py-14 text-center text-sm text-[var(--muted)]">
                    {error
                      ? 'Could not fetch the mainnet catalog. It will retry on its own.'
                      : catalogBuilding
                        ? 'The catalog is being built.'
                        : 'No tokens match that filter.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Reveal>

        <p className="mt-4 max-w-[640px] text-sm leading-relaxed text-[var(--faint)]">
          Types are our own labels, guessed from token names. Supply is the raw on-chain total. Holder counts are not yet available in the mainnet catalog.
        </p>
      </section>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Tokens() {
  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">{`Tokens · ${NETWORK.name}`}</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[
              { text: 'Every token,' },
              {
                text: IS_MAINNET ? 'read from the chain.' : 'counted by holders.',
                className: 'text-[var(--periwinkle)]',
              },
            ]}
          />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            {IS_MAINNET
              ? 'ERC-20 tokens on Arc Mainnet, indexed from the chain. Supply figures are on-chain totals.'
              : 'The 200 most-held ERC-20 tokens on Arc, straight from ArcScan. No invented prices — a token only shows a price when the explorer has one.'}
          </p>
        </section>
      </Reveal>

      <section>
        <div className="mb-6 empty:hidden">
          <FxRateCard net={IS_MAINNET ? 'mainnet' : 'testnet'} />
        </div>
      </section>

      {IS_MAINNET ? <TokensMainnetContent /> : <TokensTestnetContent />}
    </div>
  )
}
