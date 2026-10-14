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
import { rpcUrls } from './lib/rpcTransport'

// ---------------------------------------------------------------------------
// Arc chain selection — single derivation point keyed on NETWORK.id
// ---------------------------------------------------------------------------

const arcChain = selectArcChain(NETWORK.id)

// Pre-register Arc chain RPC URL so trace events show correct chain names immediately
registerChain(arcChain.id, arcChain.rpcUrls.default.http[0])

// ---------------------------------------------------------------------------
// Transport selection
//
// Both networks route browser traffic through a same-origin proxy first so that
// ad blockers / Brave Shields cannot block rpc.*.arc.io (ERR_BLOCKED_BY_CLIENT).
// The proxy paths are:
//   mainnet  → /rpc         (Vercel rewrite → https://rpc.mainnet.arc.io)
//   testnet  → /rpc-testnet (Vercel rewrite → https://rpc.testnet.arc.io)
// Dev server mirrors these via vite.config.ts proxy entries.
// In Node/SSR (origin === undefined) the proxy URLs are skipped automatically.
//
// Testnet: same-origin proxy + three direct endpoints (documented public RPC + two CDN mirrors)
// Mainnet: same-origin proxy + official RPC + two public mirrors from viem's Arc definition
// ---------------------------------------------------------------------------

const _origin = typeof window !== 'undefined' ? window.location.origin : undefined

const arcTransport =
  NETWORK.id === NETWORKS.testnet.id
    ? fallback(
        rpcUrls(
          'testnet',
          [
            NETWORKS.testnet.rpcUrl,
            'https://rpc.blockdaemon.testnet.arc.network',
            'https://rpc.drpc.testnet.arc.network',
          ],
          _origin,
        ).map(u => http(u)),
      )
    : fallback(
        rpcUrls(
          'mainnet',
          [
            NETWORKS.mainnet.rpcUrl,
            // Same endpoints as viem's built-in Arc mainnet definition; checked 2026-10-14.
            'https://rpc.blockdaemon.mainnet.arc.io',
            'https://rpc.drpc.mainnet.arc.io',
          ],
          _origin,
        ).map(u => http(u)),
      )

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
