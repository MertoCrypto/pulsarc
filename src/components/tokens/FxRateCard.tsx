/**
 * FxRateCard — EURC/USDC rate card for the Tokens page.
 *
 * Wire it into Tokens.tsx yourself; this component has no side-effects
 * beyond fetching fx.json and rendering.
 *
 * Usage:
 *   import { FxRateCard } from '@/components/tokens/FxRateCard'
 *   <FxRateCard net="testnet" />
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
import { useFx } from '@/hooks/useFx'
import { isFxFresh, fxFormat, changeTone, fxCsvRows } from '@/lib/fx'
import { DownloadMenu } from '@/components/shared/DownloadMenu'

// Short display of a pool address: "0x2d84…d457"
function shortPool(addr: string): string {
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`
}

interface Props {
  net: 'mainnet' | 'testnet'
}

export function FxRateCard({ net }: Props) {
  const { data, isLoading, error } = useFx(net)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Render nothing while loading, on error, when data is absent, or when stale
  if (isLoading) return null
  if (error) return null
  if (data === null || data === undefined) return null
  if (!isFxFresh(data)) return null

  const tone = changeTone(data.change24hPct)

  // Sign the change value with a real minus sign (U+2212) for negative
  function formatChange(pct: number): string {
    const abs = Math.abs(pct)
    const sign = pct < 0 ? '\u2212' : '+'
    return `${sign}${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)}%`
  }

  const csvRows = fxCsvRows(data)

  return (
    <div className="arc-card px-5 py-5 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="arc-eyebrow mb-1">EURC / USDC</p>
          <p className="font-['Geist_Mono'] text-[clamp(22px,3vw,32px)] font-semibold leading-none text-white">
            1 EURC = {fxFormat(data.usdcPerEurc)} USDC
          </p>
          <p className="mt-1 font-['Geist_Mono'] text-sm text-[var(--muted)]">
            1 USDC = {fxFormat(data.eurcPerUsdc)} EURC
          </p>

          {/* 24h change — hidden when tone is 'none' */}
          {tone !== 'none' && data.change24hPct !== null && (
            <p
              className={[
                'mt-2 text-sm tabular-nums',
                tone === 'warn'
                  ? 'text-amber-300'
                  : 'text-[var(--muted)]',
              ].join(' ')}
            >
              {formatChange(data.change24hPct)} in 24h
            </p>
          )}
        </div>

        <DownloadMenu
          page="eurc-usdc-rate"
          net={net}
          source={data.sourceLabel}
          columns={[
            { key: 'hour', label: 'hour' },
            { key: 'usdc_per_eurc', label: 'USDC per EURC' },
            { key: 'eurc_per_usdc', label: 'EURC per USDC' },
          ]}
          rows={csvRows}
          chartRef={chartContainerRef}
        />
      </div>

      {/* Chart */}
      <div ref={chartContainerRef}>
        <ResponsiveContainer width="100%" height={120}>
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
                const pad = (max - min) * 0.15 || 0.001
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
                  : `${new Intl.NumberFormat('en-US', {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    }).format(Number(v))} USDC`,
                '1 EURC',
              ]}
            />
            <Line
              type="monotone"
              dataKey="usdcPerEurc"
              stroke="#a9c4ea"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Source line */}
      <p className="text-xs text-[var(--faint)]">
        Source: {data.sourceLabel} &middot; pool {shortPool(data.pool)}
      </p>

      {/* Disclaimer */}
      <p className="text-xs text-[var(--faint)]">
        Marginal price for one token in this pool; it is not an official FX rate.
      </p>
    </div>
  )
}
