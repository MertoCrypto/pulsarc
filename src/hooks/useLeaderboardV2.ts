/**
 * Engagement leaderboard: votes, "I used this" attestations and boosts, read from the
 * platform contracts' event logs through ArcScan. Nothing is simulated — until people vote,
 * every count is zero and the page says so.
 */
import { useQuery } from '@tanstack/react-query'
import { keccak256, toBytes } from 'viem'
import { ARC_APPS } from '@/data/apps'
import { ARC_ATTESTATION_ADDRESS, ARC_BOOST_ADDRESS, ARC_VOTING_ADDRESS } from '@/contracts/abis'
import { arcscan } from '@/lib/arcscan'
import { attestersToVerify, buildLeaderboard, periodSince, type LogRow, type Period } from '@/lib/leaderboard'
import { loadWalletApps } from '@/hooks/useWalletProfile'

export type { Period, LeaderboardEntry, TopContributor } from '@/lib/leaderboard'

interface Param { name: string; value: string }
interface LogItem { decoded?: { parameters?: Param[] } | null }
interface Page { items: LogItem[]; next_page_params: Record<string, unknown> | null }

const MAX_PAGES = 6

async function logs(address: string): Promise<LogRow[]> {
  const out: LogRow[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const page: Page = await arcscan<Page>(`/addresses/${address}/logs`, cursor ?? undefined)
    for (const l of page.items) {
      const row: LogRow = {}
      for (const p of l.decoded?.parameters ?? []) row[p.name] = String(p.value)
      out.push(row)
    }
    cursor = page.next_page_params
    if (!cursor) break
  }
  return out
}

async function load(period: Period) {
  const [votes, attests, boosts] = await Promise.all([
    logs(ARC_VOTING_ADDRESS), logs(ARC_ATTESTATION_ADDRESS), logs(ARC_BOOST_ADDRESS),
  ])

  // The contracts index dappId as a string, so the log only holds its keccak hash.
  const byHash = new Map(ARC_APPS.map(a => [keccak256(toBytes(a.id)).toLowerCase(), a.id]))
  const since = periodSince(period, Date.now())

  const usedBy = new Map<string, Set<string>>()
  await Promise.all(attestersToVerify(attests, since).map(async addr => {
    try { usedBy.set(addr, new Set((await loadWalletApps(addr)).topApps.map(t => t.app.id))) } catch { /* unverifiable */ }
  }))

  return buildLeaderboard({ apps: ARC_APPS, byHash, votes, attests, boosts, since, usedBy })
}

export function useLeaderboardV2(period: Period) {
  const q = useQuery({ queryKey: ['engagement', period], queryFn: () => load(period), staleTime: 60_000, retry: 1 })
  return {
    entries: q.data?.entries ?? [],
    topContributors: q.data?.topContributors ?? [],
    hasActivity: q.data?.hasActivity ?? false,
    isLoading: q.isLoading,
    isError: q.isError,
    reload: () => { void q.refetch() },
  }
}
