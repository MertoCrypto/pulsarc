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
// Mainnet: official RPC first, then two public mirrors from viem's own Arc definition.
// ---------------------------------------------------------------------------

const arcTransport =
  NETWORK.id === NETWORKS.testnet.id
    ? fallback([
        http(NETWORKS.testnet.rpcUrl),
        http('https://rpc.blockdaemon.testnet.arc.network'),
        http('https://rpc.drpc.testnet.arc.network'),
      ])
    : fallback([
        // Same-origin proxy first: ad blockers and privacy extensions block rpc.* hosts
        // (ERR_BLOCKED_BY_CLIENT), which left tip/GM waiting forever. See vercel.json.
        ...(typeof window !== 'undefined' ? [http(`${window.location.origin}/rpc`)] : []),
        http(NETWORKS.mainnet.rpcUrl),
        // Same endpoints as viem's built-in Arc mainnet definition; checked 2026-10-14 (chain id 0x13b2, heights in step).
        http('https://rpc.blockdaemon.mainnet.arc.io'),
        http('https://rpc.drpc.mainnet.arc.io'),
      ])

export const config = createConfig({
  chains: [arcChain, mainnet], // mainnet needed for ENS resolution
  connectors: [
    injected(),
  ],
  transports: {
    [arcChain.id]: arcTransport,
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
