/**
 * Pure helpers for the "Activity mix", "Money flow", and "Bridge" sections on the Network page.
 * No React, no network calls — safe for plain Node (--experimental-strip-types).
 * Numbers and dates are always formatted with the fixed locale 'en-US'.
 */

// ── CCTP domain names — single source of truth is bridgeFlow.ts ──────────────
import { domainName as resolveDomainName } from './bridgeFlow.ts'

// ── Types exported for use in hooks / pages ───────────────────────────────────

export interface AutoField {
  senders: number
  tx: number
}

export interface MbField {
  usdc?: [number, number]   // [minted, burned]
  eurc?: [number, number]
}

export interface BridgeWindowField {
  out: [number, number, number]   // [count, usdc, fees]
  /** Old shape: [count]. New shape: [count, usdc, fees]. A window may have in.length === 1. */
  in: [number] | [number, number, number]
  byDomain: Record<string, [number, number]>  // destDomain -> [count, usdc]
  /** New field: sourceDomain -> [count, usdc]. Key "-1" = unknown source. */
  byDomainIn?: Record<string, [number, number]>
}

/** Window shape from latest.json (extended with optional new fields). */
export interface ExtendedWindow {
  hours: number
  txs: number
  failed: number
  fees: number
  blocks: number
  walletHours: number
  top: unknown[]
  // New optional fields:
  auto?: AutoField
  autoCoverageHours?: number
  aa?: number
  aaTx?: number
  buckets?: [[number, number], [number, number], [number, number]]
  bucketsCoverageHours?: number
  big?: Array<{ tx: string; amt: number; from: string; to: string }>
  mb?: MbField
  mbCoverageHours?: number
  bridge?: BridgeWindowField
  bridgeCoverageHours?: number
}

export interface SeriesPointMin {
  hour: string
  txs: number
}

// ── Supply / bridge JSON shapes ───────────────────────────────────────────────

export interface SupplySeriesPoint {
  hour: string
  supply: number
  mint?: number
  burn?: number
}

export interface TokenSupply {
  supply: number
  series: SupplySeriesPoint[]
}

export interface SupplyJson {
  generatedAt: string
  network: string
  tokens: {
    usdc: TokenSupply
    eurc: TokenSupply
  }
}

export interface BridgeSeriesPoint {
  hour: string
  outCount: number
  outUsdc: number
  inCount: number
}

export interface BridgeWindowJson {
  out: [number, number, number]
  in: [number] | [number, number, number]
  byDomain: Record<string, [number, number]>
  byDomainIn?: Record<string, [number, number]>
}

export interface BridgeJson {
  generatedAt: string
  network: string
  windows: Record<'1h' | '24h' | '7d', BridgeWindowJson>
  series: BridgeSeriesPoint[]
}

// ── coverageNote ──────────────────────────────────────────────────────────────

/**
 * Returns a human-readable note when N < hours (partial coverage).
 * Returns null when N === hours (full coverage) or N === 0 (nothing to show — caller skips).
 */
export function coverageNote(n: number, hours: number): string | null {
  if (n <= 0) return null
  if (n >= hours) return null
  return `last ${n.toLocaleString('en-US')} of ${hours.toLocaleString('en-US')} hours`
}

// ── Helper: sum txs of the last N series points ───────────────────────────────

function lastNTxs(series: SeriesPointMin[], n: number): number {
  const slice = series.slice(-n)
  return slice.reduce((s, p) => s + p.txs, 0)
}

// ── automatedShare ────────────────────────────────────────────────────────────

export interface AutomatedShare {
  /** Share of txs (0-1) */
  share: number
  /** Number of automated senders */
  senders: number
  /** Automated tx count */
  tx: number
  /** Coverage note or null (full coverage) */
  note: string | null
  /** Number of hours the coverage spans */
  coverageHours: number
}

export function automatedShare(
  window: ExtendedWindow,
  series: SeriesPointMin[],
): AutomatedShare | null {
  const auto = window.auto
  const n = window.autoCoverageHours
  if (!auto || typeof n !== 'number' || n <= 0) return null
  const baseTxs = lastNTxs(series, n)
  if (baseTxs === 0) return null
  return {
    share: auto.tx / baseTxs,
    senders: auto.senders,
    tx: auto.tx,
    note: coverageNote(n, window.hours),
    coverageHours: n,
  }
}

// ── smartAccountShare ─────────────────────────────────────────────────────────

export interface SmartAccountShare {
  /** Share of txs (0-1) */
  share: number
  /** Number of ERC-4337 user operations */
  aa: number
  /** Coverage note or null */
  note: string | null
  coverageHours: number
}

export function smartAccountShare(
  window: ExtendedWindow,
  series: SeriesPointMin[],
): SmartAccountShare | null {
  // aa / aaTx are per-series-point-last; coverageHours tells us the span
  // In the sample both aa and aaTx are present at the window level;
  // the task says "aa (ERC-4337 user operations)" and "aaTx" for the count
  const aa = window.aa
  const aaTx = window.aaTx
  if (typeof aa !== 'number' || typeof aaTx !== 'number') return null
  // autoCoverageHours is the only coverage field we have for aa as well
  // (the spec bundles them together in the same indexer pass)
  const n = window.autoCoverageHours
  if (typeof n !== 'number' || n <= 0) return null
  const baseTxs = lastNTxs(series, n)
  if (baseTxs === 0) return null
  return {
    share: aaTx / baseTxs,
    aa,
    note: coverageNote(n, window.hours),
    coverageHours: n,
  }
}

// ── paymentBuckets ────────────────────────────────────────────────────────────

export interface PaymentBucket {
  label: string
  count: number
  usdcVolume: number
  /** Share of total count (0-1); null if total is 0 */
  countShare: number | null
  /** Share of total volume (0-1); null if total is 0 */
  volumeShare: number | null
}

export interface PaymentBuckets {
  buckets: PaymentBucket[]
  totalCount: number
  totalVolume: number
  note: string | null
  coverageHours: number
}

const BUCKET_LABELS = ['< $250', '$250 – $10k', '> $10k']

export function paymentBuckets(window: ExtendedWindow): PaymentBuckets | null {
  const raw = window.buckets
  const n = window.bucketsCoverageHours
  if (!Array.isArray(raw) || raw.length !== 3) return null
  if (typeof n !== 'number' || n <= 0) return null

  const totalCount = raw.reduce((s, b) => s + b[0], 0)
  const totalVolume = raw.reduce((s, b) => s + b[1], 0)

  return {
    buckets: raw.map((b, i) => ({
      label: BUCKET_LABELS[i],
      count: b[0],
      usdcVolume: b[1],
      countShare: totalCount > 0 ? b[0] / totalCount : null,
      volumeShare: totalVolume > 0 ? b[1] / totalVolume : null,
    })),
    totalCount,
    totalVolume,
    note: coverageNote(n, window.hours),
    coverageHours: n,
  }
}

// ── bigTransfers ──────────────────────────────────────────────────────────────

export interface BigTransfer {
  tx: string
  amt: number
  from: string
  to: string
}

const TX_RE = /^0x[0-9a-fA-F]{64}$/
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/

export function bigTransfers(
  window: ExtendedWindow,
  limit = 10,
): BigTransfer[] | null {
  const raw = window.big
  if (!Array.isArray(raw) || raw.length === 0) return null

  const valid = raw
    .filter(
      (t) =>
        typeof t === 'object' &&
        t !== null &&
        TX_RE.test(t.tx) &&
        ADDR_RE.test(t.from) &&
        ADDR_RE.test(t.to) &&
        typeof t.amt === 'number' &&
        isFinite(t.amt),
    )
    .sort((a, b) => b.amt - a.amt)
    .slice(0, limit)

  return valid.length > 0 ? valid : null
}

// ── mintBurn ──────────────────────────────────────────────────────────────────

export interface MintBurnResult {
  usdcMinted: number
  usdcBurned: number
  usdcNet: number
  eurcMinted: number | null
  eurcBurned: number | null
  eurcNet: number | null
  note: string | null
  coverageHours: number
}

export function mintBurn(window: ExtendedWindow): MintBurnResult | null {
  const mb = window.mb
  const n = window.mbCoverageHours
  if (!mb || typeof n !== 'number' || n <= 0) return null

  let usdcMinted = 0, usdcBurned = 0
  if (Array.isArray(mb.usdc) && mb.usdc.length === 2) {
    usdcMinted = mb.usdc[0]
    usdcBurned = mb.usdc[1]
  } else if (mb.usdc !== undefined) {
    return null
  }

  let eurcMinted: number | null = null
  let eurcBurned: number | null = null
  if (Array.isArray(mb.eurc) && mb.eurc.length === 2) {
    eurcMinted = mb.eurc[0]
    eurcBurned = mb.eurc[1]
  }

  return {
    usdcMinted,
    usdcBurned,
    usdcNet: usdcMinted - usdcBurned,
    eurcMinted,
    eurcBurned,
    eurcNet: eurcMinted !== null && eurcBurned !== null ? eurcMinted - eurcBurned : null,
    note: coverageNote(n, window.hours),
    coverageHours: n,
  }
}

// ── bridgeSummary ─────────────────────────────────────────────────────────────

export interface DomainStat {
  domainId: number
  name: string
  count: number
  usdc: number
}

export interface BridgeSummary {
  outCount: number
  outUsdc: number
  fees: number
  inCount: number
  /** Inbound USDC when the new shape is present; null for old shape (in.length === 1). */
  inUsdc: number | null
  /** Inbound fees when the new shape is present; null for old shape. */
  inFees: number | null
  /**
   * True when in.length >= 3 AND in[0] > sum of byDomainIn counts —
   * i.e. some counted arrivals have no per-source amount (older hours or non-USDC messages).
   */
  inAmountsPartial: boolean
  /**
   * Sum of ALL byDomainIn counts (not only the top 5). Used for "amounts for X of N" display.
   * 0 when byDomainIn is absent.
   */
  inCountWithAmounts: number
  /**
   * Positive = more came in; negative = more left.
   * null when inUsdc is null (old shape) OR when inAmountsPartial is true
   * (understated inUsdc minus complete outUsdc would show false "money leaving").
   */
  netUsdc: number | null
  /**
   * Direction derived from amounts when known and complete; falls back to count comparison
   * when amounts are unavailable or partial.
   */
  netDirection: 'in' | 'out' | 'flat'
  /** Top 5 destination domains by USDC volume (outbound) */
  topDomains: DomainStat[]
  /** Top 5 source domains by USDC volume (inbound); '-1' sorted last regardless of size. Empty for old shape. */
  topSources: DomainStat[]
  note: string | null
  coverageHours: number
}

export function bridgeSummary(window: ExtendedWindow): BridgeSummary | null {
  const br = window.bridge
  const n = window.bridgeCoverageHours
  if (!br || typeof n !== 'number' || n <= 0) return null

  const [outCount, outUsdc, fees] = br.out
  const inCount = br.in[0]

  // New shape: in has 3 elements [count, usdc, fees]
  const inUsdc: number | null = br.in.length >= 3 ? (br.in as [number, number, number])[1] : null
  const inFees: number | null = br.in.length >= 3 ? (br.in as [number, number, number])[2] : null

  // topDomains: outbound, top 5 by USDC
  const topDomains: DomainStat[] = Object.entries(br.byDomain)
    .map(([id, [count, usdc]]) => ({
      domainId: Number(id),
      name: resolveDomainName(Number(id)),
      count,
      usdc,
    }))
    .sort((a, b) => b.usdc - a.usdc)
    .slice(0, 5)

  // topSources: inbound, top 5 by USDC — domain -1 (unknown) always sorted last
  let topSources: DomainStat[] = []
  if (br.byDomainIn && Object.keys(br.byDomainIn).length > 0) {
    topSources = Object.entries(br.byDomainIn)
      .map(([id, [count, usdc]]) => ({
        domainId: Number(id),
        name: resolveDomainName(Number(id)),
        count,
        usdc,
      }))
      .sort((a, b) => {
        // -1 (unknown) always last
        if (a.domainId === -1) return 1
        if (b.domainId === -1) return -1
        return b.usdc - a.usdc
      })
      .slice(0, 5)
  }

  // inCountWithAmounts: sum of ALL byDomainIn counts (whole map, not only top 5)
  const inCountWithAmounts: number = br.byDomainIn
    ? Object.values(br.byDomainIn).reduce((s, [c]) => s + c, 0)
    : 0

  // inAmountsPartial: new shape present AND counted arrivals > byDomainIn sum
  const inAmountsPartial =
    br.in.length >= 3 && inCount > inCountWithAmounts

  // netUsdc: null when amounts unavailable (old shape) OR partial (understated in would
  // show false "money leaving" against a complete out figure)
  const netUsdc: number | null =
    inUsdc !== null && !inAmountsPartial ? inUsdc - outUsdc : null

  // netDirection: prefer amounts when full; fall back to count comparison otherwise
  const netDirection: 'in' | 'out' | 'flat' = netUsdc !== null
    ? (netUsdc > 0 ? 'in' : netUsdc < 0 ? 'out' : 'flat')
    : (inCount > outCount ? 'in' : outCount > inCount ? 'out' : 'flat')

  return {
    outCount,
    outUsdc,
    fees,
    inCount,
    inUsdc,
    inFees,
    inAmountsPartial,
    inCountWithAmounts,
    netUsdc,
    netDirection,
    topDomains,
    topSources,
    note: coverageNote(n, window.hours),
    coverageHours: n,
  }
}

// ── supplyChange ──────────────────────────────────────────────────────────────

export interface SupplyChangeResult {
  /** Latest supply (token units) */
  supply: number
  /** Change over the requested hours span */
  change: number
  /** Minted sum over the span */
  minted: number
  /** Burned sum over the span */
  burned: number
  /** Number of series points actually used */
  pointsUsed: number
}

export function supplyChange(
  supplyJson: SupplyJson | null,
  token: 'usdc' | 'eurc',
  hours: number,
): SupplyChangeResult | null {
  if (!supplyJson) return null
  const tok = supplyJson.tokens[token]
  if (!tok || !Array.isArray(tok.series) || tok.series.length === 0) return null

  const series = tok.series
  const supply = tok.supply

  // Use up to `hours` most recent points
  const slice = series.slice(-hours)
  if (slice.length === 0) return null

  const oldest = slice[0]
  const change = supply - oldest.supply

  let minted = 0
  let burned = 0
  for (const pt of slice) {
    minted += pt.mint ?? 0
    burned += pt.burn ?? 0
  }

  return { supply, change, minted, burned, pointsUsed: slice.length }
}

// ── parseSupply ───────────────────────────────────────────────────────────────

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function parseSupplyToken(raw: unknown): TokenSupply | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!isFiniteNum(r['supply'])) return null
  const series: SupplySeriesPoint[] = []
  if (Array.isArray(r['series'])) {
    for (const pt of r['series']) {
      if (!pt || typeof pt !== 'object') continue
      const p = pt as Record<string, unknown>
      if (typeof p['hour'] !== 'string' || !isFiniteNum(p['supply'])) continue
      series.push({
        hour: p['hour'],
        supply: p['supply'],
        mint: isFiniteNum(p['mint']) ? (p['mint']) : undefined,
        burn: isFiniteNum(p['burn']) ? (p['burn']) : undefined,
      })
    }
  }
  return { supply: r['supply'], series }
}

export function parseSupply(raw: unknown): SupplyJson | null {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const r = raw as Record<string, unknown>
    if (typeof r['generatedAt'] !== 'string' || !r['generatedAt']) return null
    if (typeof r['network'] !== 'string') return null
    const tokens = r['tokens']
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return null
    const t = tokens as Record<string, unknown>
    const usdc = parseSupplyToken(t['usdc'])
    const eurc = parseSupplyToken(t['eurc'])
    if (!usdc || !eurc) return null
    return {
      generatedAt: r['generatedAt'],
      network: r['network'],
      tokens: { usdc, eurc },
    }
  } catch {
    return null
  }
}

// ── parseBridge ───────────────────────────────────────────────────────────────

function parseBridgeWindow(raw: unknown): BridgeWindowJson | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const out = r['out']
  if (!Array.isArray(out) || out.length < 3) return null
  if (!out.every(v => isFiniteNum(v))) return null

  const inn = r['in']
  if (!Array.isArray(inn) || inn.length < 1) return null
  if (!isFiniteNum(inn[0])) return null

  // New shape: in may carry [count, usdc, fees]
  let parsedIn: [number] | [number, number, number]
  if (inn.length >= 3 && isFiniteNum(inn[1]) && isFiniteNum(inn[2])) {
    parsedIn = [inn[0], inn[1], inn[2]]
  } else {
    parsedIn = [inn[0]]
  }

  const byDomain: Record<string, [number, number]> = {}
  const bd = r['byDomain']
  if (bd && typeof bd === 'object' && !Array.isArray(bd)) {
    for (const [k, v] of Object.entries(bd as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length >= 2 && isFiniteNum(v[0]) && isFiniteNum(v[1])) {
        byDomain[k] = [v[0], v[1]]
      }
    }
  }

  // New optional field: byDomainIn
  const byDomainIn: Record<string, [number, number]> = {}
  const bdi = r['byDomainIn']
  if (bdi && typeof bdi === 'object' && !Array.isArray(bdi)) {
    for (const [k, v] of Object.entries(bdi as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length >= 2 && isFiniteNum(v[0]) && isFiniteNum(v[1])) {
        byDomainIn[k] = [v[0], v[1]]
      }
    }
  }
  const hasByDomainIn = Object.keys(byDomainIn).length > 0

  return {
    out: [out[0], out[1], out[2]],
    in: parsedIn,
    byDomain,
    ...(hasByDomainIn ? { byDomainIn } : {}),
  }
}

export function parseBridge(raw: unknown): BridgeJson | null {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const r = raw as Record<string, unknown>
    if (typeof r['generatedAt'] !== 'string' || !r['generatedAt']) return null
    if (typeof r['network'] !== 'string') return null

    const rawWin = r['windows']
    if (!rawWin || typeof rawWin !== 'object' || Array.isArray(rawWin)) return null
    const wRaw = rawWin as Record<string, unknown>
    const w1h = parseBridgeWindow(wRaw['1h'])
    const w24h = parseBridgeWindow(wRaw['24h'])
    const w7d = parseBridgeWindow(wRaw['7d'])
    if (!w1h || !w24h || !w7d) return null

    const series: BridgeSeriesPoint[] = []
    if (Array.isArray(r['series'])) {
      for (const pt of r['series']) {
        if (!pt || typeof pt !== 'object') continue
        const p = pt as Record<string, unknown>
        if (typeof p['hour'] !== 'string') continue
        if (!isFiniteNum(p['outCount']) || !isFiniteNum(p['outUsdc']) || !isFiniteNum(p['inCount'])) continue
        series.push({
          hour: p['hour'],
          outCount: p['outCount'],
          outUsdc: p['outUsdc'],
          inCount: p['inCount'],
        })
      }
    }

    return {
      generatedAt: r['generatedAt'],
      network: r['network'],
      windows: { '1h': w1h, '24h': w24h, '7d': w7d },
      series,
    }
  } catch {
    return null
  }
}
