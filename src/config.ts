/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { NETWORKS, NETWORK } from './lib/chain'
import { selectArcChain } from './lib/arcChains'

// ---------------------------------------------------------------------------
// Arc chain selection — single derivation point keyed on NETWORK.id
// ---------------------------------------------------------------------------

const arcChain = selectArcChain(NETWORK.id)

// Pre-register Arc chain RPC URL so trace events show correct chain names immediately
registerChain(arcChain.id, arcChain.rpcUrls.default.http[0])

// ---------------------------------------------------------------------------
// Transport selection
//
// Testnet: three-endpoint fallback (documented public RPC + two CDN mirrors)
//   — viem's built-in Arc URL is an old host without CORS; use the documented
//     public RPC. Several public endpoints, tried in order: one rate-limited or
//     blocked RPC no longer blanks the GM and tip panels.
// Mainnet: single http() pointing at the official mainnet RPC endpoint.
// ---------------------------------------------------------------------------

const arcTransport =
  NETWORK.id === NETWORKS.testnet.id
    ? fallback([
        http(NETWORKS.testnet.rpcUrl),
        http('https://rpc.blockdaemon.testnet.arc.network'),
        http('https://rpc.drpc.testnet.arc.network'),
      ])
    : http(NETWORKS.mainnet.rpcUrl)

export const config = createConfig({
  chains: [arcChain, mainnet], // mainnet needed for ENS resolution
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
    [arcChain.id]: arcTransport,
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
