/**
 * The other networks on the Arc map: one "port" per CCTP domain, and the symbol each one wears.
 * Pure data, no '@/' imports, so plain node can run the test. The component maps an icon key to
 * the matching @web3icons/react component.
 */

/** Domain 26 (Arc itself) and −1 (unknown source) are never ports. */
const FIRST_PORTS: readonly number[] = [0, 6, 3, 5, 2, 7, 1] // Ethereum, Base, Arbitrum, Solana, OP Mainnet, Polygon PoS, Avalanche

/** Every other CCTP domain, by id (Arc is 26). */
const REST_PORTS: readonly number[] = [4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 25, 27, 28, 29, 30, 31, 32, 33, 37]

/** Ports in display order: the busiest bridges first, then the rest by id. */
export const PORT_DOMAINS: number[] = [...FIRST_PORTS, ...REST_PORTS]

/** Domains that have an icon component in @web3icons/react (4.x), by component name. */
const ICON_KEYS: Readonly<Record<number, string>> = {
  0: 'NetworkEthereum',
  1: 'NetworkAvalanche',
  2: 'NetworkOptimism',
  3: 'NetworkArbitrumOne',
  5: 'NetworkSolana',
  6: 'NetworkBase',
  7: 'NetworkPolygon',
  8: 'NetworkSui',
  9: 'NetworkAptos',
  10: 'NetworkUnichain',
  11: 'NetworkLinea',
  12: 'NetworkCodex',
  13: 'NetworkSonic',
  14: 'NetworkWorld',
  15: 'NetworkMonad',
  16: 'NetworkSeiNetwork',
  17: 'NetworkBinanceSmartChain',
  18: 'NetworkXdcNetwork',
  19: 'NetworkHyperEvm',
  21: 'NetworkInk',
  22: 'NetworkPlume',
  25: 'NetworkStarknet',
  27: 'NetworkStellar',
  29: 'NetworkInjective',
  32: 'NetworkCronos',
  33: 'NetworkPlasma',
  37: 'NetworkXLayer',
}

/** The @web3icons/react component name for a CCTP domain, or null (Noble, Morph, Pharos, EDGE, unknown). */
export function portIconKey(domain: number): string | null {
  return ICON_KEYS[domain] ?? null
}

/** Up to three letters for a chain without a symbol, e.g. "Morph" → "MOR". */
export function portInitials(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()
}
