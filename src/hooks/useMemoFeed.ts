import { useEffect, useState } from 'react'
import { parseAbiItem, hexToString, type Address, type Hex } from 'viem'
import { arcClient, getLogsChunked, withRetry, readCache, writeCache, blocksForHours } from '@/lib/arcRpc'

/** Arc's transaction Memo contract (docs.arc.io/arc/concepts/transaction-memos). */
export const MEMO_CONTRACT: Address = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505'

const memoEvent = parseAbiItem(
  'event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)',
)

export interface MemoEntry {
  block: number
  tx: string
  sender: string
  target: string
  memoId: string
  /** Decoded text when the memo is printable UTF-8, otherwise null. */
  text: string | null
}

export interface MemoPair { sender: string; target: string; count: number }

export interface MemoFeed {
  entries: MemoEntry[]
  total: number
  uniqueSenders: number
  uniqueTargets: number
  uniqueMemoIds: number
  topPairs: MemoPair[]
  hours: number
  /** Block ranges the RPC refused even after retries; counts are a floor when > 0. */
  failedWindows: number
  totalWindows: number
  progress: number
  isLoading: boolean
  error: string | null
}

const CACHE_MS = 5 * 60_000

function decodeMemo(memo: Hex): string | null {
  try {
    const s = hexToString(memo)
    // Reject anything with control characters: it is binary, not text.
    // eslint-disable-next-line no-control-regex
    return s.length > 0 && !/[\u0000-\u0008\u000e-\u001f]/.test(s) ? s : null
  } catch {
    return null
  }
}

function summarize(entries: MemoEntry[], hours: number): Omit<MemoFeed, 'progress' | 'isLoading' | 'error' | 'failedWindows' | 'totalWindows'> {
  const pairs = new Map<string, MemoPair>()
  for (const e of entries) {
    const k = `${e.sender}>${e.target}`
    const cur = pairs.get(k)
    if (cur) cur.count++
    else pairs.set(k, { sender: e.sender, target: e.target, count: 1 })
  }
  return {
    entries: entries.slice(0, 25),
    total: entries.length,
    uniqueSenders: new Set(entries.map(e => e.sender)).size,
    uniqueTargets: new Set(entries.map(e => e.target)).size,
    uniqueMemoIds: new Set(entries.map(e => e.memoId)).size,
    topPairs: [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    hours,
  }
}

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
        setState({ ...summarize(cached, hours), failedWindows: 0, totalWindows: 0, progress: 1, isLoading: false, error: null })
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
        setState({ ...summarize(entries, hours), failedWindows, totalWindows, progress: 1, isLoading: false, error: null })
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
