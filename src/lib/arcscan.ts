/** Thin client for ArcScan (Blockscout v2). Keyless, CORS-open, rate-limited. */

import { EXPLORER_URL } from '@/lib/chain'

export const ARCSCAN_BASE = EXPLORER_URL
const API = `${ARCSCAN_BASE}/api/v2`

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ArcScan rate-limits per IP, so keep a few requests in flight at most.
const MAX_IN_FLIGHT = 4
let inFlight = 0
const waiting: Array<{ priority: number; go: () => void }> = []

/** Lower priority numbers go first, so a batch of apps finishes one by one instead of all at the very end. */
async function slot<T>(run: () => Promise<T>, priority: number): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) {
    await new Promise<void>(go => {
      const at = waiting.findIndex(w => w.priority > priority)
      if (at === -1) waiting.push({ priority, go })
      else waiting.splice(at, 0, { priority, go })
    })
  }
  inFlight++
  try {
    return await run()
  } finally {
    inFlight--
    waiting.shift()?.go()
  }
}

export interface ArcscanOpts { priority?: number; timeoutMs?: number; attempts?: number }

export function arcscan<T>(path: string, params?: Record<string, unknown>, priority: number | ArcscanOpts = 0): Promise<T> {
  const o = typeof priority === 'number' ? { priority } : priority
  return slot(() => arcscanNow<T>(path, params, o.timeoutMs ?? 15_000, o.attempts ?? 4), o.priority ?? 0)
}

async function arcscanNow<T>(path: string, params: Record<string, unknown> | undefined, timeoutMs: number, attempts: number): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    // Blockscout cursors carry nulls that must be sent back as the literal "null".
    qs.set(k, v === null || v === undefined ? 'null' : String(v))
  }
  const url = `${API}${path}${qs.size ? `?${qs}` : ''}`

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), timeoutMs) // deep pages can hang; do not hold a slot forever
      const res = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(timer))
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
