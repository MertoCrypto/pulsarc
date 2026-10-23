/**
 * Pure gas-report helpers for Pulsarc wallet pages.
 * No network calls, no React, no `any`.
 * All amounts are in USDC (the native gas token on Arc).
 */

// Import compact via the relative path so this module is also testable under
// plain `node --experimental-strip-types` (the @/ alias is Vite-only).
// The app's '@/lib/arcscan' re-exports compact from this same file, so the
// runtime behaviour is identical.
import { compact } from './numberFormat.ts'

// ── External type shapes (inlined to avoid @/ alias issues in test environments) ──
// These mirror the relevant fields of WalletSummary and LiveFacts from the project
// libs; if those interfaces change, update here too.

/** Subset of WalletSummary used by gasReport. */
export interface GasReportSummaryInput {
  tx: number
  failed: number
  feesUsdc: number
  usdcSent: number
  usdcReceived: number
  activeDays: number
  partial: boolean
}

/** Subset of LiveFacts used by gasReport. */
export interface GasReportLiveInput {
  sentTxCount: number
}

// ── GasReport ─────────────────────────────────────────────────────────────────

export interface GasReport {
  /** Total USDC fees paid. */
  fees: number
  /** Total transactions sent (from the index). */
  sent: number
  /** Successful (non-reverted) transactions: sent − reverted. */
  ok: number
  /** Reverted (failed) transactions: min(failed, tx), clamped ≥ 0. */
  reverted: number
  /** reverted / sent, or null when sent === 0. */
  revertedShare: number | null
  /** Average USDC fee per sent transaction, or null when sent === 0. */
  avgFee: number | null
  /** Average USDC fee per active day, or null when activeDays === 0. */
  feePerActiveDay: number | null
  /** usdcReceived − usdcSent. */
  netUsdc: number
  /** 'in' when net > 0.005, 'out' when net < −0.005, else 'flat'. */
  direction: 'in' | 'out' | 'flat'
  /** True when the index only covers a partial (live-indexed) period. */
  partial: boolean
  /**
   * Transactions the live node has seen that the index has not counted yet
   * (e.g. today's transactions). null when live is not supplied.
   * = max(0, live.sentTxCount − sent)
   */
  nonceAhead: number | null
}

// ── safe number helper ─────────────────────────────────────────────────────────

/** Treat negative, NaN, or non-finite inputs as 0. */
function safe(n: number): number {
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ── gasReport ─────────────────────────────────────────────────────────────────

export function gasReport(
  summary: GasReportSummaryInput,
  live?: GasReportLiveInput | null,
): GasReport {
  const fees = safe(summary.feesUsdc)
  const sent = safe(summary.tx)
  const failed = safe(summary.failed)

  // Clamp: failed can never exceed sent (defensive against inconsistent index data).
  const reverted = Math.min(failed, sent)
  const ok = sent - reverted

  const revertedShare = sent > 0 ? reverted / sent : null
  const avgFee = sent > 0 ? fees / sent : null

  const activeDays = safe(summary.activeDays)
  const feePerActiveDay = activeDays > 0 ? fees / activeDays : null

  const usdcSent = safe(summary.usdcSent)
  const usdcReceived = safe(summary.usdcReceived)
  const netUsdc = usdcReceived - usdcSent

  const direction: GasReport['direction'] =
    netUsdc > 0.005 ? 'in' : netUsdc < -0.005 ? 'out' : 'flat'

  let nonceAhead: number | null = null
  if (live != null) {
    const liveCount = safe(live.sentTxCount)
    nonceAhead = Math.max(0, liveCount - sent)
  }

  return {
    fees,
    sent,
    ok,
    reverted,
    revertedShare,
    avgFee,
    feePerActiveDay,
    netUsdc,
    direction,
    partial: summary.partial,
    nonceAhead,
  }
}

// ── formatGasUsd ──────────────────────────────────────────────────────────────

/**
 * Format a USDC fee amount as a dollar string (en-US locale).
 *
 * Bands:
 *  - 0            → '$0'
 *  - 0 < n < 0.01 → 3 significant figures, e.g. '$0.000420'
 *                   (uses toPrecision(3) then prepends '$')
 *  - 0.01 ≤ |n| < 1 → up to 4 decimals, trailing zeros trimmed,
 *                       e.g. '$0.0185', '$0.0691'
 *  - 1 ≤ |n| < 1000 → exactly 2 decimal places, e.g. '$307.80', '$12.40'
 *  - n ≥ 1000     → compact notation from '@/lib/arcscan' with '$' prefix,
 *                   e.g. '$1.23K'
 */
export function formatGasUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0'

  const abs = Math.abs(n)

  if (abs < 0.01) {
    // 3 significant figures: toPrecision(3) gives e.g. '0.000420'
    return `$${n.toPrecision(3)}`
  }

  if (abs < 1) {
    // 0.01 ≤ |n| < 1: up to 4 decimal places, trailing zeros trimmed.
    const raw = n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
    return `$${raw}`
  }

  if (abs < 1000) {
    // 1 ≤ |n| < 1000: exactly 2 decimal places (e.g. $307.80, $12.40).
    const raw = n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `$${raw}`
  }

  // ≥ 1000: compact (K/M/B/T)
  return `$${compact(n, 2)}`
}
