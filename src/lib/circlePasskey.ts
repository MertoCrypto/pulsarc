/**
 * Circle Modular Wallets — passkey connector for Pulsarc.
 *
 * Arc Testnet configuration.  To switch to mainnet, change the two constants
 * CIRCLE_CHAIN_PATH and CIRCLE_CHAIN below (one-line change each).
 */

import { createPublicClient } from 'viem'
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
import type { P256Credential } from '@circle-fin/modular-wallets-core'

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

// ─── Connector ID ──────────────────────────────────────────────────────────
export const CIRCLE_PASSKEY_CONNECTOR_ID = 'circlePasskey'

/**
 * Creates a wagmi connector that authenticates via Circle Modular Wallets
 * (passkey / WebAuthn) and exposes the smart account through EIP-1193 so
 * wagmi hooks (useAccount, useWriteContract, etc.) work without modification.
 *
 * The connector is only useful when VITE_CLIENT_KEY is set.  If it is absent,
 * the connector exists but connect() will throw, allowing the UI to hide the
 * passkey option gracefully.
 */
export function circlePasskeyConnector() {
  return createConnector((config) => {
    let _provider: InstanceType<typeof EIP1193Provider> | null = null
    let _address: `0x${string}` | null = null

    function getClientKey(): string {
      const key = import.meta.env.VITE_CLIENT_KEY as string | undefined
      if (!key) throw new Error('VITE_CLIENT_KEY is not set')
      return key
    }

    function getClientUrl(): string {
      return (import.meta.env.VITE_CLIENT_URL as string | undefined) ||
        'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
    }

    async function buildProvider(credential: P256Credential) {
      const clientKey = getClientKey()
      const clientUrl = getClientUrl()

      const modularTransport = toModularTransport(
        `${clientUrl}${CIRCLE_CHAIN_PATH}`,
        clientKey,
      )

      const publicClient = createPublicClient({
        chain: CIRCLE_CHAIN,
        transport: modularTransport,
      })

      const bundlerClient = createBundlerClient({
        chain: CIRCLE_CHAIN,
        transport: modularTransport,
      })

      const { toWebAuthnAccount } = await import('viem/account-abstraction')
      const account = await toCircleSmartAccount({
        client: publicClient,
        owner: toWebAuthnAccount({ credential }) as Parameters<typeof toCircleSmartAccount>[0]['owner'],
      })

      _address = account.address

      const bundlerWithAccount = createBundlerClient({
        account,
        chain: CIRCLE_CHAIN,
        transport: modularTransport,
      })

      _provider = new EIP1193Provider(bundlerWithAccount, publicClient)
      return _provider
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
          await buildProvider(stored)
          config.emitter.emit('change', { accounts: [_address!], chainId: CIRCLE_CHAIN.id })
        } catch {
          clearCredential()
        }
      },

      async connect({ username }: { username?: string } = {}) {
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
            username: username ?? 'Pulsarc user',
          })
        }

        saveCredential(credential)
        await buildProvider(credential)

        return {
          accounts: [_address!],
          chainId: CIRCLE_CHAIN.id,
        }
      },

      async disconnect() {
        _provider = null
        _address = null
        clearCredential()
      },

      async getAccounts() {
        if (!_address) {
          const stored = loadStoredCredential()
          if (stored) {
            try {
              const key = import.meta.env.VITE_CLIENT_KEY as string | undefined
              if (!key) return []
              await buildProvider(stored)
            } catch {
              return []
            }
          } else {
            return []
          }
        }
        return _address ? [_address] : []
      },

      async getChainId() {
        return CIRCLE_CHAIN.id
      },

      async getProvider() {
        return _provider
      },

      async isAuthorized() {
        const stored = loadStoredCredential()
        return stored !== null && !!import.meta.env.VITE_CLIENT_KEY
      },

      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {
        clearCredential()
        _provider = null
        _address = null
      },
    }
  })
}
