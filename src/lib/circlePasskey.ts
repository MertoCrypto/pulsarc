/**
 * Circle Modular Wallets — passkey connector for Pulsarc.
 *
 * Arc Testnet configuration.  To switch to mainnet, change the two constants
 * CIRCLE_CHAIN_PATH and CIRCLE_CHAIN below (one-line change each).
 */

import { createPublicClient, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import { createBundlerClient } from 'viem/account-abstraction'
import {
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  EIP1193Provider,
} from '@circle-fin/modular-wallets-core'
import { createConnector } from 'wagmi'
import type { P256Credential } from 'viem/account-abstraction'
import { NETWORKS } from './chain'

// ─── Chain config (one-line change to switch to mainnet) ───────────────────
/** Circle transport path segment for the target chain. */
const CIRCLE_CHAIN_PATH = '/arcTestnet'   // mainnet: '/arc'
/** viem chain object for the target chain. */
const CIRCLE_CHAIN = arcTestnet           // mainnet: arc (from 'viem/chains')
// ──────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pulsarc:passkey:credential'

/** Reads back a persisted P256Credential from localStorage.
 *
 * TODO (production): move this to an httpOnly cookie via a small serverless
 * function.  localStorage is acceptable for testnet demos but is vulnerable
 * to XSS — do NOT use it in a production environment with real funds.
 */
export function loadStoredCredential(): P256Credential | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as P256Credential
  } catch {
    return null
  }
}

/** Persists a P256Credential so the user stays logged in across page reloads.
 *
 * TODO (production): replace with an httpOnly cookie.
 */
export function saveCredential(cred: P256Credential): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cred))
}

/** Clears the persisted credential (disconnect). */
export function clearCredential(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Returns true when the browser supports the WebAuthn API. */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  )
}


/**
 * Circle only accepts usernames of 5-50 characters made of letters, digits and _@.:+-
 * (checked against rp_getRegistrationOptions). Turn whatever the user typed into one.
 */
export function toCircleUsername(raw?: string): string {
  let u = (raw ?? '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_@.:+-]/g, '')
  if (u.length < 5) u = `pulsarc-${u || Math.random().toString(36).slice(2, 6)}`
  return u.slice(0, 50)
}

// ─── Connector ID ──────────────────────────────────────────────────────────
export const CIRCLE_PASSKEY_CONNECTOR_ID = 'circlePasskey'

/**
 * Wraps the Circle EIP1193Provider so its request() returns the raw result
 * instead of the full JSON-RPC envelope { result, jsonrpc, id } that the SDK
 * emits by default.  viem/wagmi expect EIP-1193: request() → raw value.
 *
 * Also intercepts methods the SDK does not implement and routes them to either
 * a plain-HTTP public client or returns sensible no-op answers so wagmi's
 * internal machinery (fee estimation, nonce, chain-switch) does not error out.
 *
 * Per the Circle guide the publicClient passed to EIP1193Provider must use a
 * standard HTTP transport (not modularTransport) so that eth_getTransactionReceipt
 * resolves against the chain's public RPC.
 */
function wrapProvider(sdkProvider: InstanceType<typeof EIP1193Provider>, plainPublicClient: ReturnType<typeof createPublicClient>) {
  let _idCounter = 1

  const wrapped = {
    // ── EIP-1193 request ────────────────────────────────────────────────
    async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
      // Methods to route straight to the plain public client (reads)
      const publicReadMethods = new Set([
        'eth_getBalance',
        'eth_getCode',
        'eth_getStorageAt',
        'eth_getTransactionCount',
        'eth_call',
        'eth_blockNumber',
        'eth_getBlockByNumber',
        'eth_getBlockByHash',
        'eth_estimateGas',
        'eth_feeHistory',
        'eth_getLogs',
        'eth_getFilterLogs',
      ])

      if (publicReadMethods.has(method)) {
        return plainPublicClient.request({ method, params })
      }

      // Fee-related — return zero so wagmi doesn't stall; ERC-4337 sets its own fees
      if (method === 'eth_gasPrice' || method === 'eth_maxPriorityFeePerGas') {
        return '0x0'
      }

      // Chain-switch is a no-op — connector is Arc Testnet only
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
        return null
      }

      // Everything else goes to the SDK provider; unwrap the JSON-RPC envelope
      const id = _idCounter++
      const response = await sdkProvider.request({ method, params, jsonrpc: '2.0', id })
      // The SDK returns { result, jsonrpc, id } — extract result
      if (response !== null && typeof response === 'object' && 'result' in (response as object)) {
        return (response as { result: unknown }).result
      }
      return response
    },

    // ── Event emitter stubs wagmi needs ─────────────────────────────────
    on(event: string, listener: (...args: unknown[]) => void) {
      if ('on' in sdkProvider && typeof (sdkProvider as { on?: unknown }).on === 'function') {
        (sdkProvider as { on: (e: string, l: (...a: unknown[]) => void) => void }).on(event, listener)
      }
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      if ('removeListener' in sdkProvider && typeof (sdkProvider as { removeListener?: unknown }).removeListener === 'function') {
        (sdkProvider as { removeListener: (e: string, l: (...a: unknown[]) => void) => void }).removeListener(event, listener)
      }
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      if ('off' in sdkProvider && typeof (sdkProvider as { off?: unknown }).off === 'function') {
        (sdkProvider as { off: (e: string, l: (...a: unknown[]) => void) => void }).off(event, listener)
      }
    },
  }

  return wrapped
}

type WrappedProvider = ReturnType<typeof wrapProvider>

/**
 * Creates a wagmi connector that authenticates via Circle Modular Wallets
 * (passkey / WebAuthn) and exposes the smart account through EIP-1193 so
 * wagmi hooks (useAccount, useWriteContract, etc.) work without modification.
 *
 * The connector is intentionally NOT registered in createConfig() — it is
 * passed directly to connect() from PasskeyButton so ConnectKit never lists
 * it and cannot show the QR / "not installed" screen for it.
 *
 * The connector is only useful when VITE_CLIENT_KEY is set.  If it is absent,
 * connect() will throw, allowing the UI to hide the passkey option gracefully.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function circlePasskeyConnector(): ReturnType<typeof createConnector<any>> {
  // Cast needed because our connect() signature includes a custom `username` field
  // that lies outside the strict wagmi generic — the runtime behaviour is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createConnector((config) => {
    let _wrappedProvider: WrappedProvider | null = null
    let _address: `0x${string}` | null = null
    // Track the in-flight build so getProvider() can await it after a setup() reconnect
    let _buildPromise: Promise<WrappedProvider> | null = null

    function getClientKey(): string {
      const key = import.meta.env.VITE_CLIENT_KEY as string | undefined
      if (!key) throw new Error('VITE_CLIENT_KEY is not set')
      return key
    }

    function getClientUrl(): string {
      return (import.meta.env.VITE_CLIENT_URL as string | undefined) ||
        'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
    }

    async function buildProvider(credential: P256Credential): Promise<WrappedProvider> {
      const clientKey = getClientKey()
      const clientUrl = getClientUrl()

      const modularTransport = toModularTransport(
        `${clientUrl}${CIRCLE_CHAIN_PATH}`,
        clientKey,
      )

      // ── Read-only public client on the plain Arc RPC (no modularTransport) ──
      // The Circle guide requires this for eth_getTransactionReceipt to work.
      // Do NOT use viem's built-in arcTestnet RPC — it has no CORS on Vercel.
      const plainPublicClient = createPublicClient({
        chain: CIRCLE_CHAIN,
        transport: http(NETWORKS.testnet.rpcUrl),
      })

      // ── Bundler client (used for smart-account operations) ───────────────
      const bundlerClient = createBundlerClient({
        chain: CIRCLE_CHAIN,
        transport: modularTransport,
      })

      // ── Smart account (needs a public client for state reads) ────────────
      const { toWebAuthnAccount } = await import('viem/account-abstraction')
      const account = await toCircleSmartAccount({
        // must use the Circle transport: it is what registers the wallet with Circle
        client: createPublicClient({ chain: CIRCLE_CHAIN, transport: modularTransport }),
        owner: toWebAuthnAccount({ credential }),
      })

      _address = account.address

      // ── Bundler + account client (for sending user ops) ──────────────────
      const bundlerWithAccount = createBundlerClient({
        account,
        chain: CIRCLE_CHAIN,
        transport: modularTransport,
      })

      // ── EIP1193Provider wraps the account bundler client ─────────────────
      const sdkProvider = new EIP1193Provider(bundlerWithAccount, plainPublicClient)
      _wrappedProvider = wrapProvider(sdkProvider, plainPublicClient)
      return _wrappedProvider
    }

    return {
      id: CIRCLE_PASSKEY_CONNECTOR_ID,
      name: 'Passkey',
      type: 'circlePasskey' as const,

      async setup() {
        // Attempt silent reconnect from persisted credential
        const stored = loadStoredCredential()
        if (!stored) return
        try {
          const key = import.meta.env.VITE_CLIENT_KEY as string | undefined
          if (!key) return
          _buildPromise = buildProvider(stored)
          await _buildPromise
          config.emitter.emit('change', { accounts: [_address!], chainId: CIRCLE_CHAIN.id })
        } catch {
          clearCredential()
          _buildPromise = null
        }
      },

      async connect(parameters?: { chainId?: number; isReconnecting?: boolean; [key: string]: unknown }) {
        const { username } = (parameters ?? {}) as { username?: string }
        const clientKey = getClientKey()
        const clientUrl = getClientUrl()
        const passkeyTransport = toPasskeyTransport(clientUrl, clientKey)

        // Try login first; if no credential exists, fall back to register.
        const stored = loadStoredCredential()
        let credential: P256Credential

        if (stored) {
          credential = await toWebAuthnCredential({
            transport: passkeyTransport,
            mode: WebAuthnMode.Login,
          })
        } else {
          credential = await toWebAuthnCredential({
            transport: passkeyTransport,
            mode: WebAuthnMode.Register,
            username: toCircleUsername(username),
          })
        }

        saveCredential(credential)
        _buildPromise = buildProvider(credential)
        await _buildPromise

        return {
          accounts: [_address!] as readonly `0x${string}`[],
          chainId: CIRCLE_CHAIN.id,
        }
      },

      async disconnect() {
        _wrappedProvider = null
        _address = null
        _buildPromise = null
        // keep the stored credential: signing out must not turn the next sign-in into a new wallet
      },

      async getAccounts() {
        if (!_address) {
          // May be in the middle of a silent reconnect — wait for it
          if (_buildPromise) {
            try { await _buildPromise } catch { return [] }
          } else {
            const stored = loadStoredCredential()
            if (stored) {
              try {
                const key = import.meta.env.VITE_CLIENT_KEY as string | undefined
                if (!key) return []
                _buildPromise = buildProvider(stored)
                await _buildPromise
              } catch {
                return []
              }
            } else {
              return []
            }
          }
        }
        return _address ? [_address] : []
      },

      async getChainId() {
        return CIRCLE_CHAIN.id
      },

      async getProvider() {
        // If a build is in-flight (e.g. from setup()), await it before returning
        if (!_wrappedProvider && _buildPromise) {
          try { await _buildPromise } catch { /* ignored */ }
        }
        return _wrappedProvider
      },

      async isAuthorized() {
        const stored = loadStoredCredential()
        return stored !== null && !!import.meta.env.VITE_CLIENT_KEY
      },

      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {
        _wrappedProvider = null
        _address = null
        _buildPromise = null
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  })
}
