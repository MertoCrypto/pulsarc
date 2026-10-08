/**
 * Engagement leaderboard: votes, "I used this" attestations and boosts, read from the
 * platform contracts' event logs through ArcScan. Nothing is simulated — until people vote,
 * every count is zero and the page says so.
 */
import { useQuery } from '@tanstack/react-query'
import { keccak256, toBytes } from 'viem'
import { ARC_APPS, type ArcApp } from '@/data/apps'
import { ARC_ATTESTATION_ADDRESS, ARC_BOOST_ADDRESS, ARC_VOTING_ADDRESS } from '@/contracts/abis'
import { arcscan, scaled } from '@/lib/arcscan'
import { loadWalletApps } from '@/hooks/useWalletProfile'

export type Period = 'weekly' | 'monthly' | 'alltime'

export interface LeaderboardEntry {
  app: ArcApp
  rank: number
  votes: number
  attestations: number
  verifiedAttestations: number // attester really did use the app (checked on-chain)
  boostUsdc: number
  score: number
}

export interface TopContributor {
  address: string
  votes: number
  attestations: number
  boostUsdc: number
  appsInteracted: number
}

interface Param { name: string; value: string }
interface LogItem { decoded?: { parameters?: Param[] } | null }
interface Page { items: LogItem[]; next_page_params: Record<string, unknown> | null }

const DAY_S = 86_400
const PERIOD_S: Record<Period, number> = { weekly: 7 * DAY_S, monthly: 30 * DAY_S, alltime: Infinity }
const MAX_PAGES = 6

async function logs(address: string): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const page: Page = await arcscan<Page>(`/addresses/${address}/logs`, cursor ?? undefined)
    for (const l of page.items) {
      const row: Record<string, string> = {}
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
  const since = Number.isFinite(PERIOD_S[period]) ? Math.floor(Date.now() / 1000) - PERIOD_S[period] : 0
  const inPeriod = (r: Record<string, string>) => !r.timestamp || Number(r.timestamp) >= since

  const tally = new Map<string, { votes: number; attestations: number; boostUsdc: number }>(
    ARC_APPS.map(a => [a.id, { votes: 0, attestations: 0, boostUsdc: 0 }]),
  )
  const people = new Map<string, TopContributor & { apps: Set<string> }>()
  const person = (addr: string) => {
    const key = addr.toLowerCase()
    let p = people.get(key)
    if (!p) { p = { address: addr, votes: 0, attestations: 0, boostUsdc: 0, appsInteracted: 0, apps: new Set() }; people.set(key, p) }
    return p
  }

  const apply = (rows: Record<string, string>[], who: string, field: 'votes' | 'attestations' | 'boostUsdc') => {
    for (const r of rows) {
      if (!inPeriod(r)) continue
      const appId = byHash.get((r.dappId ?? '').toLowerCase())
      const amount = field === 'boostUsdc' ? scaled(r.amount, 6) : 1
      if (appId) tally.get(appId)![field] += amount
      if (r[who]) {
        const p = person(r[who])
        p[field] += amount
        if (appId) p.apps.add(appId)
      }
    }
  }
  apply(votes, 'voter', 'votes')
  apply(attests, 'user', 'attestations')
  apply(boosts, 'booster', 'boostUsdc')

  // An "I used this" only counts in full if the attester's own history shows they touched the app.
  const verified = new Map<string, number>()
  const usedBy = new Map<string, Set<string>>()
  const attesters = [...new Set(attests.filter(inPeriod).map(r => (r.user ?? '').toLowerCase()).filter(Boolean))].slice(0, 20)
  await Promise.all(attesters.map(async addr => {
    try { usedBy.set(addr, new Set((await loadWalletApps(addr)).topApps.map(t => t.app.id))) } catch { /* unverifiable */ }
  }))
  for (const r of attests) {
    if (!inPeriod(r)) continue
    const appId = byHash.get((r.dappId ?? '').toLowerCase())
    if (appId && usedBy.get((r.user ?? '').toLowerCase())?.has(appId)) verified.set(appId, (verified.get(appId) ?? 0) + 1)
  }

  const entries: LeaderboardEntry[] = ARC_APPS
    .map(app => {
      const t = tally.get(app.id)!
      const v = verified.get(app.id) ?? 0
      return { app, rank: 0, ...t, verifiedAttestations: v, score: t.votes + v * 2 + (t.attestations - v) * 0.5 + t.boostUsdc * 10 }
    })
    .sort((a, b) => b.score - a.score)
    .map((e, i) => ({ ...e, rank: i + 1 }))

  const topContributors: TopContributor[] = [...people.values()]
    .map(p => ({ address: p.address, votes: p.votes, attestations: p.attestations, boostUsdc: p.boostUsdc, appsInteracted: p.apps.size }))
    .sort((a, b) => (b.votes + b.attestations * 2 + b.boostUsdc * 10) - (a.votes + a.attestations * 2 + a.boostUsdc * 10))
    .slice(0, 10)

  const events = entries.reduce((s, e) => s + e.votes + e.attestations, 0)
  return { entries, topContributors, hasActivity: events > 0 || entries.some(e => e.boostUsdc > 0) }
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
