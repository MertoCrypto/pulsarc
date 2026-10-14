/**
 * Pure mapping from app category / id → a lucide-react icon key.
 *
 * Rules:
 *  - No `@/` path aliases, no `import.meta`, no React — safe for Node test runners.
 *  - Returns a string key only; the React layer maps key → lucide component.
 *  - Category glyphs are generic and do NOT imitate any brand.
 *  - A few specific ids have an obvious generic glyph (listed below).
 *  - Unknown / undefined input → 'box' (the safe default).
 *
 * Categories present in appRegistries.ts:
 *   'Stablecoin' | 'DeFi' | 'RWA' | 'Payments' | 'Agents' | 'Infra'
 */

export type GlyphKey =
  | 'arrows-left-right'   // bridge / cross-chain transfer
  | 'layers'              // batching / multicall / stacked protocols
  | 'fingerprint'         // identity registry
  | 'message-square'      // messaging / memo
  | 'repeat'              // swap / FX / DEX-like
  | 'coins'               // stablecoin / fungible asset
  | 'landmark'            // RWA / institutional / yield
  | 'bot'                 // agents / AI
  | 'box'                 // generic / unknown fallback
  | 'circuit-board'       // infra
  | 'trending-up'         // DeFi / lending / yield
  | 'send'                // payments
  | 'move-diagonal'       // cross-chain transfer (CCTP): two arrows on a diagonal
  | 'expand'              // unified balance reaching every chain (Gateway)
  | 'arrow-down-up'       // FX settlement (StableFX)

// ── Per-id overrides (most specific, checked first) ────────────────────────
const ID_GLYPHS: Record<string, GlyphKey> = {
  cctp:       'move-diagonal',       // cross-chain transfer protocol
  gateway:    'expand',              // unified cross-chain balance
  across:     'arrows-left-right',   // bridge
  multicall:  'layers',              // batches many calls in one tx
  erc8004:    'fingerprint',         // onchain identity registry
  erc8183:    'bot',                 // agentic commerce
  memo:       'message-square',      // attach invoice / order references
  stablefx:   'arrow-down-up',       // USDC ↔ EURC FX escrow
  swaparc:    'repeat',              // swap protocol
  curve_usdc_eurc: 'repeat',         // Curve swap pool (id uses hyphens below)
  'curve-usdc-eurc': 'repeat',       // Curve StableSwap
  uniswap:    'repeat',              // DEX
  weth:       'coins',               // wrapped asset
  wusdc:      'coins',               // wrapped USDC
  'arc-dollar': 'coins',             // local-currency stablecoin family
}

// ── Per-category fallbacks (used when no id override matches) ───────────────
const CATEGORY_GLYPHS: Record<string, GlyphKey> = {
  Stablecoin: 'coins',
  DeFi:       'trending-up',
  RWA:        'landmark',
  Payments:   'send',
  Agents:     'bot',
  Infra:      'circuit-board',
}

/**
 * Returns the glyph key for the given app id and/or category.
 * Id overrides take priority over category; unknown input returns 'box'.
 */
export function glyphFor(id?: string, category?: string): GlyphKey {
  if (id && Object.prototype.hasOwnProperty.call(ID_GLYPHS, id)) {
    return ID_GLYPHS[id]
  }
  if (category && Object.prototype.hasOwnProperty.call(CATEGORY_GLYPHS, category)) {
    return CATEGORY_GLYPHS[category]
  }
  return 'box'
}
