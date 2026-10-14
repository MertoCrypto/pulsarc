/**
 * Arc chain definitions and network-aware selector.
 *
 * Pure module: only viem imports — no React, no wagmi config.
 * Consumed by src/config.ts and importable in tests via
 *   node --experimental-strip-types --no-warnings
 */

import { defineChain } from 'viem'
import { arcTestnet } from 'viem/chains'
import { NETWORKS } from './chain.ts'

// ---------------------------------------------------------------------------
// Arc Mainnet chain definition
// ---------------------------------------------------------------------------
// nativeCurrency is read from the sandbox-verifiable arcTestnet definition
// and applied verbatim — both chains share USDC as native gas token.
// Verified on-chain 2026-10-14: on mainnet, eth_getBalance equals USDC balanceOf × 10^12 for live wallets,
// so the native gas unit has 18 decimals while the ERC-20 interface has 6 (same as testnet).

export const arcMainnet = defineChain({
  id: NETWORKS.mainnet.id,
  name: NETWORKS.mainnet.name,
  nativeCurrency: arcTestnet.nativeCurrency, // { name:'USDC', symbol:'USDC', decimals:18 }
  rpcUrls: {
    default: { http: [NETWORKS.mainnet.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: NETWORKS.mainnet.explorerUrl },
  },
})

// ---------------------------------------------------------------------------
// Re-export testnet for convenient co-import
// ---------------------------------------------------------------------------

export { arcTestnet }

// ---------------------------------------------------------------------------
// Selector: given a chain ID (NETWORK.id), return the matching Arc Chain object
// ---------------------------------------------------------------------------

export type ArcChain = typeof arcTestnet | typeof arcMainnet

/**
 * Returns the viem Chain object for the given Arc chain ID.
 * Throws for unknown IDs so misconfiguration is caught at startup rather than
 * silently falling back to a wrong chain.
 */
export function selectArcChain(chainId: number): ArcChain {
  if (chainId === NETWORKS.testnet.id) return arcTestnet
  if (chainId === NETWORKS.mainnet.id) return arcMainnet
  throw new Error(
    `selectArcChain: unknown Arc chain id ${chainId}. ` +
    `Expected ${NETWORKS.testnet.id} (testnet) or ${NETWORKS.mainnet.id} (mainnet).`,
  )
}
