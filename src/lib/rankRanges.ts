/**
 * Pure helpers for per-network time-range availability.
 * No '@/' imports; no import.meta — safe to run in Node test runner.
 */

export type RankRange = '1h' | '24h' | '7d' | '30d' | 'all'

const MAINNET_ID = 5042

/** Ranges that are not available on the given network. */
export function disabledRangesFor(networkId: number): ('30d' | 'all')[] {
  return networkId === MAINNET_ID ? ['30d', 'all'] : []
}

/** True when the given range is available on the given network. */
export function isRangeAllowed(networkId: number, range: RankRange): boolean {
  return !(disabledRangesFor(networkId) as string[]).includes(range)
}
