/** Thin client for ArcScan (Blockscout v2). Keyless, CORS-open, rate-limited. */

import { EXPLORER_URL } from '@/lib/chain'
import { NotFoundError, buildUrl, createSlot, requestJson } from './arcscanCore.ts'

export * from './numberFormat.ts'

export const ARCSCAN_BASE = EXPLORER_URL
const API = `${ARCSCAN_BASE}/api/v2`

// ArcScan rate-limits per IP, so keep a few requests in flight at most.
const slot = createSlot(4)

export interface ArcscanOpts { priority?: number; timeoutMs?: number; attempts?: number }

export function arcscan<T>(path: string, params?: Record<string, unknown>, priority: number | ArcscanOpts = 0): Promise<T> {
  const o = typeof priority === 'number' ? { priority } : priority
  return slot(() => arcscanNow<T>(path, params, o.timeoutMs ?? 15_000, o.attempts ?? 4), o.priority ?? 0)
}

async function arcscanNow<T>(path: string, params: Record<string, unknown> | undefined, timeoutMs: number, attempts: number): Promise<T> {
  return requestJson<T>(buildUrl(API, path, params), timeoutMs, attempts)
}

export { NotFoundError }

export const explorerAddress = (a: string) => `${ARCSCAN_BASE}/address/${a}`
export const explorerToken = (a: string) => `${ARCSCAN_BASE}/token/${a}`
