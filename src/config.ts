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

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [
    injected(),
    // NOTE: circlePasskeyConnector is intentionally NOT listed here.
    // ConnectKit lists every connector in this array; an unknown connector type
    // (not 'injected', 'mock', or 'coinbaseWalletSDK') gets isInstalled=false,
    // and a connector without getWalletConnectDeeplink falls into a "not installed"
    // or blank-icon/scan-screen path that confuses users.
    // PasskeyButton.tsx calls connect({ connector: circlePasskeyConnector() })
    // directly — wagmi accepts a connector factory in connect() and sets it up
    // on first use, keeping it fully functional without exposing it in the CK list.
  ],
  transports: {
    // viem's built-in Arc URL is an old host without CORS; use the documented public RPC.
    [arcTestnet.id]: http(NETWORKS.testnet.rpcUrl),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
