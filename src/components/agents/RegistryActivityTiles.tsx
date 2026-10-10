/**
 * RegistryActivityTiles — three stat tiles for the ERC-8004 registry
 * using the indexer's apps-latest.json snapshot.
 *
 * Hidden when the snapshot is missing or has no erc8004 entry.
 */
import type { AppsLatest } from '@/lib/appsLatest'
import { getAppWindow } from '@/lib/appsLatest'
import { count } from '@/lib/arcscan'

interface Props {
  snap: AppsLatest | null | undefined
}

const APP_ID = 'erc8004'

const WINDOWS = [
  { key: '1h' as const, label: 'Last hour' },
  { key: '24h' as const, label: '24 hours' },
  { key: '7d' as const, label: '7 days' },
]

export function RegistryActivityTiles({ snap }: Props) {
  // Check if any window has data; if not, render nothing
  const hasAny = WINDOWS.some(w => getAppWindow(snap, APP_ID, w.key) !== null)
  if (!hasAny) return null

  return (
    <section className="space-y-4">
      <p className="arc-eyebrow">Registry activity (ERC-8004)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {WINDOWS.map(({ key, label }) => {
          const w = getAppWindow(snap, APP_ID, key)
          return (
            <div key={key} className="arc-panel flex flex-col gap-1 px-4 py-3">
              <p className="text-xs text-[var(--faint)]">{label}</p>
              {w ? (
                <>
                  <p className="text-lg font-light text-white">{count(w.txs, 1)} txs</p>
                  <p className="text-xs text-[var(--muted)]">
                    {'≤'}{count(w.walletHours, 1)} wallets
                    <span className="ml-1 text-[var(--faint)]">(upper bound)</span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--faint)]">—</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
