/** Pure memo helpers: decode printable UTF-8 memos and summarise a list of memo events. */
import { hexToString, type Hex } from 'viem'

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

export interface MemoSummary {
  entries: MemoEntry[]
  total: number
  uniqueSenders: number
  uniqueTargets: number
  uniqueMemoIds: number
  topPairs: MemoPair[]
  hours: number
}

export function decodeMemo(memo: Hex): string | null {
  try {
    const s = hexToString(memo)
    // Reject anything with control characters: it is binary, not text.
    // eslint-disable-next-line no-control-regex
    return s.length > 0 && !/[\u0000-\u0008\u000e-\u001f]/.test(s) ? s : null
  } catch {
    return null
  }
}

export function summarizeMemos(entries: MemoEntry[], hours: number): MemoSummary {
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
