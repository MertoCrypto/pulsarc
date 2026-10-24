/**
 * Pure helpers that attribute a live transaction to a tracked app and read the USDC it moved.
 * No '@/' imports so plain node (--experimental-strip-types) can run the test.
 */
import type { ArcApp } from '../data/appRegistries.ts'

/** The USDC ERC-20 interface on Arc (same address on both networks). */
export const USDC_TOKEN = '0x3600000000000000000000000000000000000000'

const SELECTOR_TRANSFER = '0xa9059cbb'
const SELECTOR_TRANSFER_FROM = '0x23b872dd'
const WORD_HEX = 64
const SELECTOR_HEX = 10 // "0x" + 8 hex chars

export interface AddressOwner {
  appId: string
  category: string
}

export interface TxLike {
  to: string | null
  value: bigint
  input: string
}

export interface TxClass {
  appId: string | null
  category: string | null
  usdc: number | null
}

/** Lower-cased address → owning app. The first app to claim an address keeps it. */
export function buildAddressIndex(
  apps: Pick<ArcApp, 'id' | 'category' | 'anchors'>[],
): Map<string, AddressOwner> {
  const index = new Map<string, AddressOwner>()
  for (const app of apps) {
    for (const anchor of app.anchors) {
      const key = anchor.address.toLowerCase()
      if (!index.has(key)) index.set(key, { appId: app.id, category: app.category })
    }
  }
  return index
}

/** bigint amount with `decimals` → number, keeping the fraction exact until the last step. */
function scaleDown(amount: bigint, decimals: number): number {
  const unit = 10n ** BigInt(decimals)
  return Number(amount / unit) + Number(amount % unit) / Number(unit)
}

/**
 * USDC moved by a transaction, or null when it moved none we can read.
 *  - transfer / transferFrom calldata sent to the USDC token → decoded uint256, 6 decimals
 *  - calldata for a transfer sent to any other token → null (unknown token, unknown decimals)
 *  - otherwise native value (Arc's native gas token is USDC), 18 decimals
 */
export function usdcOfTx(tx: TxLike): number | null {
  const input = tx.input.toLowerCase()
  const selector = input.slice(0, SELECTOR_HEX)
  const isTransfer = selector === SELECTOR_TRANSFER
  const isTransferFrom = selector === SELECTOR_TRANSFER_FROM

  if (isTransfer || isTransferFrom) {
    if (tx.to?.toLowerCase() !== USDC_TOKEN) return nativeUsdc(tx.value)
    // transfer(to, amount): amount is word 2. transferFrom(from, to, amount): word 3.
    const wordIndex = isTransfer ? 1 : 2
    const start = SELECTOR_HEX + wordIndex * WORD_HEX
    const word = input.slice(start, start + WORD_HEX)
    if (word.length !== WORD_HEX || !/^[0-9a-f]{64}$/.test(word)) return null
    const amount = BigInt(`0x${word}`)
    return amount > 0n ? scaleDown(amount, 6) : null
  }

  return nativeUsdc(tx.value)
}

function nativeUsdc(value: bigint): number | null {
  return value > 0n ? scaleDown(value, 18) : null
}

/**
 * Resolve a plain USDC native send (input '0x' or empty, value > 0, `to` not in the index)
 * to the USDC app's owner by looking up the USDC token address in the index.
 * Returns undefined when no app has that anchor.
 */
function usdcOwner(index: Map<string, AddressOwner>): AddressOwner | undefined {
  return index.get(USDC_TOKEN.toLowerCase())
}

export function classifyTx(tx: TxLike, index: Map<string, AddressOwner>): TxClass {
  const usdc = usdcOfTx(tx)
  const to = tx.to ? tx.to.toLowerCase() : null
  const owner = to ? index.get(to) : undefined
  if (owner) return { appId: owner.appId, category: owner.category, usdc }

  // Plain native USDC send (no contract call) to an address not in the index:
  // input is empty / '0x', value > 0. On Arc the native gas token IS USDC, so
  // attribute these to the USDC app (looked up through the index, not hard-coded).
  const isPlainSend = (tx.input === '' || tx.input === '0x') && tx.value > 0n
  if (isPlainSend) {
    const uo = usdcOwner(index)
    if (uo) return { appId: uo.appId, category: uo.category, usdc }
  }

  return { appId: null, category: null, usdc }
}

/** Percent (0–100) of seen transactions that went to tracked apps; null before any transaction. */
export function trackedShare(counts: { tracked: number; total: number }): number | null {
  if (!(counts.total > 0)) return null
  const share = (counts.tracked / counts.total) * 100
  return Math.min(100, Math.max(0, share))
}
