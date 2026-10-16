/**
 * gmBoardAddressFor — pure function, no import.meta (safe to run in Node test runner).
 *
 * Each network has its own GmBoard. A valid override (0x + 40 hex, no padding) wins;
 * otherwise the network's own deployment is used. A testnet address is never
 * returned for mainnet, nor the other way round.
 */

export const TESTNET_GM_BOARD = '0xc735a7b1a445cec9f2b8ced0fe69c16b48c3ba81' as `0x${string}`
/** Deployed from 0x3fbE…7Ef6 on Arc Mainnet; one GM per UTC day, resets at 00:00 UTC. Runtime code matches the forge build. */
export const MAINNET_GM_BOARD = '0x7FAb4269110F6D98f28bff1dDdA44aFb14723993' as `0x${string}`

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function gmBoardAddressFor(
  networkId: number,
  override: string | undefined,
): `0x${string}` | null {
  const valid = typeof override === 'string' && HEX_ADDRESS.test(override)
  switch (networkId) {
    case 5042002:
      return valid ? (override as `0x${string}`) : TESTNET_GM_BOARD
    case 5042:
      return valid ? (override as `0x${string}`) : MAINNET_GM_BOARD
    default:
      return null
  }
}
