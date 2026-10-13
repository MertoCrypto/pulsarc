/**
 * passkeyAvailability.ts
 *
 * Pure helper — no '@/' imports, no import.meta, no side effects.
 *
 * Reports whether Circle passkey wallets are available on a given network.
 * Currently only Arc Testnet (chain ID 5042002) is supported; all other IDs
 * (including Arc Mainnet 5042) return false.
 */

/** Arc Testnet chain ID — the only network where passkey wallets are offered. */
const ARC_TESTNET_ID = 5042002

/**
 * Returns true when passkey wallets (Circle Modular Wallets) are available for
 * the given network.
 *
 * @param networkId  EVM chain ID (e.g. NETWORK.id from chain.ts)
 */
export function passkeyAvailable(networkId: number): boolean {
  return networkId === ARC_TESTNET_ID
}
