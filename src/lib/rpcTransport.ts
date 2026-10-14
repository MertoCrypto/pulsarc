/**
 * rpcTransport — pure helper that builds an ordered list of RPC URLs for an Arc network.
 *
 * Rules:
 *  - When `origin` is provided (browser context), prepend the same-origin proxy URL:
 *      mainnet  → `${origin}/rpc`
 *      testnet  → `${origin}/rpc-testnet`
 *  - Then append the direct URLs, de-duplicated in order (first occurrence wins).
 *  - Unknown network → return only the direct URLs (no proxy).
 *  - When `origin` is undefined / empty (Node, tests, SSR) → no proxy URL.
 *
 * No '@/' imports, no `import.meta`, explicit .ts extension on relative imports
 * so plain `node --experimental-strip-types` can run this file.
 */

/** Map from network name to its same-origin proxy path. */
const PROXY_PATH: Record<'mainnet' | 'testnet', string> = {
  mainnet: '/rpc',
  testnet: '/rpc-testnet',
}

/**
 * Returns the ordered list of RPC URLs to pass to viem's `http()` / `fallback()`.
 *
 * @param network  - 'mainnet' or 'testnet'. Any other value → only `directUrls` returned.
 * @param directUrls - The canonical direct RPC URLs for this network (order preserved).
 * @param origin   - `window.location.origin` in a browser, `undefined` in Node/SSR.
 */
export function rpcUrls(
  network: string,
  directUrls: readonly string[],
  origin?: string,
): string[] {
  // De-duplicate direct URLs (preserve order, first occurrence wins).
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const u of directUrls) {
    if (!seen.has(u)) {
      seen.add(u)
      deduped.push(u)
    }
  }

  // Only inject the proxy for known networks when an origin is available.
  if (!origin || !(network === 'mainnet' || network === 'testnet')) {
    return deduped
  }

  // Strip any trailing slash from origin to avoid double slashes.
  const base = origin.replace(/\/+$/, '')
  const proxyUrl = `${base}${PROXY_PATH[network]}`

  // Put proxy first; skip it if it already appears in directUrls (unlikely but safe).
  if (seen.has(proxyUrl)) {
    return deduped
  }
  return [proxyUrl, ...deduped]
}
