import { createPublicClient, http, type Address, type Log, type AbiEvent } from 'viem'
import { requireChain } from '@/onchain-facts'
import { NETWORKS } from '@/lib/chain'

export const ARC_TESTNET_CHAIN_ID = 5042002

/** Arc's RPC rejects getLogs ranges above ~9,999 blocks (error -32012). Stay under it. */
export const MAX_LOG_RANGE = 9000
/**
 * How many blocks cover `hours`. Arc's block time is sub-second and not fixed,
 * so measure it from timestamps instead of assuming one block per second.
 */
export async function blocksForHours(hours: number, latest: bigint): Promise<bigint> {
  const client = arcClient()
  const SAMPLE = 2000n
  const [a, b] = await Promise.all([
    withRetry(() => client.getBlock({ blockNumber: latest, includeTransactions: false })),
    withRetry(() => client.getBlock({ blockNumber: latest - SAMPLE, includeTransactions: false })),
  ])
  const secPerBlock = Number(a.timestamp - b.timestamp) / Number(SAMPLE)
  return BigInt(Math.ceil((hours * 3600) / (secPerBlock > 0 ? secPerBlock : 1)))
}

let shared: ReturnType<typeof makeClient> | null = null

function makeClient() {
  const chain = requireChain(ARC_TESTNET_CHAIN_ID)
  // batch: many JSON-RPC calls travel in one HTTP request — keeps us under the rate limit.
  return createPublicClient({
    transport: http(chain.rpcUrls[0], { batch: { wait: 20, batchSize: 100 } }),
  })
}

const byNetwork: Partial<Record<'testnet' | 'mainnet', ReturnType<typeof makeClient>>> = {}

/** Read-only client for either Arc network (the mainnet RPC is open, anonymous and CORS-enabled). */
export function clientFor(net: 'testnet' | 'mainnet') {
  if (!byNetwork[net]) {
    byNetwork[net] = createPublicClient({
      transport: http(NETWORKS[net].rpcUrl, { batch: { wait: 20, batchSize: 100 } }),
    }) as ReturnType<typeof makeClient>
  }
  return byNetwork[net]!
}

export function arcClient() {
  if (!shared) shared = makeClient()
  return shared
}

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

/**
 * Fetches logs across many windows with limited concurrency, reporting progress.
 * A window that still fails after retries is skipped and counted, so callers can
 * show what was read instead of losing everything to one rate-limited range.
 */
export async function getLogsChunked(opts: {
  address: Address
  event: AbiEvent
  fromBlock: bigint
  toBlock: bigint
  concurrency?: number
  onProgress?: (done: number, total: number) => void
}): Promise<{ logs: Log[]; failedWindows: number; totalWindows: number }> {
  const client = arcClient()
  const windows = blockWindows(opts.fromBlock, opts.toBlock)
  const results: Log[][] = new Array(windows.length).fill(null).map(() => [])
  let next = 0
  let done = 0
  let failed = 0

  async function worker() {
    while (next < windows.length) {
      const i = next++
      const [lo, hi] = windows[i]
      try {
        results[i] = await withRetry(() => client.getLogs({
          address: opts.address,
          event: opts.event,
          fromBlock: lo,
          toBlock: hi,
        })) as Log[]
      } catch {
        failed++
      }
      opts.onProgress?.(++done, windows.length)
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency ?? 1 }, worker))
  return { logs: results.flat(), failedWindows: failed, totalWindows: windows.length }
}

const isRateLimit = (e: unknown) => /rate limit|429|-32005|too many/i.test(e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ''}` : String(e))

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
