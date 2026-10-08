import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, ThumbsUp, Users, Zap } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { AppLogoBadge, CategoryBadge } from '@/components/shared/Badge'
import { useLeaderboardV2, type Period } from '@/hooks/useLeaderboardV2'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'weekly', label: 'This week' },
  { id: 'monthly', label: 'This month' },
  { id: 'alltime', label: 'All time' },
]

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function LeaderboardV2() {
  const [period, setPeriod] = useState<Period>('weekly')
  const { entries, topContributors, hasActivity, isLoading, isError } = useLeaderboardV2(period)

  const votes = entries.reduce((s, e) => s + e.votes, 0)
  const attestations = entries.reduce((s, e) => s + e.attestations, 0)
  const boost = entries.reduce((s, e) => s + e.boostUsdc, 0)

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Engagement · Arc Testnet</p>
          <SplitLines as="h1" className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[{ text: 'What people say,' }, { text: 'put on-chain.', className: 'text-[var(--periwinkle)]' }]} />
          <p className="mt-6 max-w-[580px] text-lg font-light leading-relaxed text-[var(--muted)]">
            Votes, "I used this" attestations and USDC boosts are recorded by our own contracts — no accounts, no moderation. Activity decides the order.
          </p>
        </section>
      </Reveal>

      <section>
        <div className="mb-5 flex gap-2">
          {PERIODS.map(p => (
            <button key={p.id} className="arc-chip" data-active={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>

        <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Votes" value={votes} format={n => Math.round(n).toString()} icon={ThumbsUp} isLoading={isLoading} />
          <StatCard label="Attestations" value={attestations} format={n => Math.round(n).toString()} icon={Award} isLoading={isLoading} />
          <StatCard label="USDC boosted" value={boost} format={n => `$${n.toFixed(2)}`} icon={Zap} isLoading={isLoading} />
          <StatCard label="Contributors" value={topContributors.length} format={n => Math.round(n).toString()} icon={Users} isLoading={isLoading} />
        </Reveal>

        {!isLoading && !isError && !hasActivity && (
          <Reveal className="arc-panel mt-4 px-5 py-4 text-sm leading-relaxed text-[var(--muted)]">
            Nobody has voted, attested or boosted on testnet yet, so every score is zero. Open any app from the <Link to="/" className="text-white underline underline-offset-4">rankings</Link>, connect a wallet and be the first — it shows up here within seconds.
          </Reveal>
        )}
        {isError && <p className="arc-panel mt-4 px-5 py-4 text-sm text-[var(--muted)]">ArcScan did not answer. It will retry on its own.</p>}
      </section>

      <section>
        <p className="arc-eyebrow mb-4">Apps</p>
        <Reveal className="arc-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {['#', 'App', 'Votes', 'Attestations', 'Boost', 'Score'].map((h, i) => (
                    <th key={h} className={`arc-eyebrow !text-[10px] px-5 py-3.5 font-normal ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-[rgba(170,196,234,0.09)]"><td colSpan={6} className="px-5 py-4"><div className="h-5 animate-pulse rounded bg-white/6" /></td></tr>
                ))}
                {entries.map(e => (
                  <tr key={e.app.id} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                    <td className="w-12 px-5 py-3.5 text-sm tabular-nums text-[var(--faint)]">{e.rank}</td>
                    <td className="px-5 py-3.5">
                      <Link to={`/dapp/${e.app.id}`} className="flex items-center gap-3">
                        <AppLogoBadge initials={e.app.logoInitials} color={e.app.logoColor} logo={e.app.logo} logoIcon={e.app.logoIcon} size="sm" />
                        <span>
                          <span className="block text-[15px] text-white">{e.app.name}</span>
                          <CategoryBadge category={e.app.category} size="xs" />
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm tabular-nums text-white">{e.votes}</td>
                    <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">
                      {e.attestations}{e.attestations > 0 && <span className="text-[var(--faint)]"> ({e.verifiedAttestations} verified)</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{e.boostUsdc > 0 ? `$${e.boostUsdc.toFixed(2)}` : '—'}</td>
                    <td className="px-5 py-3.5 text-right text-sm tabular-nums text-white">{Math.round(e.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="mt-4 max-w-[640px] text-sm leading-relaxed text-[var(--faint)]">
          Score = votes + 2 × verified attestations + ½ × unverified attestations + 10 × USDC boosted. An attestation is verified when the wallet's own on-chain history shows it really used the app. The formula is fixed and public; it is not tuned by hand.
        </p>
      </section>

      {topContributors.length > 0 && (
        <section>
          <p className="arc-eyebrow mb-4">Top contributors</p>
          <Reveal className="arc-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    {['Wallet', 'Votes', 'Attestations', 'Boost', 'Apps'].map((h, i) => (
                      <th key={h} className={`arc-eyebrow !text-[10px] px-5 py-3.5 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topContributors.map(c => (
                    <tr key={c.address} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                      <td className="px-5 py-3.5"><Link to={`/wallet/${c.address}`} className="font-['Geist_Mono'] text-sm text-white hover:text-[var(--periwinkle)]">{short(c.address)}</Link></td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-white">{c.votes}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{c.attestations}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{c.boostUsdc > 0 ? `$${c.boostUsdc.toFixed(2)}` : '—'}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{c.appsInteracted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>
      )}
    </div>
  )
}
