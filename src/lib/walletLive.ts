/**
 * Pure helpers for the "live on-chain facts" panel of a wallet checker.
 * Accepts the raw outputs of three viem JSON-RPC calls:
 *   getBalance        -> bigint (wei, 18 decimals; on Arc, native gas IS USDC)
 *   getTransactionCount -> number (nonce / sent-tx count)
 *   getCode           -> `0x${string}` | undefined
 *
 * No network calls, no React, no `any`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveFacts {
  /** Native balance in USDC units (Arc: native gas === USDC). */
  balanceUsdc: number
  /** Number of transactions sent from this address (nonce). */
  sentTxCount: number
  /** True when the address holds contract bytecode. */
  isContract: boolean
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const WEI_PER_USDC = 10n ** 18n

/**
 * Convert a wei bigint to a USDC float (18-decimal native token).
 *
 * Strategy: compute the whole-number part with bigint division (exact),
 * then compute the fractional part by converting the remainder bigint to a
 * number string and padding/trimming to 6 decimal places.  Combining the two
 * halves as a Number string preserves up to 6 significant fractional digits
 * without floating-point errors in the integer part for any realistic balance.
 * Very large balances (> Number.MAX_SAFE_INTEGER whole USDC) are represented
 * with the best precision JavaScript Number affords; that is documented here
 * and is acceptable for display purposes.
 */
function weiToUsdc(wei: bigint): number {
  const whole = wei / WEI_PER_USDC
  const remainder = wei % WEI_PER_USDC // always 0 <= r < 1e18

  // Build a 18-digit fractional string, then keep only 6 digits (truncate).
  const fracStr = remainder.toString().padStart(18, '0').slice(0, 6)
  return Number(`${whole.toString()}.${fracStr}`)
}

/** Parse a 0x-prefixed hex string to bigint; returns null on invalid input. */
function hexToBigInt(hex: string): bigint | null {
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) return null
  try {
    return BigInt(hex)
  } catch {
    return null
  }
}

/** Parse a 0x-prefixed hex string to a safe integer; returns null on invalid input. */
function hexToSafeInt(hex: string): number | null {
  const b = hexToBigInt(hex)
  if (b === null) return null
  if (b > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(b)
}

// ---------------------------------------------------------------------------
// toLiveFacts
// ---------------------------------------------------------------------------

/**
 * Convert the raw viem results of getBalance / getTransactionCount / getCode
 * into a typed LiveFacts object, or return null when any input is malformed.
 *
 * Accepted shapes:
 *   balance  — bigint >= 0  OR  0x-hex string representing a non-negative integer
 *   nonce    — non-negative safe-integer number  OR  bigint <= MAX_SAFE_INTEGER  OR  0x-hex string
 *   code     — undefined | null | '' | '0x' | '0x0' -> isContract: false
 *              any other 0x-hex string with >= 1 byte of data   -> isContract: true
 *
 * Returns null for any malformed input (wrong type, negative, NaN, non-hex,
 * nonce above Number.MAX_SAFE_INTEGER, etc.).
 */
export function toLiveFacts(input: { balance: unknown; nonce: unknown; code: unknown }): LiveFacts | null {
  // ---- balance ----
  let balanceWei: bigint
  if (typeof input.balance === 'bigint') {
    if (input.balance < 0n) return null
    balanceWei = input.balance
  } else if (typeof input.balance === 'string') {
    const b = hexToBigInt(input.balance)
    if (b === null || b < 0n) return null
    balanceWei = b
  } else {
    return null
  }

  // ---- nonce ----
  let sentTxCount: number
  if (typeof input.nonce === 'number') {
    if (!Number.isInteger(input.nonce) || input.nonce < 0 || !Number.isSafeInteger(input.nonce)) return null
    sentTxCount = input.nonce
  } else if (typeof input.nonce === 'bigint') {
    if (input.nonce < 0n) return null
    if (input.nonce > BigInt(Number.MAX_SAFE_INTEGER)) return null
    sentTxCount = Number(input.nonce)
  } else if (typeof input.nonce === 'string') {
    const n = hexToSafeInt(input.nonce)
    if (n === null) return null
    sentTxCount = n
  } else {
    return null
  }

  // ---- code ----
  let isContract: boolean
  const code = input.code
  if (code === undefined || code === null || code === '' || code === '0x' || code === '0x0') {
    isContract = false
  } else if (typeof code === 'string') {
    // Must be a valid 0x-hex string with at least 1 byte (i.e. length > 2 and even length after 0x).
    if (!/^0x[0-9a-fA-F]+$/.test(code)) return null
    // '0x' prefix (2 chars) + at least 2 hex chars (1 byte)
    const hexBody = code.slice(2)
    if (hexBody.length < 2 || hexBody.length % 2 !== 0) return null
    isContract = true
  } else {
    return null
  }

  return {
    balanceUsdc: weiToUsdc(balanceWei),
    sentTxCount,
    isContract,
  }
}

// ---------------------------------------------------------------------------
// formatLiveBalance
// ---------------------------------------------------------------------------

/**
 * Format a USDC balance number for display (en-US locale):
 *  - 0               -> '0'
 *  - tiny (0 < n < 0.000001) -> '< 0.000001'
 *  - n < 1           -> up to 6 significant fractional digits (e.g. '0.000123')
 *  - n >= 1          -> en-US grouping + 2 fixed decimals (e.g. '1,234.57')
 */
export function formatLiveBalance(n: number): string {
  if (n === 0) return '0'
  if (n < 0) {
    // Negative balances are not meaningful on-chain; format as-is with grouping.
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (n < 0.000001) return '< 0.000001'
  if (n < 1) {
    // Up to 6 significant fractional digits.
    // toPrecision gives significant figures; trim trailing zeros.
    const s = n.toPrecision(6)
    // Remove trailing zeros after decimal point but keep at least one digit.
    return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  }
  // n >= 1: en-US grouping, 2 fixed decimals.
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------------
// liveKind
// ---------------------------------------------------------------------------

/** Returns 'contract' when bytecode is present, 'wallet' otherwise. */
export function liveKind(f: LiveFacts): 'contract' | 'wallet' {
  return f.isContract ? 'contract' : 'wallet'
}
