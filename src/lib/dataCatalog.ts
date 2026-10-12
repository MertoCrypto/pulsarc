/**
 * Data catalog for Pulsarc public indexer files.
 * Pure module — no React, no network calls at import time.
 * Safe for plain Node (--experimental-strip-types).
 */

// ── Constants ──────────────────────────────────────────────────────────────────

export const DATA_BASE =
  'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

// ── Types ──────────────────────────────────────────────────────────────────────

export type Net = 'mainnet' | 'testnet'

export interface CatalogEntry {
  /** Path relative to <net>/ in the data branch, e.g. "latest.json" */
  file: string
  title: string
  description: string
  /** How often the file is refreshed */
  updates: string
  /** Networks this file is published for */
  nets: Net[]
  /**
   * Top-level JSON keys present in the file.
   * Empty array for files that are not plain JSON objects with stable keys
   * (labels.json uses address keys, feed.xml is RSS, hourly/ changes per day).
   */
  keys: string[]
}

// ── Catalog ────────────────────────────────────────────────────────────────────

export const CATALOG: CatalogEntry[] = [
  {
    file: 'latest.json',
    title: 'Network snapshot',
    description:
      'Rolling 1h / 24h / 7d windows with hours covered, blocks, transactions, ' +
      'failed transactions, fees, walletHours, top, auto, account-abstraction (aa, aaTx), ' +
      'buckets and mb counters, plus an hourly series of txs, failed, fees, wallets and ' +
      'blocks. walletHours is an upper bound (≤) on unique wallets over the window.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'windows', 'series'],
  },
  {
    file: 'apps-latest.json',
    title: 'App activity',
    description:
      'Per-app (USDC, EURC, USYC, cirBTC, WETH, StableFX, Memo, Multicall, ' +
      'CCTP, Gateway, ERC-8004, Uniswap, Across, and others) transaction counts, ' +
      'walletHours (≤ unique wallets), volume, and fees across 1h / 24h / 7d ' +
      'windows. coverageHours indicates how many hours of indexer data back the ' +
      'windows.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'coverageHours', 'note', 'apps'],
  },
  {
    file: 'anomalies.json',
    title: 'Anomaly detection',
    description:
      'Apps whose activity in the last UTC hour moved sharply against their 24h ' +
      'median. items lists them, status is "ok" when the list is empty, and hour ' +
      'is the UTC hour the check covered.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'items', 'status', 'hour'],
  },
  {
    file: 'digest-latest.json',
    title: 'Digest',
    description:
      'Precomputed digest. status is "warming-up" until 14 days (336 hours) ' +
      'of indexer data have been collected; readyAt gives the estimated time it will ' +
      'become available. hoursHeld and hoursNeeded track progress.',
    updates: 'Once 14 days of data exist; varies thereafter',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'status', 'readyAt', 'hoursHeld', 'hoursNeeded'],
  },
  {
    file: 'discover.json',
    title: 'Top contracts',
    description:
      'The top contracts by transaction count over the last 24 hours, with ' +
      'walletHours (≤ unique wallets) and fees paid.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'contracts'],
  },
  {
    file: 'agents.json',
    title: 'ERC-8004 agent registry',
    description:
      'Snapshot of the on-chain ERC-8004 identity registry: registry address, ' +
      'last minted id, whether the indexer has caught up to the tip, total count, ' +
      'and a list of agent records (id, owner, uri). A limited number of ids are ' +
      'processed per indexer run when caughtUp is false.',
    updates: 'Varies (limited ids per run until caughtUp)',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'registry', 'lastId', 'caughtUp', 'count', 'agents'],
  },
  {
    file: 'bridge.json',
    title: 'CCTP bridge flows',
    description:
      'CCTP bridge in/out counts and USDC volume by CCTP domain, across ' +
      '1h / 24h / 7d windows, plus an hourly series of outCount / outUsdc / inCount.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'windows', 'series'],
  },
  {
    file: 'supply.json',
    title: 'Token supply',
    description:
      'Current circulating supply for USDC and EURC with an hourly series of ' +
      'supply, mint, and burn amounts.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: ['generatedAt', 'network', 'tokens'],
  },
  {
    file: 'state.json',
    title: 'Indexer state',
    description:
      'Internal indexer state: next block to process, chain tip, network, ' +
      'chainId, open hour and its start block, skipped block ranges, and the ' +
      'timestamp of the last successful run.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: ['next', 'tip', 'network', 'chainId', 'openHour', 'openHourStart', 'skipped', 'updatedAt'],
  },
  {
    file: 'labels.json',
    title: 'Address labels',
    description:
      'Hand-maintained map from lowercase address to a label object with ' +
      'contract flag, name, symbol, and kind. Top-level keys are addresses.',
    updates: 'Hand-maintained; varies',
    nets: ['mainnet', 'testnet'],
    keys: [],
  },
  {
    file: 'balances.json',
    title: 'USDC held by tracked apps',
    description:
      'Sum of USDC balances at the contract addresses Pulsarc tracks for each app: total, per-app amounts ' +
      '(largest first) and an hourly series of the total. Not every address of an app is tracked, so these ' +
      'are not the apps\' total value.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'token', 'total', 'apps', 'series'],
  },
  {
    file: 'agents-activity.json',
    title: 'Agent owner activity',
    description:
      'For the owner wallets of registered ERC-8004 agents: lifetime transactions sent and USDC balance, ' +
      'with counts of owners measured and owners that never sent a transaction. Measured on the owner ' +
      'wallet, not on the agent. On testnet only the 600 owners with the most agents are measured.',
    updates: 'About hourly',
    nets: ['mainnet', 'testnet'],
    keys: ['network', 'generatedAt', 'registry', 'totalAgents', 'owners', 'ownersMeasured', 'agentsMeasured', 'ownersWithTx', 'ownersWithUsdc', 'agentsOfOwnersWithoutTx', 'top'],
  },
  {
    file: 'fx.json',
    title: 'EURC/USDC pool rate',
    description:
      'Marginal price of one EURC in USDC (and the reverse) in the Curve USDC/EURC pool, with the 24h change ' +
      'and an hourly series. It is a pool price, not an official FX rate. Testnet only: there is no verified ' +
      'mainnet source yet.',
    updates: 'Every ~7–10 minutes',
    nets: ['testnet'],
    keys: ['network', 'generatedAt', 'source', 'usdcPerEurc', 'eurcPerUsdc', 'change24hPct', 'series'],
  },
  {
    file: 'feed.xml',
    title: 'RSS feed',
    description: 'RSS 2.0 feed of the apps that are moving now: hourly activity far above or below the 24h median.',
    updates: 'Every ~7–10 minutes',
    nets: ['mainnet', 'testnet'],
    keys: [],
  },
  {
    file: 'hourly/<YYYY-MM-DD>.json',
    title: 'Hourly archive',
    description:
      'One file per UTC day. The object is keyed by hour string in the form ' +
      '"YYYY-MM-DDTHH" (e.g. "2026-10-11T00"). Each value contains the stats ' +
      'for that hour.',
    updates: 'Varies',
    nets: ['mainnet', 'testnet'],
    keys: [],
  },
]

// ── catalogUrl ────────────────────────────────────────────────────────────────

/**
 * Returns the full raw GitHub URL for a catalog entry on the given network.
 * For the hourly/ entry the literal pattern string is used as-is.
 */
export function catalogUrl(entry: CatalogEntry, net: Net): string {
  return `${DATA_BASE}/${net}/${entry.file}`
}

// ── buildCatalogJson ──────────────────────────────────────────────────────────

export interface CatalogJson {
  generatedAt: string
  base: string
  files: Array<{
    file: string
    title: string
    description: string
    updates: string
    nets: Net[]
    keys: string[]
    urls: Record<Net, string>
  }>
}

/**
 * Builds a machine-readable catalog JSON document.
 * `now` defaults to the current time and is injectable for testing.
 * Date formatting uses explicit locale "en-US" — never locale-dependent
 * toLocaleString() without arguments.
 */
export function buildCatalogJson(now?: Date): CatalogJson {
  const generatedAt = (now ?? new Date()).toISOString()
  return {
    generatedAt,
    base: DATA_BASE,
    files: CATALOG.map(entry => ({
      file: entry.file,
      title: entry.title,
      description: entry.description,
      updates: entry.updates,
      nets: entry.nets,
      keys: entry.keys,
      urls: {
        mainnet: catalogUrl(entry, 'mainnet'),
        testnet: catalogUrl(entry, 'testnet'),
      },
    })),
  }
}
