/**
 * Returns the correct prefix character for a "wallets" figure depending on
 * network and whether the number is an estimate.
 *
 * Mainnet (id 5042): activeWallets is the SUM of hourly distinct-wallet counts,
 * so the true unique-wallet count is AT MOST that value  →  "≤"  (upper bound).
 *
 * Testnet (or any other id): activeWallets is either exact or a sampled lower
 * bound  →  "≥" when estimated, "" when exact.
 *
 * No '@/' imports and no import.meta — safe to use in Node test runners.
 */
export function walletsPrefix(
  networkId: number,
  estimated: boolean,
): '' | '≥' | '≤' {
  if (networkId === 5042) return '≤'
  return estimated ? '≥' : ''
}
