/**
 * Pure helpers that combine RPC-live facts and wallet-index data into a
 * WalletSnapshot-compatible row for Arc Mainnet.
 *
 * Rules:
 *   - No `@/` aliases (this file is also imported by the test runner directly).
 *   - No `import.meta` (undefined in Node).
 *   - No ArcScan calls.
 *   - No React.
 */

// ── Types re-declared locally so this file has zero `@/` deps ─────────────────

/** Subset of LiveFacts used here. */
export interface MainnetLiveFacts {
  balanceUsdc: number
  sentTxCount: number
  isContract: boolean
}

/**
 * Packed wallet-index record (subset of WalletRecord from walletIndex.ts).
 * Only the fields this module reads are listed.
 */
export interface MainnetIndexRecord {
  /** Last-active day number (relative to EPOCH_MS = 2026-01-01 UTC) */
  l: number
}

/** EPOCH_MS mirrors walletIndex.ts: day 0 = 2026-01-01 00:00:00 UTC */
const EPOCH_MS = Date.UTC(2026, 0, 1)

function dayToIso(day: number): string {
  return new Date(EPOCH_MS + day * 86_400_000).toISOString()
}

// ── Output type ────────────────────────────────────────────────────────────────

/**
 * Mainnet snapshot row — compatible with the fields Wallets.tsx and
 * WalletProfile.tsx actually consume from WalletSnapshot.
 *
 * Intentionally omits fields that are ArcScan-only:
 *   - txns24h / txns24hCapped: UNKNOWN on mainnet; left undefined
 *   - transferCount: not available from RPC or index; left undefined
 */
export interface MainnetWalletSnapshot {
  address: string
  /** Native USDC balance (from RPC getBalance, 18-dec). */
  balance: number
  /** True when getCode returned bytecode. */
  isContract: boolean
  /**
   * null — index does not carry a name field; callers fall back to label.
   * Kept for interface compatibility with WalletSnapshot.
   */
  name: null
  /**
   * Number of transactions SENT from this address (= nonce from RPC).
   * This is NOT the total transaction count (sent + received).
   */
  txCount: number
  /**
   * ISO-8601 timestamp of the last active day from the wallet index, or null
   * when the address is not in the index.
   */
  lastActive: string | null
  /**
   * Always undefined on mainnet — 24-hour transaction data requires ArcScan.
   * Callers must hide any UI column/card that depends on this field.
   */
  txns24h: undefined
  /** Always undefined — see txns24h. */
  txns24hCapped: undefined
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Merge RPC live facts with an optional index record into a MainnetWalletSnapshot.
 *
 * @param address   - The wallet address (checksummed or lowercase; stored as-is).
 * @param live      - Output of toLiveFacts(); null when the RPC call failed or
 *                    returned malformed data.
 * @param record    - Wallet-index record, or null when the address is not indexed.
 * @returns         A MainnetWalletSnapshot, or null when `live` is null (we need
 *                  at least the RPC data to produce a useful row).
 */
export function toMainnetSnapshot(
  address: string,
  live: MainnetLiveFacts | null,
  record: MainnetIndexRecord | null,
): MainnetWalletSnapshot | null {
  if (live === null) return null

  return {
    address,
    balance: live.balanceUsdc,
    isContract: live.isContract,
    name: null,
    txCount: live.sentTxCount,
    lastActive: record !== null ? dayToIso(record.l) : null,
    txns24h: undefined,
    txns24hCapped: undefined,
  }
}
