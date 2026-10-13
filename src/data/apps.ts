/**
 * The apps Pulsarc tracks on Arc.
 *
 * Every entry is a real, deployed contract set — addresses were checked against ArcScan
 * (is_contract, name, token metadata). An app is measured through its "anchors":
 *   - token anchors    → activity = transfers of that token (pools, vaults, stablecoins)
 *   - contract anchors → activity = transactions sent to that contract (infrastructure)
 *
 * `official` means the address is listed in Circle's Arc docs (docs.arc.io/arc/references/contract-addresses).
 * `usd` marks anchors whose token amount is a dollar amount, so volume can be summed in USD.
 *
 * Network selection:
 *   Arc Mainnet (chainId 5042)  → MAINNET_APPS  (13 apps)
 *   Arc Testnet (chainId 5042002) → TESTNET_APPS (21 apps)
 */
import { APP_LOGOS } from './portal'
import {
  appsForNetwork,
  TESTNET_APPS,
  MAINNET_APPS,
  type AppCategory,
  type AppKind,
  type Anchor,
  type ArcApp,
} from './appRegistries'
import { NETWORK } from '@/lib/chain'

// Logos come from the portal map; the pure registry module knows nothing about them.
const withLogos = (list: ArcApp[]): ArcApp[] =>
  list.map(a => ({ ...a, logo: APP_LOGOS[a.id]?.img, logoIcon: APP_LOGOS[a.id]?.icon }))

// Re-export types so existing imports (`import { ArcApp } from '@/data/apps'`) keep working.
export type { AppCategory, AppKind, Anchor, ArcApp }

// Re-export the individual registries for consumers that need them.
export { TESTNET_APPS, MAINNET_APPS }

// Re-export the pure helper (also satisfies the spec requirement).
export { appsForNetwork }

/**
 * The live app registry — automatically selects mainnet or testnet based on
 * the active network. On testnet builds the content is identical to the
 * original ARC_APPS export.
 */
export const ARC_APPS: ArcApp[] = withLogos(appsForNetwork(NETWORK.id))

export const CATEGORIES: AppCategory[] = ['Stablecoin', 'DeFi', 'RWA', 'Payments', 'Agents', 'Infra']

export const appById = (id: string): ArcApp | undefined => ARC_APPS.find(a => a.id === id)
