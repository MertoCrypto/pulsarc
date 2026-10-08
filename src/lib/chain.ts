/**
 * The one place that knows which Arc network the app talks to.
 * Switch with VITE_ARC_NETWORK=mainnet — but note the app registry (src/data/apps.ts) and the
 * platform contracts are testnet deployments and must be re-created for mainnet first.
 */
export interface ArcNetwork {
  id: number
  name: string
  rpcUrl: string
  explorerUrl: string
}

export const NETWORKS: Record<'testnet' | 'mainnet', ArcNetwork> = {
  testnet: { id: 5042002, name: 'Arc Testnet', rpcUrl: 'https://rpc.testnet.arc.io', explorerUrl: 'https://explorer.testnet.arc.io' },
  mainnet: { id: 5042, name: 'Arc Mainnet', rpcUrl: 'https://rpc.mainnet.arc.io', explorerUrl: 'https://explorer.arc.io' },
}

const selected = import.meta.env.VITE_ARC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

export const NETWORK = NETWORKS[selected]
export const CHAIN_ID = NETWORK.id
export const RPC_URL = NETWORK.rpcUrl
export const EXPLORER_URL = NETWORK.explorerUrl
