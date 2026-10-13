/**
 * Mainnet equivalent of useWalletSnapshots.
 *
 * Returns an array of query results in the same positional order as the input
 * addresses — identical outer shape to useQueries so callers can index by [i].
 *
 * Sources:
 *   balance       <- RPC (getBalance via useWalletLive)
 *   txCount       <- RPC nonce (sentTxCount) — "sent transactions", NOT total
 *   isContract    <- RPC (getCode)
 *   lastActive    <- wallet index last-active day (null when not indexed)
 *   txns24h       <- UNKNOWN on mainnet (undefined; callers must hide this column)
 *   txns24hCapped <- UNKNOWN on mainnet (undefined)
 *   name          <- null (index has no name field)
 *
 * ArcScan is never called from this hook.
 */

import { useQueries } from '@tanstack/react-query'
import { clientFor } from '@/lib/arcRpc'
import { toLiveFacts } from '@/lib/walletLive'
import {
  shardOf,
  parseMeta,
  parseShard,
} from '@/lib/walletIndex'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'
import {
  toMainnetSnapshot,
  type MainnetWalletSnapshot,
} from '@/lib/walletSnapshotMainnet'

// ── Index fetch helpers (mainnet branch only) ─────────────────────────────────

const INDEX_BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer'

function metaUrl(): string {
  return `${INDEX_BASE}/wallets-mainnet/meta.json`
}

function shardUrl(shard: string): string {
  return `${INDEX_BASE}/wallets-mainnet/s/${shard}.json`
}

/**
 * Fetch the last-active day for a single address from the mainnet wallet index.
 * Returns null (not throws) when:
 *   - meta.json is not yet published (404)
 *   - the shard does not exist (404)
 *   - the address is not in the shard
 *   - any network or parse error
 */
async function fetchLastActiveDay(address: string): Promise<string | null> {
  const shard = shardOf(address)
  if (!shard) return null

  try {
    // 1. meta.json — just to verify the index is published
    const metaRes = await fetchWithTimeout(metaUrl())
    if (metaRes.status === 404) return null
    if (!metaRes.ok) return null
    const metaRaw: unknown = await metaRes.json()
    const meta = parseMeta(metaRaw)
    if (!meta) return null

    // 2. shard
    const shardRes = await fetchWithTimeout(shardUrl(shard))
    if (shardRes.status === 404) return null
    if (!shardRes.ok) return null
    const shardRaw: unknown = await shardRes.json()
    const shardData = parseShard(shardRaw)

    const record = shardData[address.toLowerCase()] ?? null
    if (!record) return null

    // Convert last-active day number to ISO string
    const EPOCH_MS = Date.UTC(2026, 0, 1)
    return new Date(EPOCH_MS + record.l * 86_400_000).toISOString()
  } catch {
    return null
  }
}

// ── Per-address query function ─────────────────────────────────────────────────

async function mainnetSnapshot(address: string): Promise<MainnetWalletSnapshot | null> {
  const a = address as `0x${string}`
  const client = clientFor('mainnet')

  // Run RPC and index fetch in parallel; index failure is non-fatal
  const [rpcResult, lastActive] = await Promise.all([
    Promise.allSettled([
      client.getBalance({ address: a }),
      client.getTransactionCount({ address: a }),
      client.getCode({ address: a }),
    ]),
    fetchLastActiveDay(address),
  ])

  const [balRes, nonceRes, codeRes] = rpcResult
  if (
    balRes.status === 'rejected' ||
    nonceRes.status === 'rejected' ||
    codeRes.status === 'rejected'
  ) {
    // Any RPC failure → throw so React Query marks this entry as error
    const err =
      (balRes.status === 'rejected' ? balRes.reason : null) ??
      (nonceRes.status === 'rejected' ? nonceRes.reason : null) ??
      (codeRes.status === 'rejected' ? codeRes.reason : null)
    throw err instanceof Error ? err : new Error('RPC call failed')
  }

  const live = toLiveFacts({
    balance: balRes.value,
    nonce: nonceRes.value,
    code: codeRes.value,
  })

  // toMainnetSnapshot handles null live gracefully (returns null)
  const snap = toMainnetSnapshot(
    address,
    live,
    lastActive !== null ? { l: dayFromIso(lastActive) } : null,
  )
  return snap
}

/** Reverse of dayToIso: ISO string -> day number relative to 2026-01-01 UTC. */
function dayFromIso(iso: string): number {
  const EPOCH_MS = Date.UTC(2026, 0, 1)
  const ms = new Date(iso).getTime()
  return Math.round((ms - EPOCH_MS) / 86_400_000)
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Mainnet replacement for useWalletSnapshots.
 *
 * Same return shape: an array of UseQueryResult<MainnetWalletSnapshot | null>
 * indexed by position — callers access `snaps[i].data`, `snaps[i].isLoading`,
 * `snaps[i].isError`, `snaps[i].refetch()`.
 */
export function useWalletSnapshotsMainnet(addresses: string[]) {
  return useQueries({
    queries: addresses.map(address => ({
      queryKey: ['wallet-snapshot-mainnet', address.toLowerCase()],
      queryFn: () => mainnetSnapshot(address),
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: 1,
    })),
  })
}
