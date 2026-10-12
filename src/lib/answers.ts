/**
 * Pure helpers for the Answers pages.
 * No React, no network — safe for plain Node (--experimental-strip-types).
 * Numbers are always formatted with the fixed locale 'en-US'.
 */

import type { LatestSnapshot } from './networkHealth.ts'
import { networkHealthCards } from './networkHealth.ts'
import type { SupplyJson } from './activityMix.ts'
import { automatedShare } from './activityMix.ts'
import type { ExtendedWindow } from './activityMix.ts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentsFile {
  network: string
  generatedAt: string
  registry: string
  lastId: number
  caughtUp: boolean
  count: number
  agents: Array<{ id: number; owner: string; uri: string }>
}

export interface AnswerDef {
  slug: string
  question: string
  short: string
  method: string
  sourceFile: 'latest.json' | 'supply.json' | 'agents.json'
}

// ── ANSWERS catalog ───────────────────────────────────────────────────────────

export const ANSWERS: AnswerDef[] = [
  {
    slug: 'transfer-fee',
    question: 'What does a transaction cost on Arc?',
    short: 'The average fee per transaction over the last 24 hours, paid in USDC.',
    method:
      'This figure is the total network fees paid across all transactions in the last 24-hour indexer window divided by the transaction count — an average, not the cost of any specific transfer. Fees on Arc are paid in USDC. The average can shift hour to hour depending on the mix of transaction types and block utilisation.',
    sourceFile: 'latest.json',
  },
  {
    slug: 'daily-transactions',
    question: 'How many transactions does Arc process per day?',
    short: 'Total transactions recorded by the indexer in the last 24-hour window.',
    method:
      'The count comes from the 24-hour window the indexer maintains in latest.json. The window covers the hours the indexer has recorded up to 24 and includes all transaction types: transfers, contract calls, and failed transactions. The number is refreshed roughly every ten minutes when the indexer runs.',
    sourceFile: 'latest.json',
  },
  {
    slug: 'success-rate',
    question: 'What share of Arc transactions succeed?',
    short: 'The percentage of transactions that did not revert in the last 24 hours.',
    method:
      'Computed as 1 minus the ratio of failed transactions to total transactions over the 24-hour window, expressed as a percentage. A transaction is counted as failed when its receipt status is 0 (reverted). Gas is still consumed on failed transactions, so they appear in both totals. The rate is rounded to two decimal places.',
    sourceFile: 'latest.json',
  },
  {
    slug: 'usdc-supply',
    question: 'How much USDC is on Arc?',
    short: 'The circulating USDC supply on Arc as of the last supply.json snapshot.',
    method:
      'Taken from the circulating supply field in the indexer\'s supply.json reading, which tracks the USDC token contract on Arc. The figure changes with mint and burn events: supply rises with mints and falls with burns. The snapshot is updated at the same cadence as latest.json.',
    sourceFile: 'supply.json',
  },
  {
    slug: 'automated-share',
    question: 'How much of Arc\'s activity is automated?',
    short: 'An estimated share of transactions sent by wallets that appear to be automated.',
    method:
      'The indexer flags wallets as automated when they send many transactions per hour from few distinct senders — a heuristic based on send-rate patterns, not a definitive claim about intent. The share shown is the automated transaction count divided by all transactions in the same hours; the indexer measures this over a recent stretch of hours that can be shorter than 24, and the page says how many. This is an estimate, not a claim about anyone\'s intent.',
    sourceFile: 'latest.json',
  },
  {
    slug: 'agents-registered',
    question: 'How many AI agents are registered on Arc?',
    short: 'Total AI agents recorded in the ERC-8004 identity registry on Arc.',
    method:
      'The total comes from the count field in agents.json, which is produced by the Pulsarc indexer by scanning every mint event on the ERC-8004 identity registry contract. Each minted token represents one registered agent. The number is refreshed at the same cadence as the other indexer snapshots.',
    sourceFile: 'agents.json',
  },
  {
    slug: 'agent-owners',
    question: 'How many wallets own Arc\'s AI agents?',
    short: 'The number of distinct wallet addresses that hold at least one ERC-8004 agent token.',
    method:
      'Each agent token has an owner address recorded in agents.json. This figure counts the number of distinct owner wallets by lowercasing every address before comparing, so the same wallet is never counted twice regardless of how its address was capitalised. One wallet can own many agents; this number reflects wallets, not agents.',
    sourceFile: 'agents.json',
  },
]

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmtInt = new Intl.NumberFormat('en-US')
const fmtPct = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtSupply(n: number): string {
  if (n >= 1_000_000_000) {
    return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 1_000_000_000)}B`
  }
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 1_000_000)}M`
}

function fmtAvgFee(n: number): string {
  // 4 significant digits, dollar prefix
  if (n === 0) return '$0.0000'
  return `$${n.toFixed(4)}`
}

// ── answerValue ───────────────────────────────────────────────────────────────

export function answerValue(
  slug: string,
  latest: LatestSnapshot | null,
  supply: SupplyJson | null,
  agents?: AgentsFile | null,
): { value: string; detail: string } | null {
  switch (slug) {
    case 'transfer-fee': {
      if (!latest) return null
      const w = latest.windows['24h']
      if (w.txs === 0) return null
      const cards = networkHealthCards(w)
      if (cards.avgFee === null) return null
      return { value: fmtAvgFee(cards.avgFee), detail: 'average fee per tx (24h)' }
    }

    case 'daily-transactions': {
      if (!latest) return null
      const w = latest.windows['24h']
      if (w.txs === 0) return null
      return { value: fmtInt.format(w.txs), detail: 'last 24 hours' }
    }

    case 'success-rate': {
      if (!latest) return null
      const w = latest.windows['24h']
      if (w.txs === 0) return null
      const cards = networkHealthCards(w)
      if (cards.successRate === null) return null
      return { value: `${fmtPct.format(cards.successRate)}%`, detail: 'of transactions succeeded (24h)' }
    }

    case 'usdc-supply': {
      if (!supply) return null
      const s = supply.tokens.usdc.supply
      return { value: fmtSupply(s), detail: 'circulating USDC' }
    }

    case 'automated-share': {
      if (!latest) return null
      const w = latest.windows['24h']
      if (w.txs === 0) return null
      const share = automatedShare(w as ExtendedWindow, latest.series)
      if (!share) return null
      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(share.share * 100)
      return { value: `≈${formatted}%`, detail: `estimated, over the last ${share.coverageHours} hours the indexer measured` }
    }

    case 'agents-registered': {
      if (!agents) return null
      const count = agents.count
      if (typeof count !== 'number' || !isFinite(count)) return null
      return { value: fmtInt.format(count), detail: 'registered in the ERC-8004 identity registry' }
    }

    case 'agent-owners': {
      if (!agents) return null
      if (!Array.isArray(agents.agents)) return null
      const seen = new Set<string>()
      for (const agent of agents.agents) {
        if (!agent || typeof agent.owner !== 'string') return null
        seen.add(agent.owner.toLowerCase())
      }
      return { value: fmtInt.format(seen.size), detail: 'distinct owner wallets' }
    }

    default:
      return null
  }
}

// ── answerSeries ──────────────────────────────────────────────────────────────

export function answerSeries(
  slug: string,
  latest: LatestSnapshot | null,
  supply: SupplyJson | null,
  _agents?: AgentsFile | null,
): { points: { label: string; value: number | null }[]; unit: string; source: string } | null {
  const LIMIT = 48

  switch (slug) {
    case 'transfer-fee': {
      if (!latest) return null
      const slice = latest.series.slice(-LIMIT)
      const points = slice.map(pt => ({
        label: pt.hour,
        value: pt.txs === 0 ? null : pt.fees / pt.txs,
      }))
      return { points, unit: 'USDC', source: 'latest.json' }
    }

    case 'daily-transactions': {
      if (!latest) return null
      const slice = latest.series.slice(-LIMIT)
      const points = slice.map(pt => ({
        label: pt.hour,
        value: pt.txs,
      }))
      return { points, unit: 'txs', source: 'latest.json' }
    }

    case 'success-rate': {
      if (!latest) return null
      const slice = latest.series.slice(-LIMIT)
      const points = slice.map(pt => ({
        label: pt.hour,
        value: pt.txs === 0
          ? null
          : parseFloat(((1 - pt.failed / pt.txs) * 100).toFixed(2)),
      }))
      return { points, unit: '%', source: 'latest.json' }
    }

    case 'usdc-supply': {
      if (!supply) return null
      const series = supply.tokens.usdc.series
      const slice = series.slice(-LIMIT)
      const points = slice.map(pt => ({
        label: pt.hour,
        value: pt.supply,
      }))
      return { points, unit: 'USDC', source: 'supply.json' }
    }

    case 'automated-share':
    case 'agents-registered':
    case 'agent-owners':
      // No hourly series available for these metrics.
      return null

    default:
      return null
  }
}
