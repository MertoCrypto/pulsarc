/** Pure headline totals for the Leaderboard, Wallets and app-detail pages. */
import type { AppSample } from './appMetrics.ts'

export function engagementTotals(entries: readonly { votes: number; attestations: number; boostUsdc: number }[]) {
  return {
    votes: entries.reduce((s, e) => s + e.votes, 0),
    attestations: entries.reduce((s, e) => s + e.attestations, 0),
    boost: entries.reduce((s, e) => s + e.boostUsdc, 0),
  }
}

export function walletTotals(snaps: readonly ({ balance: number; txns24h: number } | undefined)[]) {
  const loaded = snaps.filter((s): s is { balance: number; txns24h: number } => !!s)
  return {
    totalBalance: loaded.reduce((s, x) => s + (x.balance ?? 0), 0),
    active24h: loaded.filter(x => (x.txns24h ?? 0) > 0).length,
    txns24h: loaded.reduce((s, x) => s + (x.txns24h ?? 0), 0),
  }
}

/** How many events a sample holds across all its anchors. */
export function sampledEvents(sample: AppSample | null | undefined): number {
  return sample ? sample.anchors.reduce((s, a) => s + a.events.length, 0) : 0
}
