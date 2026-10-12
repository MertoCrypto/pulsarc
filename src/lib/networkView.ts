/** Small pure formulas behind the Network page cards. */

/** Whole minutes since an ISO timestamp, never below 1. */
export function minutesAgo(nowMs: number, iso: string): number {
  return Math.max(1, Math.round((nowMs - new Date(iso).getTime()) / 60000))
}

/** Rough minutes covered by a block span at about half a second per block, never below 1. */
export function bridgeSpanMinutes(blockSpan: number): number {
  return Math.max(1, Math.round((blockSpan * 0.5) / 60))
}

/** Lower bound for the success-rate chart: one point under the lowest rate seen, never below 0. */
export function chartYMin(series: readonly { successRate: number | null }[]): number {
  const min = series.reduce((m, p) => (p.successRate !== null ? Math.min(m, p.successRate) : m), 100)
  return Math.max(0, Math.floor(min) - 1)
}

/** Percentage of `total`, 0 when there is no total. */
export function percentOf(part: number, total: number): number {
  return total ? (part / total) * 100 : 0
}

/** True while the indexer holds fewer hours than the window it is asked to show. */
export function windowIncomplete(hours: number, win: '1h' | '24h' | '7d'): boolean {
  return hours < (win === '1h' ? 1 : win === '24h' ? 24 : 168)
}

/** Bridge net flow: absolute amount and whether more came in than left (ties count as in). */
export function netFlow(inUsdc: number, outUsdc: number): { amount: number; incoming: boolean } {
  return { amount: Math.abs(inUsdc - outUsdc), incoming: inUsdc >= outUsdc }
}

/** CSS width for a bar relative to the largest value, one decimal, 0 when there is no maximum. */
export function barWidth(value: number, max: number): string {
  return `${max > 0 ? ((value / max) * 100).toFixed(1) : 0}%`
}
