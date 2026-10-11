/**
 * React Query hook for Pulsarc's wallet index.
 * Fetches meta.json, then the shard for the given address.
 * Never throws to the UI.
 */
import { useQuery } from '@tanstack/react-query'
import {
  shardOf,
  parseMeta,
  parseShard,
  summarize,
} from '@/lib/walletIndex'
import type { MetaJson, WalletRecord, WalletSummary, AppsConfig } from '@/lib/walletIndex'

type Net = 'mainnet' | 'testnet'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer'

function metaUrl(net: Net): string {
  return `${BASE}/wallets-${net}/meta.json`
}

function shardUrl(net: Net, shard: string): string {
  return `${BASE}/wallets-${net}/s/${shard}.json`
}

function appsUrl(net: Net): string {
  return `${BASE}/main/apps.${net}.json`
}

export type WalletIndexState =
  | 'idle'
  | 'loading'
  | 'unpublished'
  | 'not-found'
  | 'found'
  | 'error'

export interface UseWalletIndexResult {
  state: WalletIndexState
  meta: MetaJson | null
  record: WalletRecord | null
  summary: WalletSummary | null
  apps: AppsConfig | null
  errorMessage?: string
}

/**
 * Fetches the wallet index for a given address and network.
 * - address: must match /^0x[0-9a-fA-F]{40}$/ or the hook stays idle.
 * - net: 'mainnet' | 'testnet'
 *
 * The address is only ever used to compute the 3-char shard path (never
 * interpolated raw into a URL).
 *
 * staleTime: 10 min, retry: 1
 */
export function useWalletIndex(
  address: string | null,
  net: Net,
): UseWalletIndexResult {
  const shard = address ? shardOf(address) : null
  const enabled = shard !== null && address !== null

  // 1. Fetch meta.json
  const metaQuery = useQuery({
    queryKey: ['wallet-index-meta', net],
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<MetaJson | null | 'unpublished'> => {
      const res = await fetch(metaUrl(net))
      if (res.status === 404) return 'unpublished'
      if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`)
      const raw: unknown = await res.json()
      const parsed = parseMeta(raw)
      if (!parsed) throw new Error('meta.json: invalid shape')
      return parsed
    },
  })

  // 2. Fetch shard only after meta is available and is not 'unpublished'
  const metaReady = metaQuery.isSuccess && metaQuery.data !== 'unpublished' && metaQuery.data !== null
  const shardQuery = useQuery({
    queryKey: ['wallet-index-shard', net, shard],
    enabled: metaReady && enabled,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<Record<string, WalletRecord> | 'not-found'> => {
      // shard is guaranteed non-null here (enabled guard)
      const res = await fetch(shardUrl(net, shard!))
      if (res.status === 404) return 'not-found'
      if (!res.ok) throw new Error(`shard ${shard}: HTTP ${res.status}`)
      const raw: unknown = await res.json()
      return parseShard(raw)
    },
  })

  // 3. Fetch apps config (needed to resolve app ids)
  const appsQuery = useQuery({
    queryKey: ['wallet-index-apps', net],
    enabled: metaReady && enabled,
    staleTime: 60 * 60_000,
    retry: 1,
    queryFn: async (): Promise<AppsConfig | null> => {
      const res = await fetch(appsUrl(net))
      if (!res.ok) return null
      const raw: unknown = await res.json()
      if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Record<string, unknown>)['apps'])) return null
      return raw as AppsConfig
    },
  })

  // ── Derive state ─────────────────────────────────────────────────────────────

  if (!enabled) {
    return { state: 'idle', meta: null, record: null, summary: null, apps: null }
  }

  if (metaQuery.isError) {
    return {
      state: 'error',
      meta: null,
      record: null,
      summary: null,
      apps: null,
      errorMessage: metaQuery.error instanceof Error ? metaQuery.error.message : 'Failed to load index',
    }
  }

  if (metaQuery.isPending) {
    return { state: 'loading', meta: null, record: null, summary: null, apps: null }
  }

  if (metaQuery.data === 'unpublished') {
    return { state: 'unpublished', meta: null, record: null, summary: null, apps: null }
  }

  const meta = metaQuery.data as MetaJson

  if (shardQuery.isPending || appsQuery.isPending) {
    return { state: 'loading', meta, record: null, summary: null, apps: null }
  }

  if (shardQuery.isError) {
    return {
      state: 'error',
      meta,
      record: null,
      summary: null,
      apps: null,
      errorMessage: shardQuery.error instanceof Error ? shardQuery.error.message : 'Failed to load wallet data',
    }
  }

  if (shardQuery.data === 'not-found') {
    return { state: 'not-found', meta, record: null, summary: null, apps: null }
  }

  const shardData = shardQuery.data as Record<string, WalletRecord>
  const lookupKey = address!.toLowerCase()
  const record = shardData[lookupKey] ?? null

  if (!record) {
    return { state: 'not-found', meta, record: null, summary: null, apps: null }
  }

  const appsConfig: AppsConfig = appsQuery.data ?? { apps: [] }
  const summary = summarize(record, meta, appsConfig, Date.now())

  return {
    state: 'found',
    meta,
    record,
    summary,
    apps: appsConfig,
  }
}
