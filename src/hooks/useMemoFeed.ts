import { useEffect, useState } from 'react'
import { parseAbiItem, type Address, type Hex } from 'viem'
import { decodeMemo, summarizeMemos, type MemoEntry, type MemoSummary } from '@/lib/memoSummary'
import { arcClient, getLogsChunked, withRetry, readCache, writeCache, blocksForHours } from '@/lib/arcRpc'

/** Arc's transaction Memo contract (docs.arc.io/arc/concepts/transaction-memos). */
export const MEMO_CONTRACT: Address = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505'

const memoEvent = parseAbiItem(
  'event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)',
)

export type { MemoEntry, MemoPair } from '@/lib/memoSummary'

export interface MemoFeed extends MemoSummary {
  /** Block ranges the RPC refused even after retries; counts are a floor when > 0. */
  failedWindows: number
  totalWindows: number
  progress: number
  isLoading: boolean
  error: string | null
}

const CACHE_MS = 5 * 60_000


export function useMemoFeed(hours = 24): MemoFeed {
  const [state, setState] = useState<MemoFeed>({
    entries: [], total: 0, uniqueSenders: 0, uniqueTargets: 0, uniqueMemoIds: 0,
    topPairs: [], hours, failedWindows: 0, totalWindows: 0, progress: 0, isLoading: true, error: null,
  })

  useEffect(() => {
    let cancelled = false
    const key = `pulsarc:memo:${hours}`

    async function load() {
      const cached = readCache<MemoEntry[]>(key, CACHE_MS)
      if (cached) {
        setState({ ...summarizeMemos(cached, hours), failedWindows: 0, totalWindows: 0, progress: 1, isLoading: false, error: null })
        return
      }
      try {
        // Let the network panel's own burst finish first.
        await new Promise(r => setTimeout(r, 2500))
        const latest = await withRetry(() => arcClient().getBlockNumber())
        const { logs, failedWindows, totalWindows } = await getLogsChunked({
          address: MEMO_CONTRACT,
          event: memoEvent,
          fromBlock: latest - await blocksForHours(hours, latest),
          toBlock: latest,
          onProgress: (d, t) => { if (!cancelled) setState(p => ({ ...p, progress: d / t })) },
        })
        if (cancelled) return

        const entries: MemoEntry[] = logs
          .map(l => {
            const a = (l as unknown as { args: { sender: string; target: string; memoId: string; memo: Hex } }).args
            return {
              block: Number(l.blockNumber),
              tx: l.transactionHash ?? '',
              sender: a.sender,
              target: a.target,
              memoId: a.memoId,
              text: decodeMemo(a.memo),
            }
          })
          .sort((x, y) => y.block - x.block)

        // A partial read must not be cached as if it were complete.
        if (failedWindows === 0) writeCache(key, entries)
        setState({ ...summarizeMemos(entries, hours), failedWindows, totalWindows, progress: 1, isLoading: false, error: null })
      } catch (e) {
        if (!cancelled) {
          setState(p => ({ ...p, isLoading: false, error: e instanceof Error ? e.message : 'RPC error' }))
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [hours])

  return state
}
