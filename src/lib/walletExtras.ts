/**
 * Pure helpers for Pulsarc's WalletExtras panel.
 * No React, no network. Safe to run under:
 *   node --experimental-strip-types src/lib/walletExtras.ts
 */

// ── checklist ─────────────────────────────────────────────────────────────────

/**
 * Returns every tracked app (in config order) with a flag indicating whether
 * the wallet used it.
 */
export function checklist(
  usedAppIds: string[],
  apps: { id: string }[],
): { id: string; used: boolean }[] {
  const usedSet = new Set(usedAppIds)
  return apps.map(app => ({ id: app.id, used: usedSet.has(app.id) }))
}

// ── agentsOwnedBy ─────────────────────────────────────────────────────────────

/**
 * Returns agents whose owner matches `address` (case-insensitive), sorted
 * ascending by id. Only id and name are returned.
 */
export function agentsOwnedBy(
  address: string,
  agents: { id: number; owner: string; name?: string }[],
): { id: number; name?: string }[] {
  const lower = address.toLowerCase()
  return agents
    .filter(a => a.owner.toLowerCase() === lower)
    .sort((a, b) => a.id - b.id)
    .map(a => ({ id: a.id, ...(a.name !== undefined && { name: a.name }) }))
}

// ── formatBalance ─────────────────────────────────────────────────────────────

/**
 * Format a raw ERC-20 balance (bigint) with exact bigint arithmetic.
 * Locale: en-US, grouped thousands.
 * Uses 2 decimal places for values >= 1, 6 decimal places for 0 < value < 1.
 * Returns "0.00" for zero.
 * Never calls toLocaleString() without arguments.
 * Never converts to float — avoids rounding for large values.
 */
export function formatBalance(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0.00'

  // Work with absolute value; handle sign separately (ERC-20 balances are
  // always non-negative, but handle gracefully).
  const negative = raw < 0n
  const abs = negative ? -raw : raw

  const scale = 10n ** BigInt(decimals)

  const intPart = abs / scale
  const fracPart = abs % scale

  // Decide display precision: 6 dp when 0 < value < 1, otherwise 2 dp.
  const isLessThanOne = intPart === 0n && fracPart > 0n
  const displayDp = isLessThanOne ? 6 : 2

  // Build fractional string padded to `decimals` places, then trim to displayDp.
  const fracStr = fracPart.toString().padStart(decimals, '0').slice(0, displayDp)

  // Format integer part with thousands separators using Intl (locale-aware, with
  // explicit locale so it is deterministic).
  const intStr = new Intl.NumberFormat('en-US').format(intPart)

  const result = `${intStr}.${fracStr}`
  return negative ? `-${result}` : result
}

// ── XML escaping ──────────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── shareCardSvg ──────────────────────────────────────────────────────────────

export interface ShareCardOpts {
  address: string
  net: 'mainnet' | 'testnet'
  firstSeen: string
  activeDays: number
  tx: number
  usdcSent: number
  usdcReceived: number
  appsUsed: number
  appsTracked: number
  coverage: string
}

/**
 * Returns a self-contained SVG string (720×380) suitable for sharing.
 * All dynamic strings are XML-escaped. No external resources.
 */
export function shareCardSvg(opts: ShareCardOpts): string {
  const {
    address,
    net,
    firstSeen,
    activeDays,
    tx,
    usdcSent,
    usdcReceived,
    appsUsed,
    appsTracked,
    coverage,
  } = opts

  // Shorten address: 0x1234…abcd (6 chars prefix + 4 chars suffix)
  const shortAddr =
    address.length >= 10
      ? `${address.slice(0, 6)}\u2026${address.slice(-4)}`
      : address
  const safeAddr = xmlEscape(shortAddr)
  const safeNet = xmlEscape(`Arc ${net === 'mainnet' ? 'Mainnet' : 'Testnet'} \u00B7 Pulsarc wallet check`)
  const safeFirstSeen = xmlEscape(firstSeen)
  const safeCoverage = xmlEscape(coverage)

  const usdcSentFmt = xmlEscape(
    usdcSent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  )
  const usdcRecvFmt = xmlEscape(
    usdcReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  )
  const txFmt = xmlEscape(tx.toLocaleString('en-US'))
  const activeDaysFmt = xmlEscape(activeDays.toLocaleString('en-US'))
  const appsFmt = xmlEscape(`${appsUsed} of ${appsTracked}`)

  // Layout constants
  const W = 720
  const H = 380
  const BG = '#0b1a30'
  const TEXT = '#eaf1fb'
  const ACCENT = '#a9c4ea'
  const MUTED = '#6b8aad'
  const FONT = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

  // Row definitions: [label, value]
  const rows: [string, string][] = [
    ['First seen', safeFirstSeen],
    ['Active days', activeDaysFmt],
    ['Transactions sent', txFmt],
    ['USDC sent', `$${usdcSentFmt}`],
    ['USDC received', `$${usdcRecvFmt}`],
    ['Apps used', appsFmt],
  ]

  const rowStartY = 165
  const rowH = 32
  const colLabelX = 60
  const colValueX = 380

  const rowsSvg = rows
    .map(([label, value], i) => {
      const y = rowStartY + i * rowH
      return (
        `<text x="${colLabelX}" y="${y}" font-family="${FONT}" font-size="13" fill="${MUTED}">${xmlEscape(label)}</text>` +
        `<text x="${colValueX}" y="${y}" font-family="${FONT}" font-size="13" fill="${TEXT}" text-anchor="end">${value}</text>`
      )
    })
    .join('\n  ')

  const DISCLAIMER = 'pulsarc.vercel.app \u00B7 independent project, not affiliated with Circle or Arc'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- background -->
  <rect width="${W}" height="${H}" fill="${BG}" rx="16" ry="16"/>

  <!-- top accent line -->
  <rect x="60" y="40" width="120" height="3" fill="${ACCENT}" rx="1"/>

  <!-- address -->
  <text x="60" y="90" font-family="${FONT}" font-size="26" font-weight="300" fill="${TEXT}" letter-spacing="-0.5">${safeAddr}</text>

  <!-- subtitle -->
  <text x="60" y="118" font-family="${FONT}" font-size="13" fill="${ACCENT}">${safeNet}</text>

  <!-- divider -->
  <line x1="60" y1="140" x2="${W - 60}" y2="140" stroke="${ACCENT}" stroke-opacity="0.25" stroke-width="1"/>

  <!-- data rows -->
  ${rowsSvg}

  <!-- coverage note -->
  <text x="60" y="${rowStartY + rows.length * rowH + 18}" font-family="${FONT}" font-size="11" fill="${MUTED}">${safeCoverage}</text>

  <!-- footer divider -->
  <line x1="60" y1="${H - 44}" x2="${W - 60}" y2="${H - 44}" stroke="${ACCENT}" stroke-opacity="0.18" stroke-width="1"/>

  <!-- footer -->
  <text x="${W / 2}" y="${H - 22}" font-family="${FONT}" font-size="11" fill="${MUTED}" text-anchor="middle">${xmlEscape(DISCLAIMER)}</text>
</svg>`
}
