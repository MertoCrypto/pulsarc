/**
 * Pure catalog parser — no browser globals, no @/ imports, no import.meta.
 * Safe to run in Node for tests.
 *
 * Schema (from pulsarc-indexer, authoritative):
 *   { network, generatedAt, coverage, tokens:[{address,name,symbol,decimals,totalSupply}], nfts:[{address,name,symbol,kind}], probed:{} }
 */

// ─── Local deps (relative, no @/) ────────────────────────────────────────────
import { groupOf } from './tokens.ts'
import type { ArcToken } from './tokens.ts'
import type { NftCollection, NftKind } from './nfts.ts'
import { cleanDisplayText } from './displayText.ts'

// ─── Schema types ─────────────────────────────────────────────────────────────

export interface CatalogToken {
  address: string
  name: string | null
  symbol: string | null
  decimals: number
  totalSupply: string | null
}

export interface CatalogNft {
  address: string
  name: string | null
  symbol: string | null
  kind: NftKind
}

export interface CatalogFile {
  network: string
  generatedAt: string
  coverage: string
  tokens: CatalogToken[]
  nfts: CatalogNft[]
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function isValidAddress(v: unknown): v is string {
  return typeof v === 'string' && ADDRESS_RE.test(v)
}

/** Decimals must be an integer in [0, 36]. */
function isValidDecimals(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 36
}

/** totalSupply must be a non-negative integer string (digits only), or null/undefined. */
function sanitizeTotalSupply(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  if (!/^\d+$/.test(v)) return null
  return v
}

// ─── parseCatalog ─────────────────────────────────────────────────────────────

/**
 * Parse a raw (JSON.parsed) catalog payload.
 * Returns null for structurally invalid input; silently drops invalid rows.
 */
export function parseCatalog(raw: unknown): CatalogFile | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const obj = raw as Record<string, unknown>

  if (typeof obj.network !== 'string') return null
  if (typeof obj.generatedAt !== 'string') return null
  if (typeof obj.coverage !== 'string') return null

  if (!Array.isArray(obj.tokens)) return null
  if (!Array.isArray(obj.nfts)) return null

  const tokens: CatalogToken[] = []
  for (const item of obj.tokens) {
    if (typeof item !== 'object' || item === null) continue
    const t = item as Record<string, unknown>
    if (!isValidAddress(t.address)) continue
    if (!isValidDecimals(t.decimals)) continue
    tokens.push({
      address: t.address,
      name: typeof t.name === 'string' ? t.name : null,
      symbol: typeof t.symbol === 'string' ? t.symbol : null,
      decimals: t.decimals,
      totalSupply: sanitizeTotalSupply(t.totalSupply),
    })
  }

  const VALID_KINDS: NftKind[] = ['ERC-721', 'ERC-1155']
  const nfts: CatalogNft[] = []
  for (const item of obj.nfts) {
    if (typeof item !== 'object' || item === null) continue
    const n = item as Record<string, unknown>
    if (!isValidAddress(n.address)) continue
    if (!VALID_KINDS.includes(n.kind as NftKind)) continue
    nfts.push({
      address: n.address,
      name: typeof n.name === 'string' ? n.name : null,
      symbol: typeof n.symbol === 'string' ? n.symbol : null,
      kind: n.kind as NftKind,
    })
  }

  return {
    network: obj.network,
    generatedAt: obj.generatedAt,
    coverage: obj.coverage,
    tokens,
    nfts,
  }
}

// ─── toTokenRows ──────────────────────────────────────────────────────────────

/**
 * Convert a validated CatalogFile to ArcToken rows compatible with the existing
 * Token table. Mainnet catalog has no holder counts — holders is set to 0.
 * The Tokens page renders '—' unconditionally for the Holders column on mainnet
 * (NETWORK.id === 5042), independent of this value.
 * Supply is computed with BigInt to avoid precision loss on large integers.
 */
export function toTokenRows(cat: CatalogFile): ArcToken[] {
  return cat.tokens.map(t => {
    const name   = (t.name == null ? 'Unnamed' : cleanDisplayText(t.name))
    const symbol = (t.symbol == null ? '—' : cleanDisplayText(t.symbol))
    return {
      address: t.address,
      name,
      symbol,
      decimals: t.decimals,
      holders: 0,
      supply: supplyFromRaw(t.totalSupply, t.decimals),
      group: groupOf(name, symbol),
      iconUrl: null,
      volume24h: null,
      marketCap: null,
      price: null,
    }
  })
}

// ─── toNftRows ────────────────────────────────────────────────────────────────

/**
 * Convert a validated CatalogFile to NftCollection rows compatible with the
 * existing NFT table. holders is set to 0 — the NFTs page renders '—'
 * unconditionally for holder/items/transfers columns on mainnet (NETWORK.id === 5042).
 */
export function toNftRows(cat: CatalogFile): NftCollection[] {
  return cat.nfts.map(n => ({
    address: n.address,
    name:   (n.name == null ? 'Unnamed collection' : cleanDisplayText(n.name)),
    symbol: (n.symbol == null ? '—' : cleanDisplayText(n.symbol)),
    kind: n.kind,
    holders: 0,
    items: null,
    transfers: null,
  }))
}

// ─── Internal: BigInt-safe supply conversion ──────────────────────────────────

/**
 * Divide a raw integer string (totalSupply) by 10^decimals without floating-point
 * imprecision. Values whose whole part exceeds Number.MAX_SAFE_INTEGER are clamped
 * to Number.MAX_SAFE_INTEGER so the result is always a finite JS number.
 */
function supplyFromRaw(raw: string | null, decimals: number): number {
  if (!raw || raw === '0') return 0
  try {
    const big = BigInt(raw)
    const divisor = 10n ** BigInt(decimals)
    const whole = big / divisor
    const frac = big % divisor
    const MAX = BigInt(Number.MAX_SAFE_INTEGER)
    if (whole > MAX) return Number.MAX_SAFE_INTEGER
    return Number(whole) + Number(frac) / Number(divisor)
  } catch {
    return 0
  }
}
