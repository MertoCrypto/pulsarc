/**
 * Pure, dependency-free helpers that derive indexer-ext tiers from a
 * WalletRecord's optional `ext` field.
 *
 * Rules:
 *   - If ext is absent/undefined → return []  (never break old records)
 *   - Corrupt numeric fields (negative, NaN, array, …) are silently treated as 0
 *   - If a string-array field has length === INDEXER_CAP (64) the value is
 *     considered "at the cap" and atCap=true is set on every tier derived from
 *     that field — the real count may be higher than 64
 *   - No new colours; callers must reuse existing visual primitives
 */

import type { WalletRecord, WalletExt } from './walletIndex.ts'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Indexer ceiling for string-array diversity fields (ut / un / uc). */
export const INDEXER_CAP = 64

// ── Tier interface ─────────────────────────────────────────────────────────────

export interface Tier {
  /** Stable machine id, e.g. "deploy-1" */
  id: string
  /** Human-readable label, plain English, en-US numbers */
  label: string
  /** Short description sentence */
  description: string
  /** Logical group matching the ext field it derives from */
  group: 'deploy' | 'token-diversity' | 'nft-diversity' | 'contract-diversity'
  /** Threshold that must be met (count >= threshold) */
  threshold: number
  /** Observed value used for comparison */
  value: number
  /** true when value >= threshold */
  reached: boolean
  /**
   * true when the underlying data field hit the indexer cap (64).
   * The real count could be >= 64; treat `value` as a lower bound only.
   */
  atCap: boolean
}

// ── Tier definition table ──────────────────────────────────────────────────────

interface TierDef {
  id: string
  label: string
  description: string
  group: Tier['group']
  threshold: number
}

const TIER_DEFS: TierDef[] = [
  // Deploy tiers — sourced from ext.dp (integer)
  { id: 'deploy-1',  group: 'deploy',            threshold: 1,  label: '1 contract deployed',   description: 'Deployed at least 1 contract' },
  { id: 'deploy-5',  group: 'deploy',            threshold: 5,  label: '5 contracts deployed',  description: 'Deployed at least 5 contracts' },
  { id: 'deploy-20', group: 'deploy',            threshold: 20, label: '20 contracts deployed', description: 'Deployed at least 20 contracts' },

  // Token diversity tiers — sourced from ext.ut (string[], capped at 64)
  { id: 'token-div-3',  group: 'token-diversity',    threshold: 3,  label: '3 ERC-20 tokens',   description: 'Interacted with at least 3 distinct ERC-20 tokens' },
  { id: 'token-div-10', group: 'token-diversity',    threshold: 10, label: '10 ERC-20 tokens',  description: 'Interacted with at least 10 distinct ERC-20 tokens' },
  { id: 'token-div-30', group: 'token-diversity',    threshold: 30, label: '30 ERC-20 tokens',  description: 'Interacted with at least 30 distinct ERC-20 tokens' },

  // NFT diversity tiers — sourced from ext.un (string[], capped at 64)
  { id: 'nft-div-1',  group: 'nft-diversity',       threshold: 1,  label: '1 NFT collection',   description: 'Interacted with at least 1 ERC-721 collection' },
  { id: 'nft-div-5',  group: 'nft-diversity',       threshold: 5,  label: '5 NFT collections',  description: 'Interacted with at least 5 ERC-721 collections' },
  { id: 'nft-div-20', group: 'nft-diversity',       threshold: 20, label: '20 NFT collections', description: 'Interacted with at least 20 ERC-721 collections' },

  // Contract diversity tiers — sourced from ext.uc (string[], capped at 64)
  { id: 'contract-div-5',  group: 'contract-diversity',  threshold: 5,  label: '5 contracts called',   description: 'Called at least 5 distinct contracts that emitted events' },
  { id: 'contract-div-20', group: 'contract-diversity',  threshold: 20, label: '20 contracts called',  description: 'Called at least 20 distinct contracts that emitted events' },
  { id: 'contract-div-50', group: 'contract-diversity',  threshold: 50, label: '50 contracts called',  description: 'Called at least 50 distinct contracts that emitted events' },
]

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Coerce an unknown value to a non-negative integer.
 * Returns 0 for anything that is not a finite, non-negative number.
 */
function safeCount(v: unknown): number {
  if (typeof v !== 'number') return 0
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  return Math.floor(v)
}

/**
 * Return { count, atCap } for a string-array ext field.
 * If the field is not a non-empty array of strings → { count: 0, atCap: false }.
 */
function arrayField(v: unknown): { count: number; atCap: boolean } {
  if (!Array.isArray(v)) return { count: 0, atCap: false }
  const count = v.length
  return { count, atCap: count >= INDEXER_CAP }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Derive all ext-based tiers from a wallet record.
 *
 * Returns an empty array when rec.ext is absent (old records without ext data).
 * Never throws — all bad inputs are silently sanitised.
 */
export function buildTiers(rec: WalletRecord): Tier[] {
  const ext: WalletExt | undefined = rec.ext
  if (ext === undefined || ext === null) return []

  const dp = safeCount(ext.dp)
  const { count: utCount, atCap: utAtCap } = arrayField(ext.ut)
  const { count: unCount, atCap: unAtCap } = arrayField(ext.un)
  const { count: ucCount, atCap: ucAtCap } = arrayField(ext.uc)

  return TIER_DEFS.map((def): Tier => {
    let value: number
    let atCap: boolean

    switch (def.group) {
      case 'deploy':
        value = dp
        atCap = false   // dp is a plain integer; no cap applies
        break
      case 'token-diversity':
        value = utCount
        atCap = utAtCap
        break
      case 'nft-diversity':
        value = unCount
        atCap = unAtCap
        break
      case 'contract-diversity':
        value = ucCount
        atCap = ucAtCap
        break
    }

    return {
      id: def.id,
      label: def.label,
      description: def.description,
      group: def.group,
      threshold: def.threshold,
      value,
      reached: value >= def.threshold,
      atCap,
    }
  })
}

/**
 * Return only the tiers that have been reached.
 * Returns an empty array when ext is absent.
 */
export function reachedTiers(rec: WalletRecord): Tier[] {
  return buildTiers(rec).filter(t => t.reached)
}
