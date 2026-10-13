/**
 * walletExamples — pure function, no `@/` aliases, no `import.meta`.
 *
 * Returns the example wallet list for the "Nothing tracked yet" empty state.
 *
 *  - networkId === 5042 (Arc Mainnet): derives examples from `mainnetApps`,
 *    selecting ids ['usdc', 'eurc', 'cctp', 'stablefx'] in that order.
 *    Ids absent from `mainnetApps` are silently skipped.
 *  - Any other networkId (Arc Testnet, unknown): returns `testnet` as-is.
 */

export interface WalletExample {
  label: string
  address: string
}

const MAINNET_IDS = ['usdc', 'eurc', 'cctp', 'stablefx'] as const

export function walletExamples(
  networkId: number,
  mainnetApps: { id: string; name: string; contractAddress: string }[],
  testnet: WalletExample[],
): WalletExample[] {
  if (networkId !== 5042) return testnet

  const byId = new Map(mainnetApps.map(a => [a.id, a]))
  const result: WalletExample[] = []
  for (const id of MAINNET_IDS) {
    const app = byId.get(id)
    if (app) result.push({ label: app.name, address: app.contractAddress })
  }
  return result
}
