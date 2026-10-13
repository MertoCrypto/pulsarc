/**
 * Pure helper: resolve the active network key from a URL param and the build's
 * network id. No @/ imports, no import.meta — safe to run in Node tests.
 */

/**
 * Determine which network key ('mainnet' | 'testnet') to use.
 *
 * Rules:
 *   param === 'mainnet'  →  'mainnet'          (explicit URL override)
 *   param === 'testnet'  →  'testnet'           (explicit URL override)
 *   anything else/null   →  derived from build:
 *                              buildNetworkId === 5042  →  'mainnet'
 *                              otherwise                →  'testnet'
 */
export function resolveNetKey(
  param: string | null,
  buildNetworkId: number,
): 'testnet' | 'mainnet' {
  if (param === 'mainnet') return 'mainnet'
  if (param === 'testnet') return 'testnet'
  return buildNetworkId === 5042 ? 'mainnet' : 'testnet'
}

/**
 * URL params to write when the user picks `key`: nothing when it equals the build's default
 * network (the param would be redundant), otherwise an explicit `net=` override.
 */
export function paramsFor(
  key: 'testnet' | 'mainnet',
  buildNetworkId: number,
): Record<string, string> {
  return key === resolveNetKey(null, buildNetworkId) ? {} : { net: key }
}
