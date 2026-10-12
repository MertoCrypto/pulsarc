/**
 * HeldUsdcCard — "USDC held by tracked apps" card for the Trends page.
 *
 * Wire it into Trends.tsx yourself:
 *   import { HeldUsdcCard } from '@/components/trends/HeldUsdcCard'
 *   <HeldUsdcCard net="testnet" />
 */

import { useRef } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useBalances } from '@/hooks/useBalances'
import {
  isBalancesFresh,
  topHolders,
  formatUsdc,
  changeSince,
} from '@/lib/balances'
import { DownloadMenu } from '@/components/shared/DownloadMenu'

interface Props {
  net: 'mainnet' | 'testnet'
}

// Real minus sign U+2212, as required.
function formatChange(pct: number): string {
  const abs = Math.abs(pct)
  const sign = pct < 0 ? '\u2212' : '+'
  return `${sign}${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)}%`
}

export function HeldUsdcCard({ net }: Props) {
  const { data, isLoading, error } = useBalances(net)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Return nothing while loading, on error, when data is absent, or when stale.
  if (isLoading) return null
  if (error) return null
  if (data === null || data === undefined) return null
  if (!isBalancesFresh(data)) return null

  const change = changeSince(data.series, 24)

  // Top 8 for display
  const displayHolders = topHolders(data, 8)

  // ALL apps with usdc > 0 for the CSV export
  const csvHolders = topHolders(data, data.apps.length)
  const csvRows = csvHolders.map(h => ({
    app: h.id,
    'USDC held': h.usdc,
    'share %': h.sharePct,
  }))

  const showChart = data.series.length >= 2

  return (
    <div className="arc-card px-5 py-5 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="arc-eyebrow mb-1">USDC held by tracked apps</p>
          <p className="font-['Geist_Mono'] text-[clamp(22px,3vw,32px)] font-semibold leading-none text-white">
            {formatUsdc(data.total)}
          </p>

          {/* 24h change — only when changeSince returns a value */}
          {change !== null && (
            <p className="mt-2 text-sm tabular-nums text-[var(--muted)]">
              {formatChange(change)} in 24h
            </p>
          )}
        </div>

        <DownloadMenu
          page="usdc-held-by-apps"
          net={net}
          source="Pulsarc indexer, balances.json"
          columns={[
            { key: 'app', label: 'app' },
            { key: 'USDC held', label: 'USDC held' },
            { key: 'share %', label: 'share %' },
          ]}
          rows={csvRows}
          chartRef={chartContainerRef}
        />
      </div>

      {/* Top-holder list */}
      {displayHolders.length > 0 && (
        <ul className="space-y-3">
          {displayHolders.map(h => (
            <li key={h.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                {/* App id in a monospace chip, matching checklist chips elsewhere */}
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-['Geist_Mono'] text-[11px] text-[var(--muted)]">
                  {h.id}
                </span>
                <span className="text-sm tabular-nums text-[var(--muted)] whitespace-nowrap">
                  {formatUsdc(h.usdc)}{' '}
                  <span className="text-xs text-[var(--faint)]">
                    {h.sharePct.toFixed(1)}%
                  </span>
                </span>
              </div>
              {/* Thin horizontal bar: filled portion uses periwinkle, track is very subtle */}
              <div className="h-px w-full bg-white/[0.05]">
                <div
                  className="h-px bg-[var(--periwinkle)] opacity-70"
                  style={{ width: `${Math.min(h.sharePct, 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Sparkline — only when >= 2 series points */}
      {showChart && (
        <div ref={chartContainerRef}>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart
              data={data.series}
              margin={{ top: 4, right: 4, bottom: 4, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="0"
                stroke="rgba(170,196,234,0.1)"
                vertical={false}
              />
              <XAxis dataKey="hour" hide />
              <YAxis
                hide
                width={0}
                domain={([min, max]) => {
                  const pad = (max - min) * 0.15 || 1
                  return [min - pad, max + pad]
                }}
              />
              <Tooltip
                contentStyle={{
                  background: '#10213b',
                  border: '1px solid rgba(170,196,234,0.28)',
                  borderRadius: 12,
                  color: '#eaf1fb',
                }}
                labelFormatter={(v: unknown) => String(v)}
                formatter={(v: unknown) => [
                  v === null || v === undefined
                    ? '\u2014'
                    : formatUsdc(Number(v)),
                  'USDC held',
                ]}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#a9c4ea"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Footnote */}
      <p className="text-xs text-[var(--faint)]">
        Sum of USDC balances at the contract addresses Pulsarc tracks for each
        app. Not every address of an app is tracked, so this is not the app's
        total value.
      </p>
    </div>
  )
}
