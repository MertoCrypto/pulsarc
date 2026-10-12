import { createPublicClient, http, type Address, type Log, type AbiEvent } from 'viem'
import { requireChain } from '@/onchain-facts'
import { NETWORKS } from '@/lib/chain'
import { blockWindows, withRetry } from './rpcHelpers.ts'

export { MAX_LOG_RANGE, blockWindows, readCache, writeCache, withRetry, inGroups } from './rpcHelpers.ts'

export const ARC_TESTNET_CHAIN_ID = 5042002

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
