/** Pure helpers behind the Arc RPC reads: log windows, retry on rate limits, grouped calls, session cache. */

/** Arc's RPC rejects getLogs ranges above ~9,999 blocks (error -32012). Stay under it. */
export const MAX_LOG_RANGE = 9000

interface CacheEntry<T> { at: number; value: T }

export function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    return Date.now() - entry.at <= maxAgeMs ? entry.value : null
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value } satisfies CacheEntry<T>))
  } catch {
    // storage full or unavailable — caching is best-effort
  }
}

/** Splits [from, to] into windows the RPC accepts, newest first. */
export function blockWindows(from: bigint, to: bigint): Array<[bigint, bigint]> {
  const out: Array<[bigint, bigint]> = []
  let hi = to
  while (hi >= from) {
    const lo = hi - BigInt(MAX_LOG_RANGE - 1) > from ? hi - BigInt(MAX_LOG_RANGE - 1) : from
    out.push([lo, hi])
    hi = lo - 1n
  }
  return out
}

export const isRateLimit = (e: unknown) => /rate limit|429|-32005|too many/i.test(e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ''}` : String(e))

/** Retries a call with backoff when Arc's RPC answers "rate limit exceeded". */
export async function withRetry<T>(fn: () => Promise<T>, tries = 7): Promise<T> {
  let delay = 700
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= tries || !isRateLimit(e)) throw e
      await new Promise(r => setTimeout(r, delay))
      delay = Math.min(delay * 2, 6000)
    }
  }
}

/** Runs async work over items in small groups with a pause between them. */
export async function inGroups<T, R>(items: T[], size: number, pauseMs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(it => withRetry(() => fn(it)))))
    if (i + size < items.length) await new Promise(r => setTimeout(r, pauseMs))
  }
  return out
}
