/**
 * "Capital & flows" section below the galaxy stage.
 * Cards: a) CCTP USDC flows, b) Stablecoin supply, c) DEX volume by venue, d) Networks table.
 */
import { useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { useLatest, isLatestFresh } from '@/hooks/useLatest'
import { useStablecoins, useDexs, useChainSizes } from '@/hooks/useLlama'
import { useBridgeHour } from '@/hooks/useBridgeHour'
import { NETWORK } from '@/lib/chain'
import { domainName } from '@/lib/bridgeFlow'
import { PORT_DOMAINS } from '@/lib/chainPorts'
import type { CctpStats } from '@/lib/cctpLive'
import { bridgeSummary, type ExtendedWindow } from '@/lib/activityMix'
import { lastFullDay, latestAndChange, venueShares } from '@/lib/llama'
import { BRIDGE_COLORS, pillAmount } from '@/lib/orbitMap'
import { PortFace } from './portIcons'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function fmtCount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function barPct(v: number, max: number): string {
  if (!max) return '0%'
  return `${Math.min(100, (v / max) * 100).toFixed(1)}%`
}

function utcDateLabel(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const mo = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${mo} ${d.getUTCDate()}`
}

const CHART_GRAD_ID = 'capitalAreaGrad'
const TICK_STYLE = { fill: '#8da2c0', fontSize: 10, fontFamily: 'Geist Mono' }
const GRID_STROKE = 'rgba(170,196,234,0.1)'
const TOOLTIP_STYLE = {
  background: '#10213b',
  border: '1px solid rgba(170,196,234,0.28)',
  borderRadius: 12,
  color: '#eaf1fb',
  fontSize: 12,
}
const TOOLTIP_LABEL_STYLE = { color: '#8da2c0' }

// ── Window toggle ─────────────────────────────────────────────────────────────

function WindowToggle({ win, setWin }: {
  win: '24h' | '7d'
  setWin: (k: '24h' | '7d') => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--line)] p-1" role="tablist" aria-label="Window">
      {(['24h', '7d'] as const).map(k => (
        <button key={k} role="tab" aria-selected={win === k} onClick={() => setWin(k)}
          className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${win === k ? 'bg-white/[0.08] text-white' : 'text-[var(--muted)] hover:text-white'}`}>
          {k}
        </button>
      ))}
    </div>
  )
}

// ── a) CCTP USDC flows ────────────────────────────────────────────────────────

interface CctpFlowCardProps {
  stats: CctpStats
}

function CctpFlowCard({ stats }: CctpFlowCardProps) {
  const net: 'mainnet' | 'testnet' = NETWORK.id === 5042 ? 'mainnet' : 'testnet'
  const { data: snap, isLoading } = useLatest(net)
  const [win, setWin] = useState<'24h' | '7d'>('24h')

  const snapFresh = snap && isLatestFresh(snap)

  // Cast the window to ExtendedWindow — the parser passes through all optional bridge fields.
  const extWindow: ExtendedWindow | null = snapFresh
    ? (snap.windows[win] as ExtendedWindow)
    : null

  const br = extWindow ? bridgeSummary(extWindow) : null

  // All known domains: collect from topDomains (out) + topSources (in) for the diverging bar list.
  const byNetwork = useMemo(() => {
    if (!br) return []
    const map = new Map<number, { domainId: number; name: string; out: number; outCount: number; in: number; inCount: number }>()
    for (const d of br.topDomains) {
      map.set(d.domainId, { domainId: d.domainId, name: d.name, out: d.usdc, outCount: d.count, in: 0, inCount: 0 })
    }
    for (const d of br.topSources) {
      const ex = map.get(d.domainId)
      if (ex) { ex.in = d.usdc; ex.inCount = d.count }
      else map.set(d.domainId, { domainId: d.domainId, name: d.name, out: 0, outCount: 0, in: d.usdc, inCount: d.count })
    }
    // Sort by out+in descending; cap at 10, sum rest into "Other"
    const sorted = [...map.values()].sort((a, b) => (b.out + b.in) - (a.out + a.in))
    if (sorted.length <= 10) return sorted
    const top = sorted.slice(0, 10)
    const rest = sorted.slice(10)
    const otherOut = rest.reduce((s, r) => s + r.out, 0)
    const otherIn = rest.reduce((s, r) => s + r.in, 0)
    const otherOutCount = rest.reduce((s, r) => s + r.outCount, 0)
    const otherInCount = rest.reduce((s, r) => s + r.inCount, 0)
    top.push({ domainId: -999, name: 'Other networks', out: otherOut, outCount: otherOutCount, in: otherIn, inCount: otherInCount })
    return top
  }, [br])

  // Max value across all rows (for scaling bars)
  const maxNetworkVal = useMemo(
    () => byNetwork.reduce((m, r) => Math.max(m, r.out, r.in), 1),
    [byNetwork],
  )

  const hasInbound = br && br.topSources.length > 0

  // Top corridors: top 5 by in+out combined
  const topCorridors = useMemo(() => {
    if (!br) return []
    const combined = new Map<number, { domainId: number; name: string; total: number; in: number; out: number }>()
    for (const d of br.topDomains) {
      combined.set(d.domainId, { domainId: d.domainId, name: d.name, total: d.usdc, in: 0, out: d.usdc })
    }
    for (const d of br.topSources) {
      const ex = combined.get(d.domainId)
      if (ex) { ex.in = d.usdc; ex.total += d.usdc }
      else combined.set(d.domainId, { domainId: d.domainId, name: d.name, total: d.usdc, in: d.usdc, out: 0 })
    }
    return [...combined.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  }, [br])

  const maxCorridor = topCorridors[0]?.total ?? 1

  // Session live stats
  const liveIn = stats.inUsdc
  const liveOut = stats.outUsdc
  const liveNet = liveIn - liveOut
  const liveTransfers = stats.inCount + stats.outCount

  return (
    <div className="arc-card col-span-full p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="arc-eyebrow">Follow the flow — CCTP USDC</p>
        {snapFresh && <WindowToggle win={win} setWin={setWin} />}
      </div>

      {/* ── Indexer headline stats ─────────────────────────────────────────── */}
      {isLoading && <div className="mb-5 h-24 animate-pulse rounded bg-white/5" />}

      {!isLoading && !snapFresh && (
        <p className="mb-5 text-sm text-[var(--faint)]">Indexer data not available right now.</p>
      )}

      {!isLoading && br && (
        <>
          {/* Headline: indexer window numbers */}
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {([
              ['Into Arc', br.inUsdc !== null ? fmtUsd(br.inUsdc) : `${fmtCount(br.inCount)} mints`, true],
              ['Out of Arc', br.outUsdc > 0 ? fmtUsd(br.outUsdc) : `${fmtCount(br.outCount)} burns`, false],
              [
                'Net',
                br.netUsdc !== null
                  ? (br.netUsdc >= 0 ? `+${fmtUsd(br.netUsdc)}` : `−${fmtUsd(Math.abs(br.netUsdc))}`)
                  : (br.netDirection === 'in' ? 'more in' : br.netDirection === 'out' ? 'more out' : 'balanced'),
                br.netDirection !== 'out',
              ],
              ['Transfers', fmtCount(br.inCount + br.outCount), true],
            ] as [string, string, boolean][]).map(([label, val, positive]) => (
              <div key={label}>
                <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">{label}</p>
                <p className={`mt-1 font-['Geist_Mono'] text-[22px] font-light tabular-nums ${
                  label === 'Net' && br.netDirection !== 'flat'
                    ? (positive ? 'text-[var(--positive)]' : 'text-[var(--negative)]')
                    : 'text-white'
                }`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Coverage note */}
          {br.note && <p className="mb-4 text-xs text-[var(--faint)]">{br.note}</p>}

          {/* Live session mini-row */}
          {liveTransfers > 0 && (
            <p className="mb-5 text-[11px] text-[var(--faint)]">
              Since you opened:
              {liveIn > 0 && <> <span className="text-[var(--positive)]">{fmtUsd(liveIn)} in</span></>}
              {liveOut > 0 && <> · <span className="text-[var(--negative)]">{fmtUsd(liveOut)} out</span></>}
              {' · '}{fmtCount(liveTransfers)} transfer{liveTransfers !== 1 ? 's' : ''}
            </p>
          )}

          {/* Body: diverging bar list + top corridors */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* (a) By network — diverging bars */}
            {byNetwork.length > 0 && (
              <div>
                <p className="arc-eyebrow mb-3">By network</p>
                {!hasInbound && (
                  <p className="mb-3 text-xs text-[var(--faint)]">Inbound amounts by network appear with the next indexer update.</p>
                )}
                <ul className="space-y-2.5">
                  {byNetwork.map(r => (
                    <li key={r.domainId}>
                      <div className="mb-1 flex items-center gap-2">
                        {r.domainId !== -999 && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(14,33,64,0.9)]">
                            <PortFace domain={r.domainId} size={20} />
                          </span>
                        )}
                        <span className="flex-1 truncate text-[13px] font-light text-white">{r.name}</span>
                        <span className="shrink-0 font-['Geist_Mono'] text-[11px] text-[var(--faint)]">
                          {r.out > 0 ? fmtUsd(r.out) : '—'} / {r.in > 0 ? fmtUsd(r.in) : '—'}
                        </span>
                      </div>
                      {/* Diverging bar: out (left, negative-ish) · in (right, positive) */}
                      <div className="flex h-1 w-full gap-0.5">
                        <div className="flex flex-1 justify-end">
                          <div
                            className="h-full rounded-l-full"
                            style={{
                              width: barPct(r.out, maxNetworkVal),
                              background: 'rgba(255,120,100,0.7)',
                            }}
                          />
                        </div>
                        <div className="w-px shrink-0 bg-[var(--line)]" />
                        <div className="flex flex-1">
                          <div
                            className="h-full rounded-r-full"
                            style={{
                              width: barPct(r.in, maxNetworkVal),
                              background: 'var(--positive)',
                            }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between">
                  <span className="text-[10px] text-[var(--faint)]">← Out of Arc</span>
                  <span className="text-[10px] text-[var(--faint)]">Into Arc →</span>
                </div>
              </div>
            )}

            {/* (b) Top corridors */}
            {topCorridors.length > 0 && (
              <div>
                <p className="arc-eyebrow mb-3">Top corridors (in + out)</p>
                <ul className="space-y-3">
                  {topCorridors.map((c, i) => (
                    <li key={c.domainId}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(14,33,64,0.9)]">
                          <PortFace domain={c.domainId} size={20} />
                        </span>
                        <div className="flex flex-1 items-baseline justify-between gap-2">
                          <span className="text-[15px] font-light text-white">{c.name}</span>
                          <span className="text-sm tabular-nums text-[var(--muted)]">{c.total > 0 ? fmtUsd(c.total) : '—'}</span>
                        </div>
                      </div>
                      <div className="h-px w-full bg-[var(--line)]">
                        <div className="h-px bg-[var(--periwinkle)]"
                          style={{ width: barPct(c.total, maxCorridor), opacity: Math.max(0.35, 1 - i * 0.14) }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {/* Fallback when snap is absent after loading */}
      {!isLoading && snapFresh && !br && (
        <p className="text-sm text-[var(--faint)]">Bridge data not yet available in this indexer snapshot.</p>
      )}

      {/* Live strip when no indexer data yet */}
      {!isLoading && !snapFresh && liveTransfers > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            ['Into Arc · since open', liveIn > 0 ? fmtUsd(liveIn) : '—', true],
            ['Out of Arc · since open', liveOut > 0 ? fmtUsd(liveOut) : '—', false],
            ['Net · since open', liveIn === 0 && liveOut === 0 ? '—' : (liveNet >= 0 ? `+${fmtUsd(liveNet)}` : `−${fmtUsd(Math.abs(liveNet))}`), liveNet >= 0],
            ['Transfers · since open', fmtCount(liveTransfers), true],
          ] as [string, string, boolean][]).map(([label, val]) => (
            <div key={label}>
              <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">{label}</p>
              <p className="mt-1 font-['Geist_Mono'] text-[22px] font-light tabular-nums text-white">{val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── b) Stablecoin supply ──────────────────────────────────────────────────────

function StablecoinCard() {
  const stables = useStablecoins()

  const sliced = useMemo(() => {
    if (!stables.data) return []
    const full = lastFullDay(stables.data.series)
    const last = full.length > 0 ? full[full.length - 1] : null
    const cutoff = last ? last.date - 30 * 86400 : 0
    return full.filter(p => p.date >= cutoff)
  }, [stables.data])

  const chartData = sliced.map(p => ({ label: utcDateLabel(p.date), usd: p.usd }))
  const seriesArr = stables.data?.series ?? []
  const latest = seriesArr.length > 0 ? seriesArr[seriesArr.length - 1]?.usd : undefined
  const change = stables.data ? latestAndChange(stables.data.series, 1) : null
  const change7d = stables.data?.change7d

  function fmtChange(c: number | null): { text: string; positive: boolean } | null {
    if (c === null) return null
    return { text: (c >= 0 ? '+' : '') + (c * 100).toFixed(1) + '%', positive: c >= 0 }
  }

  return (
    <div className="arc-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="arc-eyebrow">Stablecoin supply on Arc</p>
          {latest != null && (
            <p className="mt-1 text-xl font-light tabular-nums text-white">
              {fmtUsd(latest)}
              {change7d && fmtChange(change7d.change) && (
                <span className="ml-2 text-sm" style={{ color: (fmtChange(change7d.change)?.positive ?? false) ? 'var(--positive)' : 'var(--negative)' }}>
                  {fmtChange(change7d.change)?.text} 7d
                </span>
              )}
            </p>
          )}
          {change && fmtChange(change.change) && (
            <p className="text-xs" style={{ color: (fmtChange(change.change)?.positive ?? false) ? 'var(--positive)' : 'var(--negative)' }}>
              {fmtChange(change.change)?.text} 24h
            </p>
          )}
        </div>
      </div>

      {stables.isLoading && <div className="h-[200px] animate-pulse rounded bg-white/5" />}
      {stables.isError && <p className="py-4 text-sm text-[var(--muted)]">Could not load stablecoin data.</p>}
      {!stables.isLoading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={CHART_GRAD_ID} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a9c4ea" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#a9c4ea" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1e6).toFixed(0)}M`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v: unknown) => [`$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, '']}
            />
            <Area type="monotone" dataKey="usd" stroke="#a9c4ea" strokeWidth={1.8}
              fill={`url(#${CHART_GRAD_ID})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      <p className="mt-2 text-xs text-[var(--faint)]">30-day chart · UTC days · latest day may be incomplete.</p>
    </div>
  )
}

// ── c) DEX volume by venue ────────────────────────────────────────────────────

function DexVenueCard() {
  const dexs = useDexs()

  const { rows, venuesSum } = useMemo(() => {
    if (!dexs.data) return { rows: [], venuesSum: 0 }
    return venueShares(dexs.data.protocols, 4, dexs.data.total24h)
  }, [dexs.data])

  const maxShare = rows[0]?.share ?? 1

  return (
    <div className="arc-card p-5">
      <p className="arc-eyebrow mb-3">DEX volume by venue, 24h</p>
      {dexs.isLoading && <div className="h-[180px] animate-pulse rounded bg-white/5" />}
      {dexs.isError && <p className="py-4 text-sm text-[var(--muted)]">Could not load DEX data.</p>}
      {!dexs.isLoading && rows.length > 0 && (
        <>
          <ul className="space-y-3">
            {rows.map((row: { name: string; total24h: number; share: number }, i: number) => (
              <li key={row.name}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[15px] font-light text-white">{row.name}</span>
                  <span className="text-sm tabular-nums text-[var(--muted)]">
                    {(row.share * 100).toFixed(1)}%
                    {row.total24h > 0 && <span className="ml-2 text-[var(--faint)]">({fmtUsd(row.total24h)})</span>}
                  </span>
                </div>
                <div className="h-px w-full bg-[var(--line)]">
                  <div className="h-px bg-[var(--periwinkle)] transition-all duration-700"
                    style={{ width: maxShare > 0 ? `${(row.share / maxShare * 100).toFixed(1)}%` : '0%', opacity: Math.max(0.3, 1 - i * 0.12) }} />
                </div>
              </li>
            ))}
          </ul>
          {venuesSum > 0 && (
            <p className="mt-3 text-xs text-[var(--faint)]">Total tracked: {fmtUsd(venuesSum)}</p>
          )}
        </>
      )}
      <p className="mt-2 text-xs text-[var(--faint)]">Source: DefiLlama.</p>
    </div>
  )
}

// ── d) Networks around Arc table ──────────────────────────────────────────────

function NetworksTableCard({ stats }: { stats: CctpStats }) {
  const { data: chainSizesData } = useChainSizes()
  const sizes = chainSizesData?.sizes

  const rows = useMemo(() => {
    if (!sizes) return PORT_DOMAINS.map(d => ({ domain: d, name: domainName(d), assets: null as number | null, dex24h: null as number | null, weight: 0.5, inCount: 0, outCount: 0 }))
    return PORT_DOMAINS.map(d => {
      const sz = sizes.find((s: { domain: number; assets: number | null; dex24h: number | null; weight: number }) => s.domain === d)
      const ps = stats.ports[d]
      return {
        domain: d,
        name: domainName(d),
        assets: sz?.assets ?? null,
        dex24h: sz?.dex24h ?? null,
        weight: sz?.weight ?? 0,
        inCount: ps?.inCount ?? 0,
        outCount: ps?.outCount ?? 0,
      }
    }).sort((a, b) => b.weight - a.weight)
  }, [sizes, stats])

  return (
    <div className="arc-card overflow-hidden">
      <p className="arc-eyebrow border-b border-[var(--line)] px-5 py-3.5">Networks around Arc</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--line)]">
              {['Network', 'In DeFi apps', 'DEX vol 24h', 'CCTP in', 'CCTP out'].map(h => (
                <th key={h} className="arc-eyebrow !text-[10px] px-4 py-3 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.domain} className="arc-row border-b border-[rgba(170,196,234,0.09)] last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(14,33,64,0.9)]">
                      <PortFace domain={r.domain} size={24} />
                    </span>
                    <span className="text-sm text-white">{r.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-[var(--muted)]">
                  {r.assets !== null ? fmtUsd(r.assets) : '—'}
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-[var(--muted)]">
                  {r.dex24h !== null ? fmtUsd(r.dex24h) : '—'}
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-[var(--periwinkle)]">
                  {r.inCount > 0 ? fmtCount(r.inCount) : '—'}
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-[var(--muted)]">
                  {r.outCount > 0 ? fmtCount(r.outCount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── e) All bridges · last hour ────────────────────────────────────────────────

const BRIDGE_LABELS: Record<string, string> = {
  cctp: 'CCTP',
  gateway: 'Circle Gateway',
  across: 'Across',
  hyperlane: 'Hyperlane warp routes',
  lifi: 'LI.FI',
  debridge: 'deBridge',
}
const BRIDGE_ORDER = ['cctp', 'gateway', 'across', 'hyperlane', 'lifi', 'debridge'] as const

const FOOTNOTE_TEXT =
  'Read from Arc logs: CCTP, Circle Gateway, Across, Hyperlane warp routes, LI.FI and deBridge. ' +
  'LayerZero, Relay and Wormhole are not included yet. ' +
  'Amounts count USDC only; transfers of other tokens are counted without an amount. ' +
  'A transfer is counted once even when several bridges touch it.'

function AllBridgesCard() {
  const { moves, summary, loading, error, lastUpdated } = useBridgeHour()

  const total = moves.length
  const totalUsdc = BRIDGE_ORDER.reduce((sum, b) => {
    const s = summary.byBridge[b]
    return sum + (s ? s.in.usdc + s.out.usdc : 0)
  }, 0)

  const maxCount = BRIDGE_ORDER.reduce((m, b) => {
    const s = summary.byBridge[b]
    return Math.max(m, s ? s.in.count + s.out.count : 0)
  }, 1)

  return (
    <div className="arc-card p-5">
      <p className="arc-eyebrow mb-1">All bridges · last hour</p>
      {loading && <div className="h-32 animate-pulse rounded bg-white/5" />}
      {error && <p className="mt-3 text-sm text-[var(--negative)]">{error}</p>}
      {!loading && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">Transfers</p>
              <p className="mt-1 font-['Geist_Mono'] text-[22px] font-light tabular-nums text-white">{total.toLocaleString('en-US')}</p>
            </div>
            {totalUsdc > 0 && (
              <div>
                <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">USDC moved</p>
                <p className="mt-1 font-['Geist_Mono'] text-[22px] font-light tabular-nums text-white">{pillAmount(totalUsdc)}</p>
              </div>
            )}
            {lastUpdated && (
              <div className="col-span-full sm:col-span-1">
                <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">Updated</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            )}
          </div>

          <ul className="space-y-2">
            {BRIDGE_ORDER.map(bridge => {
              const s = summary.byBridge[bridge]
              const count = s ? s.in.count + s.out.count : 0
              const usdc = s ? s.in.usdc + s.out.usdc : 0
              const barW = count > 0 ? `${Math.round((count / maxCount) * 100)}%` : '0%'
              return (
                <li key={bridge} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: BRIDGE_COLORS[bridge] }}
                    aria-hidden
                  />
                  <span className="w-[130px] shrink-0 text-sm text-white">{BRIDGE_LABELS[bridge]}</span>
                  <div className="relative flex-1">
                    <div className="h-1 w-full rounded-full bg-white/10">
                      <div
                        className="h-1 rounded-full transition-all duration-500"
                        style={{ width: barW, background: BRIDGE_COLORS[bridge] }}
                      />
                    </div>
                  </div>
                  <span className="w-16 text-right font-['Geist_Mono'] text-[12px] text-[var(--muted)]">
                    {count > 0 ? count.toLocaleString('en-US') : '—'}
                  </span>
                  {usdc > 0 && (
                    <span className="w-16 text-right font-['Geist_Mono'] text-[12px] text-[var(--periwinkle)]">
                      {pillAmount(usdc)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-[var(--faint)]">{FOOTNOTE_TEXT}</p>
        </>
      )}
    </div>
  )
}

// ── Page section ──────────────────────────────────────────────────────────────

interface Props {
  /** Live CCTP session stats from useLiveBlocks → useOrbitFeed. */
  stats: CctpStats
  /** True when chain size data came from the API; false = fallback equal weights. */
  chainSizesLive: boolean
}

export function CapitalSection({ stats, chainSizesLive }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="arc-eyebrow mb-3">Capital & flows</p>
        <h2 className="text-[clamp(22px,3vw,36px)] font-light leading-tight text-white">
          Money moving on and through Arc.
        </h2>
      </div>

      {!chainSizesLive && (
        <p className="text-sm text-[var(--faint)]">Network sizes unavailable right now.</p>
      )}

      {/* a) spans both columns */}
      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <CctpFlowCard stats={stats} />
        <StablecoinCard />
        <DexVenueCard />
        <AllBridgesCard />
      </div>

      <NetworksTableCard stats={stats} />

      <p className="text-xs leading-relaxed text-[var(--faint)]">
        CCTP flows are v2 burns and mints read from Arc. Network sizes come from DefiLlama (assets in DeFi apps and 24h DEX volume). Bridge coverage: CCTP, Circle Gateway, Across, Hyperlane, LI.FI, deBridge.
      </p>
    </div>
  )
}
