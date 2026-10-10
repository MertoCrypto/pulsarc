import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ArrowUpRight, ArrowDownRight, Copy, Check } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { useDigest, formatChange, progress } from '@/hooks/useDigest'
import type { DigestApp, DigestOk } from '@/hooks/useDigest'
import { NETWORK } from '@/lib/chain'
import { appById } from '@/data/apps'

const net = NETWORK.id === 5042 ? 'mainnet' : 'testnet'

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toString()
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function AppRow({ item }: { item: DigestApp }) {
  const entry = appById(item.app)
  const name = entry?.name ?? item.app
  const changeStr = formatChange(item.change)
  const isPositive = item.change !== null && item.change > 0
  const isNegative = item.change !== null && item.change < 0

  const nameEl = entry ? (
    <Link to={`/dapp/${item.app}`} className="text-white transition-colors hover:text-[var(--periwinkle)]">
      {name}
    </Link>
  ) : (
    <span className="text-white">{name}</span>
  )

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] py-3 last:border-0">
      <div className="min-w-0 flex-1">
        {nameEl}
        <p className="mt-0.5 text-xs text-[var(--faint)]">{fmtNum(item.txs)} txs</p>
      </div>
      <span
        className={`shrink-0 text-sm tabular-nums ${
          isPositive ? 'text-[var(--periwinkle)]' : isNegative ? 'text-[#f87171]' : 'text-[var(--muted)]'
        }`}
      >
        {changeStr}
      </span>
    </div>
  )
}

function OkContent({ d }: { d: DigestOk }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(d.shareText).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => { /* clipboard failure: silent */ },
    )
  }

  const changeVal = d.network_change ?? 0

  return (
    <div className="space-y-10">
      {/* Period */}
      <p className="text-sm text-[var(--faint)]">
        {fmtDate(d.from)} – {fmtDate(d.to)}
      </p>

      {/* Stat cards */}
      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="This week"
          value={d.network_txs}
          format={fmtNum}
          subValue="transactions"
          icon={BarChart3}
        />
        <StatCard
          label="Last week"
          value={d.network_prev_txs}
          format={fmtNum}
          subValue="transactions"
          icon={BarChart3}
        />
        <StatCard
          label="Change"
          value={Math.abs(changeVal)}
          format={n => (d.network_change === null ? '—' : (d.network_change >= 0 ? '+' : '-') + fmtNum(n) + '%')}
          subValue="vs previous week"
          icon={d.network_change !== null && d.network_change >= 0 ? ArrowUpRight : ArrowDownRight}
        />
      </Reveal>

      {/* Fastest growing */}
      {d.growers.length > 0 && (
        <section>
          <p className="arc-eyebrow mb-4">Fastest growing</p>
          <div className="arc-card px-5">
            {d.growers.map((item, i) => <AppRow key={i} item={item} />)}
          </div>
        </section>
      )}

      {/* Biggest drops */}
      {d.fallers.length > 0 && (
        <section>
          <p className="arc-eyebrow mb-4">Biggest drops</p>
          <div className="arc-card px-5">
            {d.fallers.map((item, i) => <AppRow key={i} item={item} />)}
          </div>
        </section>
      )}

      {/* Top apps */}
      {d.top.length > 0 && (
        <section>
          <p className="arc-eyebrow mb-4">Top apps this week</p>
          <div className="arc-card px-5">
            {d.top.map((item, i) => <AppRow key={i} item={item} />)}
          </div>
        </section>
      )}

      {/* Share */}
      <div>
        <button
          onClick={handleCopy}
          className="arc-btn-ghost inline-flex items-center gap-2"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy as post'}
        </button>
      </div>
    </div>
  )
}

export function Digest() {
  const { data, isLoading } = useDigest(net)

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Weekly digest</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(34px,4.3vw,60px)] text-white"
            lines={[
              { text: 'What moved on Arc' },
              { text: 'this week.', className: 'text-[var(--periwinkle)]' },
            ]}
          />
          <p className="mt-6 max-w-[580px] text-lg font-light leading-relaxed text-[var(--muted)]">
            The last 7 days vs the 7 days before. Counts are transactions, computed from hourly indexer data.
          </p>
        </section>
      </Reveal>

      {isLoading && (
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="arc-card h-24 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !data && (
        <p className="arc-panel px-4 py-3 text-sm text-[var(--muted)]">
          Digest not available yet.
        </p>
      )}

      {!isLoading && data?.status === 'warming-up' && (
        <Reveal>
          <div className="arc-card max-w-lg p-6 space-y-4">
            <p className="text-[19px] font-light text-white">Building the first digest</p>
            <p className="text-sm text-[var(--muted)]">
              The indexer needs {data.hoursNeeded} hours of data before the first weekly summary is ready.
              {data.readyAt ? ` Ready around ${fmtDate(data.readyAt)}.` : ''}
            </p>
            {/* Progress bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-[var(--periwinkle)] transition-all duration-500"
                style={{ width: `${progress(data)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--faint)]">{progress(data)}% complete</p>
          </div>
        </Reveal>
      )}

      {!isLoading && data?.status === 'ok' && (
        <Reveal>
          <OkContent d={data} />
        </Reveal>
      )}

      <p className="text-xs text-[var(--faint)]">
        Source: Pulsarc indexer, hourly aggregates.
      </p>
    </div>
  )
}
