import type { createPublicClient } from 'viem'
import type { EIP1193Provider } from '@circle-fin/modular-wallets-core'

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
export function wrapProvider(sdkProvider: InstanceType<typeof EIP1193Provider>, plainPublicClient: ReturnType<typeof createPublicClient>) {
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

export type WrappedProvider = ReturnType<typeof wrapProvider>
