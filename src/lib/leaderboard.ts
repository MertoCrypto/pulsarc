/** Pure scoring for the engagement leaderboard: tallies votes, attestations and boosts per app and per person. */
import type { ArcApp } from '@/data/apps'
import { scaled } from './numberFormat.ts'

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

export type LogRow = Record<string, string>

const DAY_S = 86_400
export const PERIOD_S: Record<Period, number> = { weekly: 7 * DAY_S, monthly: 30 * DAY_S, alltime: Infinity }

/** Unix-seconds cutoff for a period; 0 means "no cutoff". */
export function periodSince(period: Period, nowMs: number): number {
  return Number.isFinite(PERIOD_S[period]) ? Math.floor(nowMs / 1000) - PERIOD_S[period] : 0
}

export const inPeriod = (r: LogRow, since: number) => !r.timestamp || Number(r.timestamp) >= since

/** Up to 20 distinct attester addresses (lower-cased) from this period, in first-seen order. */
export function attestersToVerify(attests: readonly LogRow[], since: number): string[] {
  return [...new Set(attests.filter(r => inPeriod(r, since)).map(r => (r.user ?? '').toLowerCase()).filter(Boolean))].slice(0, 20)
}

export function buildLeaderboard(input: {
  apps: readonly ArcApp[]
  byHash: ReadonlyMap<string, string> // lower-cased dappId hash -> app id
  votes: readonly LogRow[]
  attests: readonly LogRow[]
  boosts: readonly LogRow[]
  since: number
  usedBy: ReadonlyMap<string, ReadonlySet<string>> // lower-cased attester -> app ids they really used
}): { entries: LeaderboardEntry[]; topContributors: TopContributor[]; hasActivity: boolean } {
  const { apps, byHash, votes, attests, boosts, since, usedBy } = input

  const tally = new Map<string, { votes: number; attestations: number; boostUsdc: number }>(
    apps.map(a => [a.id, { votes: 0, attestations: 0, boostUsdc: 0 }]),
  )
  const people = new Map<string, TopContributor & { apps: Set<string> }>()
  const person = (addr: string) => {
    const key = addr.toLowerCase()
    let p = people.get(key)
    if (!p) { p = { address: addr, votes: 0, attestations: 0, boostUsdc: 0, appsInteracted: 0, apps: new Set() }; people.set(key, p) }
    return p
  }

  const apply = (rows: readonly LogRow[], who: string, field: 'votes' | 'attestations' | 'boostUsdc') => {
    for (const r of rows) {
      if (!inPeriod(r, since)) continue
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
  for (const r of attests) {
    if (!inPeriod(r, since)) continue
    const appId = byHash.get((r.dappId ?? '').toLowerCase())
    if (appId && usedBy.get((r.user ?? '').toLowerCase())?.has(appId)) verified.set(appId, (verified.get(appId) ?? 0) + 1)
  }

  const entries: LeaderboardEntry[] = apps
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
