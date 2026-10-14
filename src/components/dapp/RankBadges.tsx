/**
 * Per-window rank badges for the DApp detail page.
 *
 * Shows where an app ranks among all tracked apps for each enabled time window
 * (24h, 7d, 30d), ranked by active wallets.  Only renders when the indexer
 * snapshot is usable AND the app has at least 1 active wallet in that window;
 * renders nothing otherwise.
 *
 * Data comes entirely from the indexer snapshot — no ArcScan sampling is
 * triggered from this component.
 */
import { useMemo } from 'react'
import { ARC_APPS } from '@/data/apps'
import { useAppsLatest, getAppWindow } from '@/hooks/useAppsLatest'
import { isIndexerUsable, buildIndexerMetrics } from '@/lib/indexerMetrics'
import { isRangeAllowed } from '@/lib/rankRanges'
import { NETWORK } from '@/lib/chain'
import { computeRankBadges, type BadgeWindow, type WindowMetrics } from '@/lib/rankBadges'

const BADGE_WINDOWS: BadgeWindow[] = ['24h', '7d', '30d']

const WINDOW_LABELS: Record<BadgeWindow, string> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
}

const WINDOW_ARIA: Record<BadgeWindow, string> = {
  '24h': 'the last 24 hours',
  '7d':  'the last 7 days',
  '30d': 'the last 30 days',
}

interface Props {
  /** The app whose rank badges to display. */
  appId: string
}

export function RankBadges({ appId }: Props) {
  // Hooks must be called unconditionally.
  const net = NETWORK.id === 5042 ? 'mainnet' : 'testnet'
  const { data: snap } = useAppsLatest(net)

  const badges = useMemo(() => {
    // Determine which windows are allowed on this network.
    const allowedWindows = BADGE_WINDOWS.filter(w => isRangeAllowed(NETWORK.id, w))

    // Build per-window metrics from the snapshot.
    const windowMetrics: Partial<Record<BadgeWindow, WindowMetrics[] | null>> = {}

    for (const win of allowedWindows) {
      if (!isIndexerUsable(snap, win)) {
        windowMetrics[win] = null
        continue
      }

      // isIndexerUsable already gates out '30d' (not in INDEXER_RANGES),
      // so win is narrowed to '1h' | '24h' | '7d' here.
      const indexerWin = win as '1h' | '24h' | '7d'
      const list: WindowMetrics[] = ARC_APPS.flatMap(app => {
        const w = getAppWindow(snap, app.id, indexerWin)
        if (!w) return []
        return [{ appKey: app.id, metrics: buildIndexerMetrics(w) }]
      })

      windowMetrics[win] = list
    }

    return computeRankBadges(windowMetrics, appId, allowedWindows)
  }, [snap, appId])

  if (badges.length === 0) return null

  return (
    <div
      className="flex flex-wrap gap-2"
      aria-label="Rankings by active wallets"
    >
      {badges.map(badge => (
        <span
          key={badge.window}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-raised,rgba(170,196,234,0.07))] px-2.5 py-1 text-xs"
          title="Ranked by active wallets; indexer counts are an upper bound"
          aria-label={`Ranked number ${badge.rank} by active wallets in ${WINDOW_ARIA[badge.window]}`}
        >
          {/* Rank number in periwinkle, window label in muted */}
          <span className="font-['Geist_Mono'] font-medium text-[var(--periwinkle)]">
            #{badge.rank}
          </span>
          <span className="text-[var(--muted)]">
            {WINDOW_LABELS[badge.window]}
          </span>
        </span>
      ))}
    </div>
  )
}
