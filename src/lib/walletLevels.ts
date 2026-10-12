/** Pure flagging of automated wallets from their lifetime transaction counts. */

/** A wallet with this many lifetime transactions is treated as automated (bot / keeper / faucet loop). */
export const HIGH_FREQUENCY = 10_000

export function buildLevels(
  addresses: readonly string[],
  counts: readonly (number | undefined)[],
): { levels: Map<string, number>; flagged: Set<string> } {
  const levels = new Map<string, number>()
  addresses.forEach((a, i) => { const v = counts[i]; if (v !== undefined) levels.set(a.toLowerCase(), v) })
  const flagged = new Set([...levels].filter(([, n]) => n >= HIGH_FREQUENCY).map(([a]) => a))
  return { levels, flagged }
}
