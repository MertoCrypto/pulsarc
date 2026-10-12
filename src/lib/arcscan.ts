/** Thin client for ArcScan (Blockscout v2). Keyless, CORS-open, rate-limited. */

import { EXPLORER_URL } from '@/lib/chain'

export * from './numberFormat.ts'

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

export const explorerAddress = (a: string) => `${ARCSCAN_BASE}/address/${a}`
export const explorerToken = (a: string) => `${ARCSCAN_BASE}/token/${a}`
