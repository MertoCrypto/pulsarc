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

// ── Transaction hash validation ───────────────────────────────────────────────

/** Pattern: 0x followed by exactly 64 lowercase or uppercase hex chars. */
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/

/**
 * Returns true when the string is a valid Ethereum transaction hash:
 * 0x prefix + exactly 64 hex characters.
 */
export function isValidTxHash(hash: string): boolean {
  return TX_HASH_RE.test(hash)
}

// ── EVM address validation ────────────────────────────────────────────────────

/** Pattern: 0x + exactly 40 hex chars. Accepts any casing. */
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/**
 * Returns true when the string is a syntactically valid EVM address
 * (0x-prefixed, 40 hex chars). Does NOT enforce EIP-55 checksum casing.
 */
export function isValidAddress(addr: string): boolean {
  return ADDRESS_RE.test(addr)
}

/**
 * Returns true when the address is valid AND non-zero.
 */
export function isValidNonZeroAddress(addr: string): boolean {
  if (!isValidAddress(addr)) return false
  // zero address is all-zeros after 0x
  return !/^0x0{40}$/.test(addr.toLowerCase())
}

// ── Contract constructor argument validators ──────────────────────────────────

export interface ArgValidation {
  ok: boolean
  message: string
}

/**
 * Validate the `treasury_` argument for ArcBoost.
 * Must be a valid non-zero EVM address (case-insensitive hex, no whitespace).
 */
export function validateTreasuryArg(addr: string): ArgValidation {
  const trimmed = addr.trim()
  if (trimmed !== addr) {
    return { ok: false, message: 'Address must not contain leading or trailing whitespace.' }
  }
  if (!isValidAddress(trimmed)) {
    return { ok: false, message: 'Must be a valid 0x-prefixed 40-hex-character address.' }
  }
  if (!isValidNonZeroAddress(trimmed)) {
    return { ok: false, message: 'Treasury address must not be the zero address.' }
  }
  return { ok: true, message: '' }
}

/**
 * Validate a token name or symbol argument (for ArcWatchlistNFT).
 * - Non-empty after trim.
 * - No leading/trailing whitespace.
 * - Max 32 characters.
 * - Only plain printable ASCII (0x20–0x7E).
 */
export function validateTokenStringArg(value: string, fieldName: string): ArgValidation {
  if (value !== value.trim()) {
    return { ok: false, message: `${fieldName} must not have leading or trailing whitespace.` }
  }
  if (value.length === 0) {
    return { ok: false, message: `${fieldName} must not be empty.` }
  }
  if (value.length > 32) {
    return { ok: false, message: `${fieldName} must be at most 32 characters.` }
  }
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) {
      return { ok: false, message: `${fieldName} must contain only plain printable ASCII characters.` }
    }
  }
  return { ok: true, message: '' }
}

// ── localStorage persistence ──────────────────────────────────────────────────

/** One persisted deployment record. */
export interface PersistedDeploy {
  name: string
  address: string
  txHash: string
  chainId: number
  deployer: string
}

/**
 * Build the localStorage key for a given chain ID.
 * Format: "pulsarc:deploys:v1:<chainId>"
 */
export function storageKey(chainId: number): string {
  return `pulsarc:deploys:v1:${chainId}`
}

/**
 * Validate that a raw value (from JSON.parse) looks like a PersistedDeploy.
 * Returns the typed value on success, null on any schema mismatch.
 */
export function validateStoredEntry(v: unknown): PersistedDeploy | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const obj = v as Record<string, unknown>
  if (
    typeof obj.name !== 'string' || obj.name.length === 0 ||
    typeof obj.address !== 'string' ||
    typeof obj.txHash !== 'string' ||
    typeof obj.chainId !== 'number' ||
    typeof obj.deployer !== 'string'
  ) return null
  // Basic format checks
  if (!isValidAddress(obj.address)) return null
  if (!isValidTxHash(obj.txHash)) return null
  if (!Number.isInteger(obj.chainId) || obj.chainId <= 0) return null
  return {
    name: obj.name,
    address: obj.address,
    txHash: obj.txHash,
    chainId: obj.chainId,
    deployer: obj.deployer,
  }
}

/**
 * Parse the raw JSON string from localStorage.
 * Returns an array of valid PersistedDeploy records (malformed entries dropped).
 * Returns [] if the string is missing, empty, or not parseable.
 */
export function parseStoredDeploys(raw: string | null): PersistedDeploy[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item: unknown) => validateStoredEntry(item))
      .filter((item): item is PersistedDeploy => item !== null)
  } catch {
    return []
  }
}

/**
 * Merge a new deploy record into an existing list.
 * If an entry with the same name (case-sensitive) already exists for the same
 * chainId, it is replaced. Otherwise the new entry is appended.
 */
export function mergeDeployRecord(
  existing: PersistedDeploy[],
  incoming: PersistedDeploy,
): PersistedDeploy[] {
  const idx = existing.findIndex(
    e => e.name === incoming.name && e.chainId === incoming.chainId,
  )
  if (idx >= 0) {
    const copy = [...existing]
    copy[idx] = incoming
    return copy
  }
  return [...existing, incoming]
}

/**
 * Remove a deploy entry by name + chainId from the list.
 */
export function removeDeployRecord(
  existing: PersistedDeploy[],
  name: string,
  chainId: number,
): PersistedDeploy[] {
  return existing.filter(e => !(e.name === name && e.chainId === chainId))
}

/**
 * Load all deploy records for a given chain from localStorage.
 * Returns [] on any error (storage blocked, JSON malformed, etc.).
 */
export function loadDeploys(chainId: number): PersistedDeploy[] {
  try {
    const raw = localStorage.getItem(storageKey(chainId))
    return parseStoredDeploys(raw)
  } catch {
    return []
  }
}

/**
 * Save an array of deploy records for a given chain to localStorage.
 * Silently returns false if storage is blocked or unavailable.
 */
export function saveDeploys(chainId: number, records: PersistedDeploy[]): boolean {
  try {
    localStorage.setItem(storageKey(chainId), JSON.stringify(records))
    return true
  } catch {
    return false
  }
}

/**
 * Persist a single new-or-updated deploy record.
 * Loads existing records, merges, and saves.
 */
export function persistDeploy(record: PersistedDeploy): void {
  const existing = loadDeploys(record.chainId)
  const updated = mergeDeployRecord(existing, record)
  saveDeploys(record.chainId, updated)
}

/**
 * Remove a single deploy record (forget).
 * Loads existing records, removes, and saves.
 */
export function forgetDeploy(name: string, chainId: number): void {
  const existing = loadDeploys(chainId)
  const updated = removeDeployRecord(existing, name, chainId)
  saveDeploys(chainId, updated)
}
