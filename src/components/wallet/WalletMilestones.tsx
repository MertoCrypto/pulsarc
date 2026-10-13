/**
 * WalletMilestones — calendar facts and activity milestones for one indexed wallet.
 * Plain facts only: reached or not yet, with progress toward the next step.
 */
import { calendarStats, buildMilestones, nextMilestone, type Milestone } from '@/lib/walletMilestones'
import { reachedTiers } from '@/lib/walletTiers'
import type { WalletRecord, WalletSummary } from '@/lib/walletIndex'

const LOCALE = 'en-US' as const
const fmt = (n: number) => n.toLocaleString(LOCALE, { maximumFractionDigits: 0 })

interface Props {
  record: WalletRecord
  through: number
  summary: WalletSummary
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="arc-eyebrow !text-[10px]">{label}</p>
      <p className="mt-2 text-[22px] font-light leading-none tracking-tight tabular-nums text-white">{value}</p>
    </div>
  )
}

function Row({ m }: { m: Milestone }) {
  return (
    <li
      className={[
        'flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm',
        m.reached ? 'border-[var(--line)] bg-white/[0.06] text-white' : 'border-[var(--line)] text-[var(--muted)]',
      ].join(' ')}
    >
      <span>{m.label}</span>
      <span className="font-['Geist_Mono'] text-xs tabular-nums">
        {m.reached ? 'Reached' : `${fmt(Math.floor(m.value))} / ${fmt(m.target)}`}
      </span>
    </li>
  )
}

export function WalletMilestones({ record, through, summary }: Props) {
  const cal = calendarStats(record, through)
  const list = buildMilestones(summary, cal, summary.apps.length)
  const next = nextMilestone(list)
  const reached = list.filter(m => m.reached).length
  const tiers = reachedTiers(record)

  return (
    <section className="arc-card p-6 sm:p-8">
      <p className="arc-eyebrow mb-6 !text-[10px]">Activity milestones</p>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Tile label="Active weeks" value={fmt(cal.uniqueWeeks)} />
        <Tile label="Active months" value={fmt(cal.uniqueMonths)} />
        <Tile label="Current streak" value={`${fmt(cal.currentStreak)} d`} />
        <Tile label="Longest streak" value={`${fmt(cal.longestStreak)} d`} />
      </div>

      <p className="mt-8 text-sm text-[var(--muted)]">
        {fmt(reached)} of {fmt(list.length)} milestones reached
        {next ? ` · closest: ${next.label} (${fmt(Math.floor(next.value))} / ${fmt(next.target)})` : ''}
      </p>
      {summary.partial && (
        <p className="mt-1 text-xs text-[var(--muted)]">Transaction milestones may be incomplete on mainnet history.</p>
      )}

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(m => <Row key={m.id} m={m} />)}
      </ul>

      {tiers.length > 0 && (
        <>
          <p className="arc-eyebrow mb-3 mt-8 !text-[10px]">Diversity tiers</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map(t => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded border border-[var(--line)] bg-white/[0.06] px-3 py-2 text-sm text-white"
              >
                <span>{t.label}</span>
                <span className="font-['Geist_Mono'] text-xs tabular-nums">{t.atCap ? `${fmt(t.value)}+` : 'Reached'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
