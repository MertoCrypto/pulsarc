/**
 * tokenLogos.ts — verified-token logo mapping for Arc Mainnet.
 *
 * PURE module: no '@/' path aliases, no import.meta, explicit .ts imports.
 * Keyed by lower-cased Arc Mainnet contract address (from appRegistries.ts).
 *
 * Only verified token addresses are mapped. An unverified token whose
 * name/symbol imitates e.g. "USDC" would have a different address and
 * therefore receives null — preventing logo-impersonation attacks.
 */

export type TokenLogo =
  | { kind: 'web3icon'; icon: 'usdc' | 'eurc' | 'btc' }
  | { kind: 'img'; src: string }

/**
 * Addresses and their logos — all sourced verbatim from MAINNET_APPS in
 * src/data/appRegistries.ts. Lower-cased for case-insensitive lookup.
 *
 * USDC:   0x3600000000000000000000000000000000000000  → web3icon usdc
 * EURC:   0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1  → web3icon eurc
 * cirBTC: 0x171a4217b86a807a64eb94757db6849fb4bdbaa0  → web3icon btc
 * WETH:   0x128cc466b61f542da60c70e3aa11c10e19b84edb  → img /portal-assets/tokens/weth.svg
 * USYC:   0x8a5d989bbb96929f689b0200f435f53da42bf490  → null (no logo asset available)
 */
const LOGO_MAP: Record<string, TokenLogo> = {
  // USDC — Circle dollar stablecoin
  '0x3600000000000000000000000000000000000000': { kind: 'web3icon', icon: 'usdc' },
  // EURC — Circle euro stablecoin
  '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1': { kind: 'web3icon', icon: 'eurc' },
  // cirBTC — Circle Wrapped Bitcoin
  '0x171a4217b86a807a64eb94757db6849fb4bdbaa0': { kind: 'web3icon', icon: 'btc' },
  // WETH — Wrapped Ether; logo is self-hosted (listed in portal-tokens.txt)
  '0x128cc466b61f542da60c70e3aa11c10e19b84edb': { kind: 'img', src: '/portal-assets/tokens/weth.svg' },
  // USYC — US Yield Coin; no logo asset available; intentionally absent (returns null)
}

/**
 * Returns the logo descriptor for a verified Arc Mainnet token address,
 * or null for any address that is not in the verified mapping.
 *
 * The lookup is case-insensitive.
 */
export function getTokenLogo(address: string): TokenLogo | null {
  return LOGO_MAP[address.toLowerCase()] ?? null
}
