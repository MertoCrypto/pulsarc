import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useState } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, ExternalLink, Gauge, Layers, Receipt, Timer, Users, Zap } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { useNetworkStats } from '@/hooks/useNetworkStats'
import { useMemoFeed, MEMO_CONTRACT } from '@/hooks/useMemoFeed'
import { TOKEN_MESSENGER, useBridgeFlow } from '@/hooks/useBridgeFlow'
import { NETWORKS } from '@/lib/chain'
import { useSearchParams } from 'react-router-dom'
import { AddNetworkButton } from '@/components/shared/AddNetworkButton'
import { compact } from '@/lib/arcscan'
import { useIndexer } from '@/hooks/useIndexer'


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
              <StatCard label="Net flow" value={Math.abs(bridge.data.inUsdc - bridge.data.outUsdc)} format={n => `${bridge.data!.inUsdc >= bridge.data!.outUsdc ? '+' : '−'}$${compact(n, 2)}`} subValue={bridge.data.inUsdc >= bridge.data!.outUsdc ? 'more came in than left' : 'more left than came in'} icon={Layers} />
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
              Read from the newest {bridge.data.blockSpan.toLocaleString()} blocks (about {Math.max(1, Math.round((bridge.data.blockSpan * 0.5) / 60))} minutes) of CCTP events. Inbound transfers do not say where they came from, so only outbound destinations are broken down.
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
  const failRate = w.txs ? (w.failed / w.txs) * 100 : 0
  const EXPLORER = NETWORKS.mainnet.explorerUrl
  const covered = w.hours < (win === '1h' ? 1 : win === '24h' ? 24 : 168)

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

      <Reveal delay={0.05} className="arc-card mt-4 overflow-hidden">
        <div className="grid grid-cols-[28px_1fr_90px_90px_80px] gap-3 border-b border-[var(--line)] px-5 py-3 text-xs uppercase tracking-wider text-[var(--faint)] sm:grid-cols-[36px_1fr_120px_120px_100px]">
          <span>#</span><span>Contract</span><span className="text-right">Txs</span><span className="text-right">Wallet-hrs</span><span className="text-right">Fees</span>
        </div>
        <ul>
          {w.top.slice(0, 25).map((c, i) => (
            <li key={c.address} className="arc-row grid grid-cols-[28px_1fr_90px_90px_80px] items-center gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0 sm:grid-cols-[36px_1fr_120px_120px_100px]">
              <span className="text-sm tabular-nums text-[var(--faint)]">{i + 1}</span>
              <a href={`${EXPLORER}/address/${c.address}`} target="_blank" rel="noreferrer" className="font-['Geist_Mono'] text-sm text-white hover:text-[var(--periwinkle)]">
                {short(c.address)}
              </a>
              <span className="text-right text-sm tabular-nums text-white">{compact(c.txs, 1)}</span>
              <span className="text-right text-sm tabular-nums text-[var(--muted)]">{compact(c.walletHours, 1)}</span>
              <span className="text-right text-sm tabular-nums text-[var(--muted)]">${compact(c.fees, 2)}</span>
            </li>
          ))}
        </ul>
      </Reveal>
      <p className="mt-4 text-sm text-[var(--faint)]">
        Counted from every block by Pulsarc's own indexer, about {Math.max(1, Math.round((Date.now() - new Date(data.generatedAt).getTime()) / 60000))} minutes ago.
        {covered ? ' The indexer is still catching up, so this window is not complete yet.' : ''} Wallet-hours add up the distinct wallets seen in each hour, so one wallet active for 3 hours counts 3 times. Contracts are shown by address until they are labelled.
      </p>
    </section>
  )
}

export function Network() {
  const [params, setParams] = useSearchParams()
  const netKey: 'testnet' | 'mainnet' = params.get('net') === 'mainnet' ? 'mainnet' : 'testnet'
  const net_is_testnet = netKey === 'testnet'
  const network = NETWORKS[netKey]
  const net = useNetworkStats(netKey)
  const loading = net.isLoading

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
                    onClick={() => setParams(k === 'testnet' ? {} : { net: k }, { replace: true })}
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
            subValue="Arc's floor is 20 Gwei" icon={Zap} isLoading={loading} />
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
            <p className="arc-eyebrow mt-3 !text-[10px]">Base fee per block · dashed line is Arc's 20 Gwei floor</p>
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

      {net_is_testnet ? <TestnetFlows /> : <MainnetIndexed />}
    </div>
  )
}
