/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { NETWORKS } from './lib/chain'
import { circlePasskeyConnector } from './lib/circlePasskey'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [
    injected(),
    // Circle Modular Wallets passkey connector — active when VITE_CLIENT_KEY is set.
    circlePasskeyConnector(),
  ],
  transports: {
    // viem's built-in Arc URL is an old host without CORS; use the documented public RPC.
    [arcTestnet.id]: http(NETWORKS.testnet.rpcUrl),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
