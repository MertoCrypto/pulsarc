/** Network-free core of the ArcScan client: request slots, URL building and retrying. */

export class NotFoundError extends Error {
  constructor() { super('Not found') }
}

/**
 * At most `max` jobs run at once; waiting jobs start in priority order (lower number first,
 * first come first served among equals), so a batch of apps finishes one by one instead of all at the very end.
 */
export function createSlot(max: number) {
  let inFlight = 0
  const waiting: Array<{ priority: number; go: () => void }> = []
  return async function slot<T>(run: () => Promise<T>, priority: number): Promise<T> {
    if (inFlight >= max) {
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
}

export function buildUrl(api: string, path: string, params?: Record<string, unknown>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    // Blockscout cursors carry nulls that must be sent back as the literal "null".
    qs.set(k, v === null || v === undefined ? 'null' : String(v))
  }
  return `${api}${path}${qs.size ? `?${qs}` : ''}`
}

export interface RequestDeps {
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export async function requestJson<T>(url: string, timeoutMs: number, attempts: number, deps: RequestDeps = {}): Promise<T> {
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const sleep = deps.sleep ?? realSleep
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), timeoutMs) // deep pages can hang; do not hold a slot forever
      const res = await fetchFn(url, { signal: ctl.signal }).finally(() => clearTimeout(timer))
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
