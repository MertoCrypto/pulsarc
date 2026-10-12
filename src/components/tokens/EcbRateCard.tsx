/**
 * EcbRateCard — euro reference rate for the Tokens page on mainnet, where no pool price is published.
 * EURC is a euro stablecoin; this card shows the official euro rate, not a market price for EURC.
 */
import { useRef } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { useEcbRate } from '@/hooks/useEcbRate'
import { fxFormat, changeTone } from '@/lib/fx'
import { ecbCsvRows } from '@/lib/ecbRate'
import { DownloadMenu } from '@/components/shared/DownloadMenu'

export function EcbRateCard({ enabled }: { enabled: boolean }) {
  const { data } = useEcbRate(enabled)
  const chartRef = useRef<HTMLDivElement>(null)
  if (!enabled || !data) return null

  const tone = changeTone(data.change1dPct)
  const change = data.change1dPct
  const changeText =
    change === null
      ? null
      : `${change < 0 ? '−' : '+'}${Math.abs(change).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

  return (
    <div className="arc-card px-5 py-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="arc-eyebrow mb-1">EUR / USD reference</p>
          <p className="font-['Geist_Mono'] text-[clamp(22px,3vw,32px)] font-semibold leading-none text-white">
            1 EUR = {fxFormat(data.usdPerEur)} USD
          </p>
          <p className="mt-1 font-['Geist_Mono'] text-sm text-[var(--muted)]">
            1 USD = {fxFormat(data.eurPerUsd)} EUR
          </p>
          {tone !== 'none' && changeText && (
            <p className={['mt-2 text-sm tabular-nums', tone === 'warn' ? 'text-amber-300' : 'text-[var(--muted)]'].join(' ')}>
              {changeText} vs previous day
            </p>
          )}
        </div>
        <DownloadMenu
          page="eur-usd-reference"
          net="mainnet"
          source="ECB reference rates via Frankfurter"
          columns={[
            { key: 'day', label: 'day' },
            { key: 'usd_per_eur', label: 'USD per EUR' },
            { key: 'eur_per_usd', label: 'EUR per USD' },
          ]}
          rows={ecbCsvRows(data)}
          chartRef={chartRef}
        />
      </div>

      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data.series} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="rgba(170,196,234,0.1)" vertical={false} />
            <XAxis dataKey="day" hide />
            <YAxis hide width={0} domain={([min, max]) => { const pad = (max - min) * 0.15 || 0.001; return [min - pad, max + pad] }} />
            <Tooltip
              contentStyle={{ background: '#10213b', border: '1px solid rgba(170,196,234,0.28)', borderRadius: 12, color: '#eaf1fb' }}
              labelFormatter={(v: unknown) => String(v)}
              formatter={(v: unknown) => [`${fxFormat(Number(v))} USD`, '1 EUR']}
            />
            <Line type="monotone" dataKey="usdPerEur" stroke="#a9c4ea" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-[var(--faint)]">
        Source: European Central Bank reference rates via Frankfurter &middot; {data.latestDay}
      </p>
      <p className="text-xs text-[var(--faint)]">
        EURC is a euro stablecoin meant to track the euro. This is the official euro rate, not a market price for EURC.
      </p>
    </div>
  )
}
