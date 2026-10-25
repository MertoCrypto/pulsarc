/**
 * Chain size / weight helpers for the free-body network scatter on the map.
 * Pure data: no '@/' imports, no fetch. Runs in plain Node (--experimental-strip-types).
 *
 * UI note: call the "tvl" field "in DeFi apps" — never show the word "TVL".
 */

import { PORT_DOMAINS } from './chainPorts.ts'

// ── Domain → DefiLlama name mapping ──────────────────────────────────────────

/** chain: the name field from /v2/chains rows. meta: the appMetadata-chains key. */
export interface LlamaEntry { chain: string; meta: string }

/**
 * Every non-Arc CCTP domain mapped to its DefiLlama names.
 * Domain 4 (Noble) has no /v2/chains row → assets will be null.
 * Domain 28 (EDGE) is not in either source → both assets and dex will be null.
 */
export const LLAMA_BY_DOMAIN: Record<number, LlamaEntry> = {
  0:  { chain: 'Ethereum',        meta: 'ethereum' },
  1:  { chain: 'Avalanche',       meta: 'avalanche' },
  2:  { chain: 'OP Mainnet',      meta: 'op-mainnet' },
  3:  { chain: 'Arbitrum',        meta: 'arbitrum' },
  4:  { chain: 'Noble',           meta: 'noble' },         // no /v2/chains row → assets null
  5:  { chain: 'Solana',          meta: 'solana' },
  6:  { chain: 'Base',            meta: 'base' },
  7:  { chain: 'Polygon',         meta: 'polygon' },
  8:  { chain: 'Sui',             meta: 'sui' },
  9:  { chain: 'Aptos',           meta: 'aptos' },
  10: { chain: 'Unichain',        meta: 'unichain' },
  11: { chain: 'Linea',           meta: 'linea' },
  12: { chain: 'Codex',           meta: 'codex' },
  13: { chain: 'Sonic',           meta: 'sonic' },
  14: { chain: 'World Chain',     meta: 'world-chain' },
  15: { chain: 'Monad',           meta: 'monad' },
  16: { chain: 'Sei',             meta: 'sei' },
  17: { chain: 'BSC',             meta: 'bsc' },
  18: { chain: 'XDC',             meta: 'xdc' },
  19: { chain: 'Hyperliquid L1',  meta: 'hyperliquid-l1' },
  21: { chain: 'Ink',             meta: 'ink' },
  22: { chain: 'Plume Mainnet',   meta: 'plume-mainnet' },
  25: { chain: 'Starknet',        meta: 'starknet' },
  27: { chain: 'Stellar',         meta: 'stellar' },
  28: { chain: 'EDGE',            meta: '' },              // not in either source
  29: { chain: 'Injective',       meta: 'injective' },
  30: { chain: 'Morph',           meta: 'morph' },
  31: { chain: 'Pharos',          meta: 'pharos' },
  32: { chain: 'Cronos',          meta: 'cronos' },
  33: { chain: 'Plasma',          meta: 'plasma' },
  37: { chain: 'X Layer',         meta: 'x-layer' },
  // Non-CCTP chains added for bridge coverage
  4663: { chain: '',              meta: '' },   // Robinhood Chain — not in DefiLlama yet
  1868: { chain: 'Soneium',       meta: 'soneium' },
  // Synthetic "Other networks" body — no DefiLlama data
  [-99]: { chain: '', meta: '' },
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse /v2/chains response (array of { name, tvl, … }) into a map from chain name → tvl.
 * Field is named "tvl" in the API; in UI copy call it "in DeFi apps".
 */
export function parseChainAssets(json: unknown): Map<string, number> {
  const out = new Map<string, number>()
  if (!Array.isArray(json)) return out
  for (const item of json) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (typeof r['name'] !== 'string') continue
    const tvl = r['tvl']
    if (typeof tvl === 'number' && Number.isFinite(tvl) && tvl > 0) {
      out.set(r['name'], tvl)
    }
  }
  return out
}

/**
 * Parse /config/smol/appMetadata-chains.json (object keyed by meta key) into
 * a map from meta key → 24h DEX volume, or null when missing.
 */
export function parseChainDex(json: unknown): Map<string, number | null> {
  const out = new Map<string, number | null>()
  if (!json || typeof json !== 'object' || Array.isArray(json)) return out
  for (const [key, val] of Object.entries(json as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') { out.set(key, null); continue }
    const v = val as Record<string, unknown>
    const dimAgg = v['dimAgg']
    if (!dimAgg || typeof dimAgg !== 'object') { out.set(key, null); continue }
    const da = dimAgg as Record<string, unknown>
    const dexs = da['dexs']
    if (!dexs || typeof dexs !== 'object') { out.set(key, null); continue }
    const dx = dexs as Record<string, unknown>
    const dv = dx['dv']
    if (!dv || typeof dv !== 'object') { out.set(key, null); continue }
    const dvv = dv as Record<string, unknown>
    const h24 = dvv['24h']
    if (typeof h24 === 'number' && Number.isFinite(h24) && h24 > 0) {
      out.set(key, h24)
    } else {
      out.set(key, null)
    }
  }
  return out
}

// ── Weight / radius ───────────────────────────────────────────────────────────

/** Context for normalisation: all positive asset and dex values across all domains. */
export interface WeightContext {
  assets: number[]
  dex: number[]
}

function logNorm(v: number | null, all: number[]): number {
  if (v === null || v <= 0) return 0
  const positives = all.filter(x => x > 0)
  if (positives.length === 0) return 0
  const minLog = Math.log10(Math.min(...positives))
  const maxLog = Math.log10(Math.max(...positives))
  if (minLog === maxLog) return 1
  return Math.min(1, Math.max(0, (Math.log10(v) - minLog) / (maxLog - minLog)))
}

/**
 * Composite weight in [0, 1]:
 *   0.6 × log-normalised assets + 0.4 × log-normalised dex24h
 * null/0 for either term contributes 0 to that term.
 */
export function chainWeight(
  assets: number | null,
  dex24h: number | null,
  all: WeightContext,
): number {
  return 0.6 * logNorm(assets, all.assets) + 0.4 * logNorm(dex24h, all.dex)
}

/**
 * Visual radius for a free-body network node.
 * Desktop: 14–46 px; mobile: 10–30 px.
 */
export function bodyRadius(weight: number, mobile: boolean): number {
  if (mobile) return 10 + weight * 20
  return 14 + weight * 32
}

// ── Convenience: build sizes for all PORT_DOMAINS ──────────────────────────

export interface ChainSize {
  domain: number
  assets: number | null
  dex24h: number | null
  weight: number
  radius: number
  radiusMobile: number
}

/**
 * Build a ChainSize record for each PORT_DOMAIN given pre-parsed lookups.
 * Domains missing from either lookup get null for that dimension.
 */
export function buildChainSizes(
  assetsMap: Map<string, number>,
  dexMap: Map<string, number | null>,
): ChainSize[] {
  const all: WeightContext = { assets: [], dex: [] }

  // Collect all positive values for normalisation
  for (const domain of PORT_DOMAINS) {
    const entry = LLAMA_BY_DOMAIN[domain]
    if (!entry) continue
    const a = entry.chain ? (assetsMap.get(entry.chain) ?? null) : null
    const d = entry.meta ? (dexMap.get(entry.meta) ?? null) : null
    if (a !== null && a > 0) all.assets.push(a)
    if (d !== null && d > 0) all.dex.push(d)
  }

  return PORT_DOMAINS.map(domain => {
    // Synthetic "Other networks" body: always shown at a small fixed weight.
    if (domain < 0) {
      const weight = 0.3
      return {
        domain,
        assets: null,
        dex24h: null,
        weight,
        radius: bodyRadius(weight, false),
        radiusMobile: bodyRadius(weight, true),
      }
    }
    const entry = LLAMA_BY_DOMAIN[domain]
    const assets = entry?.chain ? (assetsMap.get(entry.chain) ?? null) : null
    const dex24h = entry?.meta ? (dexMap.get(entry.meta) ?? null) : null
    const weight = chainWeight(assets, dex24h, all)
    return {
      domain,
      assets,
      dex24h,
      weight,
      radius: bodyRadius(weight, false),
      radiusMobile: bodyRadius(weight, true),
    }
  })
}
