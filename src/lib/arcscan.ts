/** Thin client for ArcScan (Blockscout v2). Keyless, CORS-open, rate-limited. */

import { EXPLORER_URL } from '@/lib/chain'

export const ARCSCAN_BASE = EXPLORER_URL
const API = `${ARCSCAN_BASE}/api/v2`

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ArcScan rate-limits per IP, so keep a few requests in flight at most.
const MAX_IN_FLIGHT = 4
let inFlight = 0
const waiting: Array<() => void> = []

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>(resolve => waiting.push(resolve))
  inFlight++
  try {
    return await run()
  } finally {
    inFlight--
    waiting.shift()?.()
  }
}

export function arcscan<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  return slot(() => arcscanNow<T>(path, params))
}

async function arcscanNow<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    // Blockscout cursors carry nulls that must be sent back as the literal "null".
    qs.set(k, v === null || v === undefined ? 'null' : String(v))
  }
  const url = `${API}${path}${qs.size ? `?${qs}` : ''}`

  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429) {
        await sleep(900 * (attempt + 1))
        continue
      }
      if (res.status === 404) throw new NotFoundError()
      if (!res.ok) throw new Error(`ArcScan ${res.status}`)
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      lastError = err
      await sleep(500 * (attempt + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('ArcScan request failed')
}

export class NotFoundError extends Error {
  constructor() { super('Not found') }
}

/** Raw integer string + decimals -> number (fine for display; not for accounting). */
export function scaled(raw: string | null | undefined, decimals: number | string | null | undefined): number {
  if (!raw) return 0
  const d = Number(decimals ?? 0)
  if (!Number.isFinite(d)) return 0
  const s = raw.padStart(d + 1, '0')
  const whole = s.slice(0, s.length - d)
  const frac = s.slice(s.length - d)
  return Number(`${whole}.${frac || '0'}`)
}

export const explorerAddress = (a: string) => `${ARCSCAN_BASE}/address/${a}`
export const explorerToken = (a: string) => `${ARCSCAN_BASE}/token/${a}`
export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)

export function compact(n: number, digits = 2): string {
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(digits)}T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`
  return n.toFixed(abs < 10 ? 2 : 0)
}

/** Like compact(), but whole numbers below 1,000 stay whole — for counts of things. */
export function count(n: number, digits = 1): string {
  return Math.abs(n) < 1000 ? String(Math.round(n)) : compact(n, digits)
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
