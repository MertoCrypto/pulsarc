/**
 * Pure logic for LocalDeploy — no React, no DOM, no wagmi.
 * Safe for plain Node: node --experimental-strip-types src/lib/localDeployCore.ts
 */

// ── Fee formatting ────────────────────────────────────────────────────────────

const FMT_EN = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
})

/**
 * Format a fee expressed as a raw bigint gas estimate x gasPrice into a
 * human-readable string using the chain's native currency decimals.
 *
 * Rules:
 * - nativeDecimals must be a positive integer; if not, returns 'unknown'.
 * - If either gasEstimate or gasPrice is 0n the result is '0.00 USDC'.
 * - Formats with en-US locale, 2–8 decimal places.
 * - Never uses 18 as a hardcoded fallback — callers must pass the real
 *   value from the chain config, or pass null to get 'unknown'.
 */
export function formatFeeEstimate(
  gasEstimate: bigint,
  gasPrice: bigint,
  nativeDecimals: number | null,
): string {
  if (nativeDecimals === null || !Number.isInteger(nativeDecimals) || nativeDecimals < 0) {
    return 'unknown'
  }
  const raw = gasEstimate * gasPrice
  if (raw === 0n) return '0.00 USDC'
  const divisor = 10n ** BigInt(nativeDecimals)
  const whole = raw / divisor
  const frac = raw % divisor
  // Build decimal number as string without floating point rounding
  const fracStr = frac.toString().padStart(nativeDecimals, '0').slice(0, 8)
  const numericStr = `${whole.toString()}.${fracStr}`
  const numeric = Number(numericStr)
  if (!isFinite(numeric)) return 'unknown'
  return `${FMT_EN.format(numeric)} USDC`
}

// ── Bytecode size ─────────────────────────────────────────────────────────────

/**
 * Return the deployed bytecode size in bytes for a 0x-prefixed hex bytecode
 * string. Strips the 0x prefix before counting.
 */
export function bytecodeSizeBytes(bytecode: string): number {
  const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode
  return Math.floor(hex.length / 2)
}

// ── Address normalisation ─────────────────────────────────────────────────────

/**
 * Case-insensitive equality check for two Ethereum addresses.
 * Returns false if either argument is empty / falsy.
 */
export function addressesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

// ── Owner mismatch detection ──────────────────────────────────────────────────

/**
 * Returns a human-readable warning when the intended owner does not match
 * the connected wallet, or null when they match.
 *
 * Comparison is case-insensitive.
 */
export function ownerMismatchWarning(
  intendedOwner: string,
  connectedAddress: string,
): string | null {
  if (!intendedOwner || !connectedAddress) return null
  if (addressesMatch(intendedOwner, connectedAddress)) return null
  return `Warning: intended owner (${intendedOwner}) differs from the connected wallet (${connectedAddress}). The connected wallet will deploy the contract but will NOT be its owner.`
}

// ── Post-deploy verification decisions ───────────────────────────────────────

export interface VerifyCodeResult {
  ok: boolean
  message: string
}

/** Decide whether the getCode check passed. */
export function verifyCodeResult(code: string | undefined): VerifyCodeResult {
  const ok = typeof code === 'string' && code !== '0x' && code.length > 2
  return {
    ok,
    message: ok ? 'Contract code confirmed on-chain.' : 'No contract code found at the deployed address.',
  }
}

export interface VerifyOwnerResult {
  ok: boolean
  message: string
}

/**
 * Decide whether the on-chain owner matches the expected owner.
 * Comparison is case-insensitive.
 */
export function verifyOwnerResult(
  onchainOwner: string | undefined,
  expectedOwner: string,
): VerifyOwnerResult {
  if (!onchainOwner) {
    return { ok: false, message: 'Could not read owner() from the deployed contract.' }
  }
  const ok = addressesMatch(onchainOwner, expectedOwner)
  return {
    ok,
    message: ok
      ? `owner() matches expected address (${expectedOwner}).`
      : `owner() mismatch: got ${onchainOwner}, expected ${expectedOwner}.`,
  }
}

export interface VerifyFromResult {
  ok: boolean
  message: string
}

/**
 * Confirm that the deployer (tx.from) matches the connected wallet.
 * Comparison is case-insensitive.
 */
export function verifyFromResult(
  txFrom: string | undefined,
  connectedAddress: string,
): VerifyFromResult {
  if (!txFrom) {
    return { ok: false, message: 'Could not read tx.from from the transaction receipt.' }
  }
  const ok = addressesMatch(txFrom, connectedAddress)
  return {
    ok,
    message: ok
      ? `Transaction sent from the connected wallet (${connectedAddress}).`
      : `Deployer mismatch: tx.from is ${txFrom}, expected ${connectedAddress}.`,
  }
}
