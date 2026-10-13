/**
 * interactAvailability.ts
 *
 * Pure, side-effect-free module — NO import.meta, NO React, NO wagmi.
 * Callers pass networkId and an overrides bag (typically built from
 * import.meta.env at the call-site) so this file stays unit-testable
 * with plain Node.
 */

export const TESTNET_CHAIN_ID = 5042002
export const MAINNET_CHAIN_ID = 5042

/** Keys that MUST resolve to a valid 0x+40-hex address on mainnet. */
const REQUIRED_ENV_KEYS = [
  'VITE_ARC_VOTING_ADDRESS',
  'VITE_ARC_ATTESTATION_ADDRESS',
  'VITE_ARC_BOOST_ADDRESS',
  'VITE_ARC_WATCHLIST_NFT_ADDRESS',
] as const

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function isValidAddress(value: string | undefined): boolean {
  if (value === undefined) return false
  // No trimming: abis.ts passes the raw env value to wagmi, so a padded address would fail there.
  return ADDRESS_RE.test(value)
}

export interface InteractAvailabilityResult {
  available: boolean
  reason?: string
}

/**
 * Decide whether platform interact buttons should be enabled.
 *
 * @param networkId  - The active chain/network id (e.g. CHAIN_ID from chain.ts).
 * @param overrides  - A record of env-var-like keys to their string values
 *                     (pass `import.meta.env` or a subset at the call-site).
 */
export function interactAvailable(
  networkId: number,
  overrides: Record<string, string | undefined>,
): InteractAvailabilityResult {
  if (networkId === TESTNET_CHAIN_ID) {
    return { available: true }
  }

  if (networkId === MAINNET_CHAIN_ID) {
    const allPresent = REQUIRED_ENV_KEYS.every(key => isValidAddress(overrides[key]))
    if (allPresent) {
      return { available: true }
    }
    return {
      available: false,
      reason: 'These on-chain actions are not deployed on Arc Mainnet yet.',
    }
  }

  // Unknown / unsupported network
  return {
    available: false,
    reason: 'Unsupported network.',
  }
}
