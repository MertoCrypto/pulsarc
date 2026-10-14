/**
 * tipAddressFor — pure function, no import.meta (safe to run in Node test runner).
 *
 * Network IDs:
 *   5042002 — Arc Testnet
 *   5042    — Arc Mainnet
 *
 * Rules:
 *   Testnet: use override if it is a valid 0x+40-hex address; otherwise fall back to
 *            TESTNET_TIP_JAR. Whitespace is NOT trimmed — a padded value is invalid.
 *   Mainnet: use override ONLY if it is a valid 0x+40-hex address; return null otherwise.
 *            NEVER fall back to TESTNET_TIP_JAR on mainnet — that address has no code
 *            there, and funds sent to it would be locked permanently.
 *   Unknown: return null.
 */

export const TESTNET_TIP_JAR = '0xded06734606b526fe0075b64cd996b1cfa47fe3e' as `0x${string}`

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/

function isValidAddress(value: string | undefined): value is `0x${string}` {
  return typeof value === 'string' && HEX_ADDRESS.test(value)
}

export function tipAddressFor(
  networkId: number,
  override: string | undefined,
): `0x${string}` | null {
  switch (networkId) {
    case 5042002: // Arc Testnet
      return isValidAddress(override) ? override : TESTNET_TIP_JAR

    case 5042: // Arc Mainnet — never fall back to the testnet address
      return isValidAddress(override) ? override : null

    default:
      return null
  }
}
