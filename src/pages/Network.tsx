import { DownloadMenu } from '@/components/shared/DownloadMenu'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useState, useRef } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, ExternalLink, Gauge, Layers, Receipt, Timer, Users, Zap } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { useNetworkStats } from '@/hooks/useNetworkStats'
import { useMemoFeed, MEMO_CONTRACT } from '@/hooks/useMemoFeed'
import { TOKEN_MESSENGER, useBridgeFlow } from '@/hooks/useBridgeFlow'
import { NETWORK, NETWORKS } from '@/lib/chain'
import { resolveNetKey, paramsFor } from '@/lib/networkParam'
import { useSearchParams } from 'react-router-dom'
import { AddNetworkButton } from '@/components/shared/AddNetworkButton'
import { compact } from '@/lib/arcscan'
import { barWidth, bridgeSpanMinutes, chartYMin, minutesAgo, netFlow, percentOf, windowIncomplete } from '@/lib/networkView'
import { useIndexer } from '@/hooks/useIndexer'
import { useLatest, isLatestFresh, networkHealthCards, successRateSeries } from '@/hooks/useLatest'
import { useSupply } from '@/hooks/useExtras'
import {
  automatedShare,
  smartAccountShare,
  paymentBuckets,
  bigTransfers,
  mintBurn,
  bridgeSummary,
  supplyChange,
  type ExtendedWindow,
  type SeriesPointMin,
  type SupplyJson,
} from '@/lib/activityMix'


const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const num = (n: number, d = 1) => n.toFixed(d)

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="arc-eyebrow mb-3">{eyebrow}</p>
        <SplitLines as="h2" className="text-[clamp(28px,3.6vw,44px)] font-light leading-[1.05] tracking-tight text-white" lines={[{ text: title }]} />
      </div>
      {children}
    </div>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="arc-panel flex gap-3 px-4 py-3 text-sm leading-relaxed text-[var(--muted)]">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--periwinkle)]" />
      <p>{children}</p>
    </div>
  )
}


/** Bridge + memo sections: they need ArcScan, which only serves the testnet without a key. */
function TestnetFlows() {
  const memo = useMemoFeed(24)
  const bridge = useBridgeFlow()
  const EXPLORER = NETWORKS.testnet.explorerUrl
  return (
    <>
      {/* ---------------- Bridge ---------------- */}
      <section>
        <SectionHead eyebrow="Bridge" title="USDC crossing Arc">
          <a href={`${EXPLORER}/address/${TOKEN_MESSENGER}`} target="_blank" rel="noreferrer" className="arc-btn-ghost">
            CCTP v2 contract <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </SectionHead>

        {bridge.isLoading ? (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="arc-card h-[130px] animate-pulse" />)}</div>
        ) : bridge.data ? (
          <>
            <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard label="Sent out of Arc" value={bridge.data.outUsdc} format={n => `$${compact(n, 2)}`} subValue={`${bridge.data.outCount} burns`} icon={ArrowUpRight} />
              <StatCard label="Received on Arc" value={bridge.data.inUsdc} format={n => `$${compact(n, 2)}`} subValue={`${bridge.data.inCount} mints`} icon={ArrowDownLeft} />
              <StatCard label="Net flow" value={netFlow(bridge.data.inUsdc, bridge.data.outUsdc).amount} format={n => `${netFlow(bridge.data!.inUsdc, bridge.data!.outUsdc).incoming ? '+' : '−'}$${compact(n, 2)}`} subValue={netFlow(bridge.data.inUsdc, bridge.data.outUsdc).incoming ? 'more came in than left' : 'more left than came in'} icon={Layers} />
              <StatCard label="Bridge fees" value={bridge.data.feesUsdc} format={n => `$${n.toFixed(2)}`} subValue="collected on inbound mints" icon={Receipt} />
            </Reveal>

            {bridge.data.byDestination.length > 0 && (
              <Reveal delay={0.05} className="arc-card mt-4 p-5">
                <p className="arc-eyebrow mb-4">Where outbound USDC went</p>
                <ul className="space-y-3.5">
                  {bridge.data.byDestination.map((d, i) => (
                    <li key={d.domain}>
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-[15px] font-light text-white">{d.name}</span>
                        <span className="text-sm tabular-nums text-[var(--muted)]">${compact(d.usdc, 2)} · {d.count}×</span>
                      </div>
                      <div className="h-px w-full bg-[var(--line)]">
                        <div className="h-px bg-[var(--periwinkle)]" style={{ width: `${(d.usdc / bridge.data!.byDestination[0].usdc) * 100}%`, opacity: Math.max(0.35, 1 - i * 0.14) }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
            <p className="mt-4 text-sm text-[var(--faint)]">
              Read from the newest {bridge.data.blockSpan.toLocaleString()} blocks (about {bridgeSpanMinutes(bridge.data.blockSpan)} minutes) of CCTP events. Inbound transfers do not say where they came from, so only outbound destinations are broken down.
            </p>
          </>
        ) : (
          <Callout>ArcScan did not answer for bridge events. Reload in a moment.</Callout>
        )}
      </section>

      {/* ---------------- Memo flow ---------------- */}
      <section>
        <SectionHead eyebrow="Payments" title="Memo flow — invoices, onchain">
          <a href={`${EXPLORER}/address/${MEMO_CONTRACT}`} target="_blank" rel="noreferrer" className="arc-btn-ghost">
            Memo contract <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </SectionHead>

        <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            ['Memos · 24h', memo.total],
            ['Unique senders', memo.uniqueSenders],
            ['Unique targets', memo.uniqueTargets],
            ['Unique memo IDs', memo.uniqueMemoIds],
          ].map(([label, v]) => (
            <StatCard key={label as string} label={label as string} value={v as number}
              format={n => Math.round(n).toString()} icon={Receipt}
              isLoading={memo.isLoading} />
          ))}
        </Reveal>

        {memo.isLoading && (
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/8">
            <div className="h-full bg-[var(--periwinkle)] transition-all duration-300" style={{ width: `${memo.progress * 100}%` }} />
          </div>
        )}

        {memo.error && <div className="mt-4"><Callout>Could not read memo events: {memo.error}</Callout></div>}

        {!memo.isLoading && memo.failedWindows > 0 && (
          <Reveal delay={0.04} className="mt-4">
            <Callout>
              The RPC rate-limited {memo.failedWindows} of {memo.totalWindows} block ranges, so these counts are a lower bound. Reload in a minute to fill the gaps.
            </Callout>
          </Reveal>
        )}

        {memo.entries.length > 0 && (
          <Reveal delay={0.08} className="arc-card mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    {['Block', 'Sender', 'Target', 'Memo ID', 'Memo'].map(h => (
                      <th key={h} className="arc-eyebrow !text-[10px] px-5 py-3.5 text-left font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {memo.entries.map((e, i) => (
                    <tr key={`${e.tx}-${i}`} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                      <td className="px-5 py-3.5 text-sm tabular-nums text-[var(--muted)]">
                        <a href={`${EXPLORER}/tx/${e.tx}`} target="_blank" rel="noreferrer" className="hover:text-white">
                          {e.block.toLocaleString()}
                        </a>
                      </td>
                      <td className="px-5 py-3.5 font-['Geist_Mono'] text-xs text-white">{short(e.sender)}</td>
                      <td className="px-5 py-3.5 font-['Geist_Mono'] text-xs text-white">{short(e.target)}</td>
                      <td className="px-5 py-3.5 font-['Geist_Mono'] text-xs text-[var(--muted)]">{short(e.memoId)}</td>
                      <td className="max-w-[260px] truncate px-5 py-3.5 text-sm text-[var(--muted)]">
                        {e.text ?? <span className="text-[var(--faint)]">binary</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        )}

        {memo.topPairs.length > 0 && (
          <Reveal delay={0.1} className="mt-4">
            <p className="arc-eyebrow mb-3">Most repeated payer → payee pairs</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {memo.topPairs.map(p => (
                <div key={`${p.sender}${p.target}`} className="arc-panel flex items-center justify-between px-4 py-3">
                  <span className="font-['Geist_Mono'] text-xs text-white">{short(p.sender)} → {short(p.target)}</span>
                  <span className="text-sm tabular-nums text-[var(--periwinkle)]">{p.count}×</span>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </section>
    </>
  )
}

// ── Shared window-toggle ──────────────────────────────────────────────────────

function WindowToggle({ win, setWin, keys = ['1h', '24h'] }: {
  win: string
  setWin: (k: '1h' | '24h' | '7d') => void
  keys?: ('1h' | '24h' | '7d')[]
}) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--line)] p-1" role="tablist" aria-label="Window">
      {keys.map(k => (
        <button key={k} role="tab" aria-selected={win === k} onClick={() => setWin(k)}
          className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${win === k ? 'bg-white/[0.08] text-white' : 'text-[var(--muted)] hover:text-white'}`}>
          {k}
        </button>
      ))}
    </div>
  )
}

// ── Utility: format USDC amounts with en-US locale ────────────────────────────

function fmtUsdc(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtCount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// ── Activity mix section ──────────────────────────────────────────────────────

function ActivityMixSection({
  win,
  setWin,
  window: w,
  series,
}: {
  win: '1h' | '24h' | '7d'
  setWin: (k: '1h' | '24h' | '7d') => void
  window: ExtendedWindow
  series: SeriesPointMin[]
}) {
  const auto = automatedShare(w, series)
  const sa = smartAccountShare(w, series)
  const buckets = paymentBuckets(w)

  const hasAny = auto !== null || sa !== null || buckets !== null
  if (!hasAny) return null

  return (
    <section>
      <SectionHead eyebrow="Activity" title="Activity mix">
        <WindowToggle win={win} setWin={setWin} keys={['1h', '24h', '7d']} />
      </SectionHead>

      {(auto !== null || sa !== null) && (
        <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {auto !== null && (
            <StatCard
              label="Automated txs"
              value={auto.share * 100}
              format={n => `${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
              subValue={`${fmtCount(auto.senders)} senders${auto.note ? ` · ${auto.note}` : ''}`}
              icon={Zap}
            />
          )}
          {sa !== null && (
            <StatCard
              label="Smart-account ops"
              value={sa.share * 100}
              format={n => `${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
              subValue={`${fmtCount(sa.aa)} ERC-4337 ops${sa.note ? ` · ${sa.note}` : ''}`}
              icon={Users}
            />
          )}
        </Reveal>
      )}

      {buckets !== null && (
        <Reveal delay={0.04} className="arc-card mt-4 p-5">
          <p className="arc-eyebrow mb-4">Payment size{buckets.note ? ` · ${buckets.note}` : ''}</p>
          <div className="space-y-4">
            {buckets.buckets.map(b => (
              <div key={b.label}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[15px] font-light text-white">{b.label}</span>
                  <span className="text-sm tabular-nums text-[var(--muted)]">
                    {fmtCount(b.count)} txs · ${compact(b.usdcVolume, 2)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)] flex-1">
                    <div
                      className="h-full rounded-full bg-[var(--periwinkle)]"
                      style={{ width: `${((b.countShare ?? 0) * 100).toFixed(1)}%`, opacity: 0.8 }}
                    />
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)] flex-1">
                    <div
                      className="h-full rounded-full bg-white/60"
                      style={{ width: `${((b.volumeShare ?? 0) * 100).toFixed(1)}%`, opacity: 0.7 }}
                    />
                  </div>
                </div>
                <div className="mt-0.5 flex justify-between text-[10px] text-[var(--faint)]">
                  <span>{b.countShare != null ? `${(b.countShare * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}% of txs` : ''}</span>
                  <span>{b.volumeShare != null ? `${(b.volumeShare * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}% of volume` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      <p className="mt-4 text-sm text-[var(--faint)]">
        Automated = senders with 60+ transactions in an hour. Payment size = largest USDC transfer per transaction.
      </p>
    </section>
  )
}

// ── Money flow section ────────────────────────────────────────────────────────

function MoneyFlowSection({
  win,
  setWin,
  window: w,
  netKey,
  supplyData,
}: {
  win: '1h' | '24h' | '7d'
  setWin: (k: '1h' | '24h' | '7d') => void
  window: ExtendedWindow
  netKey: 'testnet' | 'mainnet'
  supplyData: SupplyJson | null | undefined
}) {
  const EXPLORER = NETWORKS[netKey].explorerUrl

  const mb = mintBurn(w)
  const big = bigTransfers(w, 10)

  const supplyHours = win === '1h' ? 1 : win === '24h' ? 24 : 168
  const usdcSupply = supplyData ? supplyChange(supplyData, 'usdc', supplyHours) : null
  const eurcSupply = supplyData ? supplyChange(supplyData, 'eurc', supplyHours) : null

  const hasAny = mb !== null || big !== null || usdcSupply !== null
  if (!hasAny) return null

  return (
    <section>
      <SectionHead eyebrow="USDC" title="Money flow">
        <WindowToggle win={win} setWin={setWin} keys={['1h', '24h', '7d']} />
      </SectionHead>

      {(usdcSupply !== null || eurcSupply !== null) && (
        <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {usdcSupply !== null && (
            <StatCard
              label="USDC supply"
              value={usdcSupply.supply}
              format={n => `$${compact(n, 2)}`}
              subValue={
                usdcSupply.change !== 0
                  ? `${usdcSupply.change > 0 ? '+' : ''}${fmtUsdc(usdcSupply.change, 2)} this ${win}`
                  : undefined
              }
              icon={Layers}
            />
          )}
          {eurcSupply !== null && (
            <StatCard
              label="EURC supply"
              value={eurcSupply.supply}
              format={n => `€${compact(n, 2)}`}
              subValue={
                eurcSupply.change !== 0
                  ? `${eurcSupply.change > 0 ? '+' : ''}${fmtUsdc(eurcSupply.change, 2)} this ${win}`
                  : undefined
              }
              icon={Layers}
            />
          )}
          {mb !== null && (
            <>
              <StatCard
                label="USDC minted"
                value={mb.usdcMinted}
                format={n => `$${compact(n, 2)}`}
                subValue={mb.note ? mb.note : `this ${win}`}
                icon={ArrowDownLeft}
              />
              <StatCard
                label="USDC burned"
                value={mb.usdcBurned}
                format={n => `$${compact(n, 2)}`}
                subValue={mb.usdcNet < 0 ? `net −$${compact(Math.abs(mb.usdcNet), 2)}` : `net +$${compact(mb.usdcNet, 2)}`}
                icon={ArrowUpRight}
              />
            </>
          )}
        </Reveal>
      )}

      {big !== null && (
        <Reveal delay={0.05} className="arc-card mt-4 overflow-hidden">
          <p className="arc-eyebrow border-b border-[var(--line)] px-5 py-3.5">Largest transfers ≥ $5M</p>
          <ul>
            {big.map((t, i) => {
              const addrRe = /^0x[0-9a-fA-F]{40}$/
              const txRe = /^0x[0-9a-fA-F]{64}$/
              const fromLink = addrRe.test(t.from) ? `${EXPLORER}/address/${t.from}` : null
              const toLink = addrRe.test(t.to) ? `${EXPLORER}/address/${t.to}` : null
              const txLink = txRe.test(t.tx) ? `${EXPLORER}/tx/${t.tx}` : null
              return (
                <li key={`${t.tx}-${i}`} className="arc-row grid grid-cols-[1fr_1fr_auto] items-center gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0">
                  <div className="min-w-0 flex gap-3 items-center">
                    <span className="text-sm tabular-nums text-[var(--faint)] w-5 shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex gap-1 text-xs font-['Geist_Mono'] text-[var(--muted)]">
                        {fromLink
                          ? <a href={fromLink} target="_blank" rel="noreferrer" className="hover:text-white">{short(t.from)}</a>
                          : <span>{short(t.from)}</span>
                        }
                        <span>→</span>
                        {toLink
                          ? <a href={toLink} target="_blank" rel="noreferrer" className="hover:text-white">{short(t.to)}</a>
                          : <span>{short(t.to)}</span>
                        }
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-light tabular-nums text-white">${compact(t.amt, 2)}</p>
                  </div>
                  <div>
                    {txLink && (
                      <a href={txLink} target="_blank" rel="noreferrer" aria-label="View transaction on the explorer" className="text-[var(--faint)] hover:text-[var(--periwinkle)]">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Reveal>
      )}
    </section>
  )
}

// ── Bridge (indexer) section — mainnet only ───────────────────────────────────

function IndexerBridgeSection({
  win,
  setWin,
  window: w,
}: {
  win: '1h' | '24h' | '7d'
  setWin: (k: '1h' | '24h' | '7d') => void
  window: ExtendedWindow
}) {
  const br = bridgeSummary(w)
  if (!br) return null

  const maxDomainUsdc = br.topDomains[0]?.usdc ?? 0

  return (
    <section>
      <SectionHead eyebrow="Bridge" title="USDC crossing Arc (indexer)">
        <WindowToggle win={win} setWin={setWin} keys={['1h', '24h', '7d']} />
      </SectionHead>

      <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Sent out of Arc"
          value={br.outUsdc}
          format={n => `$${compact(n, 2)}`}
          subValue={`${fmtCount(br.outCount)} burns${br.note ? ` · ${br.note}` : ''}`}
          icon={ArrowUpRight}
        />
        <StatCard
          label="Received on Arc"
          value={br.inCount}
          format={n => fmtCount(n)}
          subValue={`mints${br.note ? ` · ${br.note}` : ''}`}
          icon={ArrowDownLeft}
        />
        <StatCard
          label="Bridge fees"
          value={br.fees}
          format={n => `$${fmtUsdc(n, 2)}`}
          subValue="collected on burns"
          icon={Receipt}
        />
        <StatCard
          label="Net direction"
          value={Math.abs(br.inCount - br.outCount)}
          format={n => fmtCount(n)}
          subValue={br.netDirection === 'in' ? 'more came in' : br.netDirection === 'out' ? 'more left' : 'balanced'}
          icon={Layers}
        />
      </Reveal>

      {br.topDomains.length > 0 && (
        <Reveal delay={0.05} className="arc-card mt-4 p-5">
          <p className="arc-eyebrow mb-4">Top destination chains (by USDC)</p>
          <ul className="space-y-3.5">
            {br.topDomains.map((d, i) => (
              <li key={d.domainId}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[15px] font-light text-white">{d.name}</span>
                  <span className="text-sm tabular-nums text-[var(--muted)]">${compact(d.usdc, 2)} · {fmtCount(d.count)}×</span>
                </div>
                <div className="h-px w-full bg-[var(--line)]">
                  <div
                    className="h-px bg-[var(--periwinkle)]"
                    style={{ width: barWidth(d.usdc, maxDomainUsdc), opacity: Math.max(0.35, 1 - i * 0.14) }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </section>
  )
}

// ── Network health cards ──────────────────────────────────────────────────────

function NetworkHealthSection({ netKey }: { netKey: 'testnet' | 'mainnet' }) {
  const { data: snap } = useLatest(netKey)
  const [win, setWin] = useState<'1h' | '24h'>('24h')
  const chartRef = useRef<HTMLDivElement>(null)

  if (!snap || !isLatestFresh(snap)) return null

  const w = snap.windows[win]
  const cards = networkHealthCards(w)
  const series = successRateSeries(snap.series, 48)
  const yMin = chartYMin(series)

  return (
    <section>
      <SectionHead eyebrow="Health" title="Success rate and fees">
        <div className="inline-flex rounded-xl border border-[var(--line)] p-1" role="tablist" aria-label="Window">
          {(['1h', '24h'] as const).map(k => (
            <button key={k} role="tab" aria-selected={win === k} onClick={() => setWin(k)}
              className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${win === k ? 'bg-white/[0.08] text-white' : 'text-[var(--muted)] hover:text-white'}`}>
              {k}
            </button>
          ))}
        </div>
      </SectionHead>

      <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {cards.successRate !== null && (
          <StatCard
            label="Success rate"
            value={cards.successRate}
            format={n => `${n.toFixed(2)}%`}
            subValue="1 − failed / txs"
            icon={Activity}
          />
        )}
        <StatCard
          label="Network fees"
          value={cards.fees}
          format={n => `${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} USDC`}
          subValue="gas paid in USDC"
          icon={Receipt}
        />
        {cards.avgFee !== null && (
          <StatCard
            label="Average fee"
            value={cards.avgFee}
            format={n => `${n.toFixed(4)} USDC`}
            subValue="per transaction"
            icon={Receipt}
          />
        )}
        <StatCard
          label="Transactions"
          value={cards.txs}
          format={n => compact(n, 1)}
          subValue={`in this ${win} window`}
          icon={Activity}
        />
      </Reveal>

      {series.length > 0 && (
        <Reveal delay={0.04} className="arc-card mt-4 p-5">
          <div className="h-[180px]" ref={chartRef}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(170,196,234,0.1)" />
                <XAxis dataKey="hour" tick={false} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[yMin, 100]}
                  tick={{ fill: '#8da2c0', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ background: '#10213b', border: '1px solid rgba(170,196,234,0.28)', borderRadius: 12, color: '#eaf1fb' }}
                  labelFormatter={v => String(v)}
                  formatter={(v) => [v !== null ? `${Number(v).toFixed(2)}%` : '—', 'success rate']}
                />
                <Line
                  type="monotone"
                  dataKey="successRate"
                  stroke="#a9c4ea"
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="arc-eyebrow !text-[10px]">Hourly success rate · last 48 hours</p>
            <DownloadMenu
              page="network-success-rate"
              net={netKey}
              source="Pulsarc indexer, hourly series (latest.json)"
              chartRef={chartRef}
              columns={[
                { key: 'hour', label: 'Hour (UTC)' },
                { key: 'txs', label: 'Transactions' },
                { key: 'failed', label: 'Failed' },
                { key: 'success_rate_pct', label: 'Success rate %' },
              ]}
              rows={snap.series.slice(-48).map(pt => ({
                hour: pt.hour,
                txs: pt.txs,
                failed: pt.failed,
                success_rate_pct: pt.txs === 0 ? null : parseFloat(((1 - pt.failed / pt.txs) * 100).toFixed(2)),
              }))}
            />
          </div>
        </Reveal>
      )}
    </section>
  )
}

function MainnetNotice() {
  return (
    <section>
      <SectionHead eyebrow="Payments & bridge" title="Needs an indexer on mainnet" />
      <Callout>
        Mainnet's explorer API sits behind a bot check, so a browser-only site cannot read bridge flows, memos or token holders from it. Block, fee and throughput numbers above come straight from the open mainnet RPC. Memo, bridge and app rankings for mainnet arrive with our own indexer.
      </Callout>
    </section>
  )
}

/** Busiest mainnet contracts, from the hourly aggregates the indexer publishes. */
function MainnetIndexed() {
  const { data, isLoading } = useIndexer('mainnet')
  const [win, setWin] = useState<'1h' | '24h' | '7d'>('24h')
  if (isLoading) return <div className="arc-card h-[260px] animate-pulse" />
  if (!data) return <MainnetNotice />

  const w = data.windows[win]
  const failRate = percentOf(w.failed, w.txs)
  const EXPLORER = NETWORKS.mainnet.explorerUrl
  const aaTxs = w.top.reduce((n, c) => n + (data.labels?.[c.address]?.kind === 'account-abstraction' ? c.txs : 0), 0)
  const aaShare = percentOf(aaTxs, w.txs)
  const covered = windowIncomplete(w.hours, win)

  return (
    <section>
      <SectionHead eyebrow="Mainnet · indexed" title="Busiest contracts">
        <div className="inline-flex rounded-xl border border-[var(--line)] p-1" role="tablist" aria-label="Window">
          {(['1h', '24h', '7d'] as const).map(k => (
            <button key={k} role="tab" aria-selected={win === k} onClick={() => setWin(k)}
              className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${win === k ? 'bg-white/[0.08] text-white' : 'text-[var(--muted)] hover:text-white'}`}>
              {k}
            </button>
          ))}
        </div>
      </SectionHead>

      <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Transactions" value={w.txs} format={n => compact(n, 1)} subValue={`${w.hours}h indexed`} icon={Activity} />
        <StatCard label="Failed" value={failRate} format={n => `${n.toFixed(1)}%`} subValue={`${compact(w.failed, 1)} reverted`} icon={Zap} />
        <StatCard label="Fees paid" value={w.fees} format={n => `$${compact(n, 2)}`} subValue="USDC, gas only" icon={Receipt} />
        <StatCard label="Wallet-hours" value={w.walletHours} format={n => compact(n, 1)} subValue="distinct wallets, summed per hour" icon={Users} />
      </Reveal>

      {aaTxs > 0 && (
        <Reveal delay={0.03} className="mt-4">
          <Callout>
            {aaShare.toFixed(1)}% of transactions in this window are bundles sent to the ERC-4337 EntryPoint — the gasless smart-account path. Each bundle can carry several user operations, so this understates the number of operations.
          </Callout>
        </Reveal>
      )}

      <Reveal delay={0.05} className="arc-card mt-4 overflow-hidden">
        <div className="grid grid-cols-[28px_1fr_90px_90px_80px] gap-3 border-b border-[var(--line)] px-5 py-3 text-xs uppercase tracking-wider text-[var(--faint)] sm:grid-cols-[36px_1fr_120px_120px_100px]">
          <span>#</span><span>Contract</span><span className="text-right">Txs</span><span className="text-right">Wallet-hrs</span><span className="text-right">Fees</span>
        </div>
        <ul>
          {w.top.slice(0, 25).map((c, i) => (
            <li key={c.address} className="arc-row grid grid-cols-[28px_1fr_90px_90px_80px] items-center gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0 sm:grid-cols-[36px_1fr_120px_120px_100px]">
              <span className="text-sm tabular-nums text-[var(--faint)]">{i + 1}</span>
              <a href={`${EXPLORER}/address/${c.address}`} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm text-white hover:text-[var(--periwinkle)]">
                {data.labels?.[c.address]?.name ?? <span className="font-['Geist_Mono']">{short(c.address)}</span>}
                {data.labels?.[c.address]?.name && <span className="ml-2 font-['Geist_Mono'] text-xs text-[var(--faint)]">{short(c.address)}</span>}
              </a>
              <span className="text-right text-sm tabular-nums text-white">{compact(c.txs, 1)}</span>
              <span className="text-right text-sm tabular-nums text-[var(--muted)]">{compact(c.walletHours, 1)}</span>
              <span className="text-right text-sm tabular-nums text-[var(--muted)]">${compact(c.fees, 2)}</span>
            </li>
          ))}
        </ul>
      </Reveal>
      <p className="mt-4 text-sm text-[var(--faint)]">
        Counted from every block by Pulsarc's own indexer, about {minutesAgo(Date.now(), data.generatedAt)} minutes ago.
        {covered ? ' The indexer is still catching up, so this window is not complete yet.' : ''} Wallet-hours add up the distinct wallets seen in each hour, so one wallet active for 3 hours counts 3 times. Names come from the contracts themselves or a short list of well-known ones; unnamed contracts show their address.
      </p>
    </section>
  )
}

export function Network() {
  const [params, setParams] = useSearchParams()
  const netKey: 'testnet' | 'mainnet' = resolveNetKey(params.get('net'), NETWORK.id)
  const net_is_testnet = netKey === 'testnet'
  const network = NETWORKS[netKey]
  const net = useNetworkStats(netKey)
  const loading = net.isLoading

  // Extra data hooks (indexer supply + bridge)
  const { data: snap } = useLatest(netKey)
  const { data: supplyData } = useSupply(netKey)
  const [extraWin, setExtraWin] = useState<'1h' | '24h' | '7d'>('24h')

  const snapFresh = snap && isLatestFresh(snap)
  const extWindow = snapFresh ? snap.windows[extraWin] as ExtendedWindow : null
  const extSeries: SeriesPointMin[] = snapFresh && snap.series ? snap.series : []

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="arc-eyebrow">Network · {network.name}</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-[var(--line)] p-1" role="tablist" aria-label="Network">
                {(['testnet', 'mainnet'] as const).map(k => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={netKey === k}
                    onClick={() => setParams(paramsFor(k, NETWORK.id), { replace: true })}
                    className={`rounded-lg px-3.5 py-1.5 text-sm capitalize transition-colors ${netKey === k ? 'bg-white/[0.08] text-white' : 'text-[var(--muted)] hover:text-white'}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <a href={network.explorerUrl} target="_blank" rel="noreferrer" className="arc-btn-ghost">
                {netKey === 'mainnet' ? 'Mainnet explorer' : 'Testnet explorer'} <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <AddNetworkButton network={netKey} />
            </div>
          </div>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[{ text: 'What Arc promises,' }, { text: 'measured.', className: 'text-[var(--periwinkle)]' }]}
          />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            Dollar-denominated fees, sub-second blocks and native payment memos — read straight from the chain, last {net.blocks.length || 30} blocks{net_is_testnet ? ' and 24 hours of memos' : ''}.
          </p>
        </section>
      </Reveal>

      {/* ---------------- Fee market ---------------- */}
      <section>
        <SectionHead eyebrow="Fee market" title="Predictable by design — or just quiet?" />
        {net.error && (
          <div className="mb-4">
            <Callout>The Arc RPC is rate-limiting this page right now. Retrying automatically — numbers will appear in a few seconds.</Callout>
          </div>
        )}
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Base fee" value={net.baseFeeGwei ?? 0} format={n => `${num(n, 0)} Gwei`}
            subValue="the Arc floor is 20 Gwei" icon={Zap} isLoading={loading} />
          <StatCard label="Cost of a transfer" value={net.transferCostUsdc ?? 0} format={n => `$${n.toFixed(5)}`}
            subValue="21,000 gas, paid in USDC" icon={Receipt} isLoading={loading} />
          <StatCard label="Blocks at the floor" value={(net.atFloorShare ?? 0) * 100} format={n => `${num(n, 0)}%`}
            subValue={`of the last ${net.blocks.length || 60} blocks`} icon={Gauge} isLoading={loading} />
          <StatCard label="Block fullness" value={(net.avgFullness ?? 0) * 100} format={n => `${num(n, 1)}%`}
            subValue="average gas used ÷ limit" icon={Timer} isLoading={loading} />
        </Reveal>

        {net.blocks.length > 0 && (
          <Reveal delay={0.03} className="arc-card mt-4 p-5">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={net.blocks} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(170,196,234,0.1)" />
                  <XAxis dataKey="number" tick={false} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, (max: number) => Math.max(40, Math.ceil(max * 1.2))]} tick={{ fill: '#8da2c0', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}`} />
                  <ReferenceLine y={20} stroke="#a9c4ea" strokeDasharray="4 4" label={{ value: '20 Gwei floor', fill: '#8da2c0', fontSize: 10, position: 'insideTopRight' }} />
                  <Tooltip
                    contentStyle={{ background: '#10213b', border: '1px solid rgba(170,196,234,0.28)', borderRadius: 12, color: '#eaf1fb' }}
                    labelFormatter={v => `Block ${Number(v).toLocaleString()}`}
                    formatter={(v) => [`${Number(v).toFixed(2)} Gwei`, 'base fee']}
                  />
                  <Line type="stepAfter" dataKey="baseFeeGwei" stroke="#ffffff" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="arc-eyebrow mt-3 !text-[10px]">Base fee per block · dashed line is the Arc 20 Gwei floor</p>
          </Reveal>
        )}

        {!loading && net.atFloorShare !== null && (
          <Reveal delay={0.05} className="mt-4">
            <Callout>
              {net.atFloorShare > 0.95
                ? `The fee has sat at the 20 Gwei floor for ${num(net.atFloorShare * 100, 0)}% of sampled blocks. That is stable — but with blocks only ${num((net.avgFullness ?? 0) * 100, 1)}% full, ${net_is_testnet ? 'the testnet' : 'the network'} is not pushing on the fee market, so this does not yet prove how fees behave under load.`
                : `The base fee moved above the floor in ${num((1 - net.atFloorShare) * 100, 0)}% of sampled blocks — the fee market is reacting to demand.`}
            </Callout>
          </Reveal>
        )}
      </section>

      {/* ---------------- Throughput ---------------- */}
      <section>
        <SectionHead eyebrow="Throughput" title="Real transactions per block" />
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="TPS (sampled)" value={net.tps ?? 0} format={n => num(n, 1)}
            subValue="transactions ÷ elapsed seconds" icon={Zap} isLoading={loading} />
          <StatCard label="Peak TPS" value={net.peakTps ?? 0} format={n => num(n, 1)}
            subValue="busiest 5-block window" icon={Gauge} isLoading={loading} />
          <StatCard label="Block time" value={net.avgBlockTimeSec ?? 0} format={n => `${num(n, 2)} s`}
            subValue="average, from timestamps" icon={Timer} isLoading={loading} />
        </Reveal>

        <Reveal delay={0.05} className="arc-card mt-4 p-5">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={net.blocks} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(170,196,234,0.1)" />
                <XAxis dataKey="number" tick={false} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#8da2c0', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(169,196,234,0.08)' }}
                  contentStyle={{ background: '#10213b', border: '1px solid rgba(170,196,234,0.28)', borderRadius: 12, color: '#eaf1fb' }}
                  labelFormatter={v => `Block ${Number(v).toLocaleString()}`}
                  formatter={(v) => [String(v), 'transactions']}
                />
                <Bar dataKey="txCount" fill="#a9c4ea" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="arc-eyebrow mt-3 !text-[10px]">Each bar is one block · newest on the right</p>
        </Reveal>
      </section>

      <NetworkHealthSection netKey={netKey} />

      {/* ---- New indexer sections (hidden when snap is stale or absent) ---- */}
      {extWindow && (
        <>
          <ActivityMixSection
            win={extraWin}
            setWin={setExtraWin}
            window={extWindow}
            series={extSeries}
          />
          <MoneyFlowSection
            win={extraWin}
            setWin={setExtraWin}
            window={extWindow}
            netKey={netKey}
            supplyData={supplyData}
          />
          {!net_is_testnet && (
            <IndexerBridgeSection
              win={extraWin}
              setWin={setExtraWin}
              window={extWindow}
            />
          )}
        </>
      )}

      {net_is_testnet ? <TestnetFlows /> : <MainnetIndexed />}
    </div>
  )
}
