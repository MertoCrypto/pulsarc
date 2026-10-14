/**
 * Pure data-layer helpers for parsing the pulsarc-indexer snapshot format.
 * No React, no network — safe in plain Node (--experimental-strip-types).
 *
 * All data originates from an untrusted remote JSON file.
 * We validate every field, build fresh objects (no unknown-key passthrough),
 * and block prototype-pollution keys.
 */

import type { IndexerSnapshot, IndexedWindow, IndexedContract, ContractLabel } from '../hooks/useIndexer.ts'
import { cleanDisplayText } from './displayText.ts'

// ── Constants ─────────────────────────────────────────────────────────────────

const ADDRESS_RE = /^0x[0-9a-f]{40}$/
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const WINDOW_KEYS = ['1h', '24h', '7d'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true for a finite number that is >= 0. */
function isFiniteNonNeg(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/** Safely access a key on a plain-object Record, blocking prototype-pollution keys. */
function get(obj: Record<string, unknown>, key: string): unknown {
  if (DANGEROUS_KEYS.has(key)) return undefined
  return obj[key]
}

/** Normalise an address string to lowercase 0x + 40 hex chars, or null. */
function normaliseAddress(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const lower = v.toLowerCase()
  return ADDRESS_RE.test(lower) ? lower : null
}

// ── parseIndexedContract ──────────────────────────────────────────────────────

function parseIndexedContract(item: unknown): IndexedContract | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const raw = item as Record<string, unknown>

  const address = normaliseAddress(get(raw, 'address'))
  if (address === null) return null

  const txs = get(raw, 'txs')
  if (!isFiniteNonNeg(txs)) return null

  const walletHours = get(raw, 'walletHours')
  if (!isFiniteNonNeg(walletHours)) return null

  const fees = get(raw, 'fees')
  if (!isFiniteNonNeg(fees)) return null

  return { address, txs, walletHours, fees }
}

// ── parseIndexedWindow ────────────────────────────────────────────────────────

function parseIndexedWindow(item: unknown): IndexedWindow | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const raw = item as Record<string, unknown>

  const hours = get(raw, 'hours')
  if (!isFiniteNonNeg(hours)) return null

  const blocks = get(raw, 'blocks')
  if (!isFiniteNonNeg(blocks)) return null

  const txs = get(raw, 'txs')
  if (!isFiniteNonNeg(txs)) return null

  const failed = get(raw, 'failed')
  if (!isFiniteNonNeg(failed)) return null

  const fees = get(raw, 'fees')
  if (!isFiniteNonNeg(fees)) return null

  const walletHours = get(raw, 'walletHours')
  if (!isFiniteNonNeg(walletHours)) return null

  const rawTop = get(raw, 'top')
  if (!Array.isArray(rawTop)) return null

  const top: IndexedContract[] = []
  for (const entry of rawTop) {
    const contract = parseIndexedContract(entry)
    if (contract !== null) top.push(contract)
  }

  return { hours, blocks, txs, failed, fees, walletHours, top }
}

// ── parseSeriesEntry ──────────────────────────────────────────────────────────

type SeriesEntry = IndexerSnapshot['series'][number]

function parseSeriesEntry(item: unknown): SeriesEntry | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const raw = item as Record<string, unknown>

  const hour = get(raw, 'hour')
  if (typeof hour !== 'string' || hour.length === 0) return null

  const txs = get(raw, 'txs')
  if (!isFiniteNonNeg(txs)) return null

  const failed = get(raw, 'failed')
  if (!isFiniteNonNeg(failed)) return null

  const fees = get(raw, 'fees')
  if (!isFiniteNonNeg(fees)) return null

  const wallets = get(raw, 'wallets')
  if (!isFiniteNonNeg(wallets)) return null

  const blocks = get(raw, 'blocks')
  if (!isFiniteNonNeg(blocks)) return null

  return { hour, txs, failed, fees, wallets, blocks }
}

// ── parseIndexerSnapshot ──────────────────────────────────────────────────────

/**
 * Strict validation of the raw JSON from latest.json.
 * Returns null when the top-level structure is invalid.
 * Drops individual malformed entries in top[] and series[] silently.
 * Never throws.
 * The `net` argument is used for `network`; any network field in the JSON is ignored.
 */
export function parseIndexerSnapshot(
  json: unknown,
  net: 'mainnet' | 'testnet',
): Omit<IndexerSnapshot, 'labels'> | null {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    const raw = json as Record<string, unknown>

    const generatedAt = get(raw, 'generatedAt')
    if (typeof generatedAt !== 'string' || generatedAt.length === 0) return null

    const rawWindows = get(raw, 'windows')
    if (!rawWindows || typeof rawWindows !== 'object' || Array.isArray(rawWindows)) return null
    const rawWindowsObj = rawWindows as Record<string, unknown>

    const windows = {} as Record<'1h' | '24h' | '7d', IndexedWindow>
    for (const key of WINDOW_KEYS) {
      const win = parseIndexedWindow(get(rawWindowsObj, key))
      if (win === null) return null
      windows[key] = win
    }

    const rawSeries = get(raw, 'series')
    if (!Array.isArray(rawSeries)) return null

    const series: SeriesEntry[] = []
    for (const entry of rawSeries) {
      const parsed = parseSeriesEntry(entry)
      if (parsed !== null) series.push(parsed)
    }

    return { network: net, generatedAt, windows, series }
  } catch {
    return null
  }
}

// ── parseLabels ───────────────────────────────────────────────────────────────

/**
 * Parses the labels.json format.
 * Returns an empty object for non-object input.
 * Skips keys that are not valid lowercase 0x addresses.
 * Skips entries that are missing the required `contract` boolean.
 * name/symbol: string (capped at 80) or null; anything else coerced to null.
 * kind: optional string capped at 32.
 * Never throws.
 */
export function parseLabels(json: unknown): Record<string, ContractLabel> {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return {}
    const raw = json as Record<string, unknown>
    const result: Record<string, ContractLabel> = {}

    for (const key of Object.keys(raw)) {
      if (DANGEROUS_KEYS.has(key)) continue

      // Key must be a valid lowercase 0x address
      const addr = normaliseAddress(key)
      if (addr === null) continue

      const entry = raw[key]
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const e = entry as Record<string, unknown>

      const contract = get(e, 'contract')
      if (typeof contract !== 'boolean') continue

      const rawName = get(e, 'name')
      const _nameCleaned = typeof rawName === 'string' ? cleanDisplayText(rawName, 80) : null
      const name: string | null = _nameCleaned !== null && _nameCleaned.length > 0 ? _nameCleaned : null

      const rawSymbol = get(e, 'symbol')
      const _symbolCleaned = typeof rawSymbol === 'string' ? cleanDisplayText(rawSymbol, 80) : null
      const symbol: string | null = _symbolCleaned !== null && _symbolCleaned.length > 0 ? _symbolCleaned : null

      const rawKind = get(e, 'kind')
      const kind: string | undefined =
        typeof rawKind === 'string' ? rawKind.slice(0, 32) : undefined

      const label: ContractLabel = {
        contract,
        name,
        symbol,
        ...(kind !== undefined && { kind }),
      }

      result[addr] = label
    }

    return result
  } catch {
    return {}
  }
}
