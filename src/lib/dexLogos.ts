/**
 * dexLogos.ts — DexScreener unverified-token logo helpers.
 *
 * PURE module: no '@/' path aliases, no import.meta, explicit .ts imports.
 * Safe for both browser and Node test runner.
 */

/** Pattern for a valid lower-cased EVM address key. */
const ADDR_RE = /^0x[0-9a-f]{40}$/

/** Pattern for a safe DexScreener image id (no path traversal, no special chars). */
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/

/**
 * Parse a raw logos.json payload into a validated address → image-id map.
 *
 * Accepts `{ logos: { [addr]: id } }`.
 * - Keys must match /^0x[0-9a-f]{40}$/ (already lower-cased EVM address).
 * - Values must match /^[A-Za-z0-9_-]{6,64}$/ (safe image id, no path traversal).
 * - Any entry that fails either check is silently dropped.
 * - Any input that is not the expected shape returns {}.
 * - Never throws.
 */
export function parseDexLogos(raw: unknown): Record<string, string> {
  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const top = raw as Record<string, unknown>
    const logos = top['logos']
    if (logos === null || typeof logos !== 'object' || Array.isArray(logos)) return {}
    const src = logos as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [addr, id] of Object.entries(src)) {
      if (typeof id !== 'string') continue
      if (!ADDR_RE.test(addr)) continue
      if (!ID_RE.test(id)) continue
      out[addr] = id
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Returns the `/dx/<id>` proxy URL for an address, or null when the map
 * has no entry for it. Address comparison is case-insensitive.
 */
export function dexLogoSrc(map: Record<string, string>, address: string): string | null {
  const id = map[address.toLowerCase()]
  return id !== undefined ? `/dx/${id}` : null
}
