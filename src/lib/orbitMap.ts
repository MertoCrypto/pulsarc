/**
 * Pure geometry and colour helpers for the Arc Orbit scene. Deterministic, no '@/' imports.
 */
import type { AppCategory } from '../data/appRegistries.ts'

export type OrbitKey = AppCategory | 'Unlisted'

export interface Point {
  x: number
  y: number
}

/** Same order as CATEGORIES in src/data/apps.ts; used as the tie-break for equal totals. */
export const CATEGORY_ORDER: readonly AppCategory[] = ['Stablecoin', 'DeFi', 'RWA', 'Payments', 'Agents', 'Infra']

/** One hue per orbit, tuned for the #08111f scene background. */
export const CATEGORY_COLORS: Record<OrbitKey, string> = {
  Stablecoin: '#a9c4ea', // periwinkle
  DeFi: '#5ee6a8', // var(--positive)
  RWA: '#f5c26b', // amber
  Payments: '#6fd3ff', // sky
  Agents: '#c3a0ff', // violet
  Infra: '#ff9f8a', // coral
  Unlisted: '#8da2c0', // slate
}

/** Every ellipse is the same shape on a landscape canvas: ry = FLATTEN · rx. */
export const FLATTEN = 0.42
/** Shared tilt of the orbital plane, radians. */
export const TILT = -0.2
export const MIN_INNER_RX = 90

/** Categories sorted by 24h transactions, busiest first; ties keep `categories` order. */
export function orbitOrder(
  totals: Readonly<Record<string, number>>,
  categories: readonly string[] = CATEGORY_ORDER,
): string[] {
  return categories
    .map((name, i) => ({ name, i, tx: totals[name] ?? 0 }))
    .sort((a, b) => b.tx - a.tx || a.i - b.i)
    .map(o => o.name)
}

/**
 * Semi-major radii for n concentric orbits: equal steps from an inner radius of at least 90 px
 * out to the largest ellipse that fits the box with `gutter` on every side.
 * `flatten` defaults to FLATTEN (0.42); pass flattenFor(w,h) for portrait canvases.
 */
export function orbitRadii(n: number, width: number, height: number, gutter = 16, flatten = FLATTEN): number[] {
  if (n <= 0) return []
  const maxRx = Math.max(0, Math.min(width / 2 - gutter, (height / 2 - gutter) / flatten))
  if (n === 1) return [maxRx]
  const inner = Math.min(MIN_INNER_RX, maxRx)
  const step = (maxRx - inner) / (n - 1)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? maxRx : inner + step * i))
}

/** Planet dot radius: 3 px at 0 transactions up to 10 px at the busiest app, on a log scale. */
export function planetRadius(tx: number, maxTx: number): number {
  if (!(tx > 0) || !(maxTx > 0)) return 3
  const t = Math.min(1, Math.log1p(tx) / Math.log1p(maxTx))
  return 3 + 7 * t
}

/** Seconds for one full lap: 90 s on the inner orbit, growing linearly to 240 s at rx = 600. */
export function orbitLapSeconds(rx: number): number {
  const t = (rx - MIN_INNER_RX) / (600 - MIN_INNER_RX)
  return 90 + 150 * Math.min(1, Math.max(0, t))
}

/** Parametric angle (radians) of planet `index` of `count` at time `tSec`, evenly spaced plus a phase. */
export function planetAngle(index: number, count: number, phase: number, tSec: number, rx: number): number {
  const base = count > 0 ? (index / count) * Math.PI * 2 : 0
  return base + phase + (tSec / orbitLapSeconds(rx)) * Math.PI * 2
}

/** Point on an ellipse centred at (cx, cy), rotated by `tilt`, at parametric `angle`. */
export function ellipsePoint(cx: number, cy: number, rx: number, ry: number, tilt: number, angle: number): Point {
  const ex = rx * Math.cos(angle)
  const ey = ry * Math.sin(angle)
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  return { x: cx + ex * ct - ey * st, y: cy + ex * st + ey * ct }
}

/** Seeded RNG (mulberry32): same seed, same sequence, values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable 32-bit seed from a string (FNV-1a). */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Control point of a quadratic bezier that bows the comet's path to one side of the straight line. */
export function cometPath(from: Point, to: Point, seed: number): Point {
  const rng = mulberry32(seed)
  const side = rng() < 0.5 ? -1 : 1
  const bow = 0.22 + 0.2 * rng()
  const dx = to.x - from.x
  const dy = to.y - from.y
  return {
    x: (from.x + to.x) / 2 + -dy * bow * side,
    y: (from.y + to.y) / 2 + dx * bow * side,
  }
}

/**
 * Flattening ratio ry/rx for portrait vs landscape canvases.
 * On landscape (width >= height) returns FLATTEN (0.42).
 * On portrait returns min(0.85, 0.42 + 0.6*(height/width − 1)), clamped to [0.42, 0.85].
 */
export function flattenFor(width: number, height: number): number {
  if (width >= height) return 0.42
  const ratio = height / width
  return Math.min(0.85, Math.max(0.42, 0.42 + 0.6 * (ratio - 1)))
}

/** Returns true when two axis-aligned rectangles (x, y, w, h) overlap. Touching edges do NOT overlap. */
export function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

export interface LabelItem {
  id: string
  x: number
  y: number
  w: number
  h: number
  priority: number
}

export interface Blocker {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Greedy label placement. Returns the set of ids whose labels should be shown.
 * Items are considered in priority-descending order (ties: stable sort preserves input order).
 * A label is shown only if its box does not intersect any already-placed label or any blocker.
 * Touching edges are not considered intersections.
 */
export function placeLabels(items: LabelItem[], blockers: Blocker[]): Set<string> {
  const sorted = [...items].sort((a, b) => b.priority - a.priority)
  const placed: Blocker[] = []
  const visible = new Set<string>()
  for (const item of sorted) {
    const { x, y, w, h } = item
    // Check against blockers.
    const blockedByBlocker = blockers.some(b => rectsOverlap(x, y, w, h, b.x, b.y, b.w, b.h))
    if (blockedByBlocker) continue
    // Check against already-placed labels.
    const blockedByPlaced = placed.some(b => rectsOverlap(x, y, w, h, b.x, b.y, b.w, b.h))
    if (blockedByPlaced) continue
    placed.push({ x, y, w, h })
    visible.add(item.id)
  }
  return visible
}

/** Quadratic bezier at t ∈ [0, 1]. */
export function pointOnBezier(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t
  const a = u * u
  const b = 2 * u * t
  const d = t * t
  return { x: a * p0.x + b * c.x + d * p1.x, y: a * p0.y + b * c.y + d * p1.y }
}

// ── Arc galaxy (the landing hero's technique, centred on the map) ───────────

/** How far the disc leans away from the viewer; the same value the landing hero uses. */
export const FIELD_TILT = 0.42
/** Rotation of the disc in the screen plane (radians); the same value the landing hero uses. */
export const FIELD_ROLL = -0.3
/** The outermost dashed ellipse (the other networks) sits at this multiple of the dust disc radius. */
export const PORT_RING_FACTOR = 1.32
/** Phones show only the first ten ports. */
export const PORT_COUNT_NARROW = 10

export interface Projected extends Point {
  /** sin(angle): +1 at the near edge of the orbit, −1 at the far edge. */
  depth: number
}

/**
 * Screen position of a point at radius `r` and orbit angle `angle` on a tilted, rolled disc centred at
 * (cx, cy). Same projection as the landing hero's galaxy.
 */
export function projectPoint(
  r: number, angle: number, cx: number, cy: number, zoom: number, tilt: number, roll: number,
): Projected {
  const X = Math.cos(angle) * r * zoom
  const Y = Math.sin(angle) * r * zoom * tilt
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  return { x: cx + X * cr - Y * sr, y: cy + X * sr + Y * cr, depth: Math.sin(angle) }
}

/** `n` angles spaced evenly around the circle, starting at `offset`. */
export function portAngles(n: number, offset: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => offset + (i / n) * Math.PI * 2)
}

/** Half-width and half-height of an ellipse with semi-major `a`, semi-minor `a·tilt`, rotated by `roll`. */
export function ellipseExtent(a: number, tilt: number, roll: number): { halfW: number; halfH: number } {
  const b = a * tilt
  const c2 = Math.cos(roll) ** 2
  const s2 = Math.sin(roll) ** 2
  return { halfW: Math.sqrt(a * a * c2 + b * b * s2), halfH: Math.sqrt(a * a * s2 + b * b * c2) }
}

/**
 * Zoom that fits the whole galaxy, other networks included, into a stage.
 * Wide stages keep 80 px (sides) and 100 px (top and bottom) clear for symbols and labels and stay within
 * 0.5–1.25; narrow ones fit the width with 24 px to spare and stay within 0.28–0.6.
 */
export function galaxyFit(width: number, height: number, wide: boolean, disc: number): number {
  const { halfW, halfH } = ellipseExtent(disc * PORT_RING_FACTOR, FIELD_TILT, FIELD_ROLL)
  if (!wide) return Math.max(0.28, Math.min(0.6, (width / 2 - 24) / halfW))
  return Math.max(0.5, Math.min(1.25, Math.min((width / 2 - 80) / halfW, (height / 2 - 100) / halfH)))
}

/** Radii of `n` app rings from 34% to 92% of the dust disc, so planets sit on the spiral. */
export function appRingRadii(n: number, disc: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [disc * 0.63]
  const inner = disc * 0.34
  const outer = disc * 0.92
  return Array.from({ length: n }, (_, i) => inner + ((outer - inner) * i) / (n - 1))
}

/** Radians per 60 fps frame: the inner ring is fastest and each ring outward is 29% slower. */
export function ringSpeed(ring: number): number {
  return 0.0052 * Math.pow(0.71, ring)
}

/** Where planet `index` of `count` starts on its ring (0–1): even spacing, staggered per ring so rings never line up. */
export function ringSlot(index: number, count: number, ring: number): number {
  return (((count > 0 ? index / count : 0) + ring * 0.137) % 1 + 1) % 1
}

/** App planet size in px: 30 at no transactions, up to 56 for the busiest app, on a log scale. */
export function appPlanetSize(tx: number, maxTx: number): number {
  if (!(tx > 0) || !(maxTx > 0)) return 30
  return 30 + 26 * Math.min(1, Math.log1p(tx) / Math.log1p(maxTx))
}

// ── Value pills ─────────────────────────────────────────────────────────────

/** "$800", "$5.2K", "$1.3M", "<$0.01": a short USDC amount for a pill. */
export function pillAmount(usdc: number): string {
  if (!(usdc >= 0.01)) return '<$0.01'
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '')
  if (usdc >= 1e12) return `$${trim(usdc / 1e12)}T`
  if (usdc >= 1e9) return `$${trim(usdc / 1e9)}B`
  if (usdc >= 1e6) return `$${trim(usdc / 1e6)}M`
  if (usdc >= 1e3 || Math.round(usdc) >= 1000) return `$${trim(usdc / 1e3)}K`
  return usdc >= 10 ? `$${Math.round(usdc)}` : `$${usdc.toFixed(2)}`
}

/**
 * Block range to hand to eth_getLogs for CCTP events.
 *  - First tick (prev === null): head only — avoids replaying old history on load.
 *  - Normal tick: from = prev + 1, capped at head − (cap − 1) so the range is at most `cap` blocks.
 *  - Already at head (prev === head): returns { from: head + 1, to: head } as an empty-range sentinel.
 * Only the block/tx fetch is limited to 8 blocks; the log range covers every block since the last seen one.
 */
export function logRange(prev: number | null, head: number, cap = 9000): { from: number; to: number } {
  if (prev === null) return { from: head, to: head }
  const ideal = prev + 1
  const earliest = head - (cap - 1)
  return { from: Math.max(ideal, earliest), to: head }
}

// ── Free-body network scatter ────────────────────────────────────────────────

export interface ScatterNode {
  id: string
  r: number
}

export interface ScatterBox {
  w: number
  h: number
}

export interface KeepOut {
  cx: number
  cy: number
  rx: number
  ry: number
}

/**
 * Place `nodes` as non-overlapping free bodies around a galaxy, left and right of the keep-out ellipse.
 * Returns a Map<id, {x, y}> of successfully placed nodes (biggest-first; unplaced nodes are omitted).
 *
 * Algorithm (wide ≥ 900 px):
 * - Sort biggest-first.
 * - For each node, try LEFT and RIGHT side strips first (x outside keepOut.rx + r + gap on each side),
 *   alternating L/R, heaviest nearest the galaxy's horizontal axis (cy).
 * - Only when both side strips are exhausted does the search fall back to top/bottom bands.
 * - All candidates are deterministic (mulberry32 seed).
 * - A candidate is valid: inside box (24 px gutter), outside keep-out ellipse (×1.12, ×1.25),
 *   and at least `gap` px from every previously placed circle (edge-to-edge).
 * - Unplaceable nodes are omitted; placed nodes never overlap.
 */
export function scatterNodes(
  nodes: ScatterNode[],
  box: ScatterBox,
  keepOut: KeepOut,
  seed: number,
  gap = 14,
): Map<string, Point> {
  const GUTTER = 24
  const sorted = [...nodes].sort((a, b) => b.r - a.r)
  const placed: Array<{ x: number; y: number; r: number }> = []
  const result = new Map<string, Point>()
  const rng = mulberry32(seed)
  const ko_rx = keepOut.rx * 1.12
  const ko_ry = keepOut.ry * 1.25

  // Wide layout: side regions are left of (cx - ko_rx) and right of (cx + ko_rx).
  const wideLayout = box.w >= 900

  for (const node of sorted) {
    const { id, r } = node
    // 16 px label allowance below each circle
    const minEdge = gap + 16

    const SIDE_TRIES = 200   // per-side attempts before falling back
    const BAND_TRIES = 200   // top/bottom fallback attempts
    let placed_pt: Point | null = null

    if (wideLayout) {
      // ── Phase 1: alternate left / right side strips ────────────────────────
      // Left strip:  GUTTER+r  … cx - ko_rx - r - gap
      // Right strip: cx + ko_rx + r + gap  … box.w - GUTTER - r
      const leftMax  = keepOut.cx - ko_rx - r - gap
      const rightMin = keepOut.cx + ko_rx + r + gap
      const leftOk  = leftMax  > GUTTER + r
      const rightOk = rightMin < box.w - GUTTER - r

      for (let si = 0; si < SIDE_TRIES * 2 && placed_pt === null; si++) {
        const tryLeft = si % 2 === 0 ? leftOk : !leftOk && rightOk
        if (!tryLeft && !rightOk) break
        if (si % 2 === 0 && !leftOk) continue
        if (si % 2 === 1 && !rightOk) continue

        const isLeft = si % 2 === 0 && leftOk
        // x: uniform in the side strip; heaviest near cy so sort index biases toward centre
        const xRange = isLeft
          ? leftMax - (GUTTER + r)
          : (box.w - GUTTER - r) - rightMin
        if (xRange <= 0) continue
        const xFrac = rng()   // uniform [0,1]
        const x = isLeft
          ? GUTTER + r + xFrac * xRange
          : rightMin + xFrac * xRange

        // y: bias toward centre (cy) so heaviest nodes land near horizontal axis
        const yRange = box.h - GUTTER * 2 - r * 2
        if (yRange <= 0) continue
        // Triangle distribution peaking at cy: use two uniform draws
        const u1 = rng(), u2 = rng()
        const yFrac = (u1 + u2) / 2   // triangle, peak at 0.5
        const y = GUTTER + r + yFrac * yRange

        // Box check
        if (x - r < GUTTER || x + r > box.w - GUTTER) continue
        if (y - r < GUTTER || y + r > box.h - GUTTER) continue

        // Keep-out check
        const dx = (x - keepOut.cx) / ko_rx
        const dy = (y - keepOut.cy) / ko_ry
        if (dx * dx + dy * dy < 1) continue

        // Gap check
        let ok = true
        for (const p of placed) {
          const ex = x - p.x, ey = y - p.y
          if (Math.sqrt(ex * ex + ey * ey) < r + p.r + minEdge) { ok = false; break }
        }
        if (!ok) continue

        placed_pt = { x, y }
      }

      // ── Phase 2: top / bottom bands (fallback) ────────────────────────────
      if (placed_pt === null) {
        // Top band: y in [GUTTER+r … cy - ko_ry - r - gap]
        // Bottom band: y in [cy + ko_ry + r + gap … box.h - GUTTER - r]
        const topMax    = keepOut.cy - ko_ry - r - gap
        const bottomMin = keepOut.cy + ko_ry + r + gap
        for (let bi = 0; bi < BAND_TRIES && placed_pt === null; bi++) {
          const useTop = bi % 2 === 0
          const yMin = useTop ? GUTTER + r : bottomMin
          const yMax = useTop ? topMax     : box.h - GUTTER - r
          if (yMax <= yMin) continue

          const x = GUTTER + r + rng() * (box.w - GUTTER * 2 - r * 2)
          const y = yMin + rng() * (yMax - yMin)

          if (x - r < GUTTER || x + r > box.w - GUTTER) continue
          if (y - r < GUTTER || y + r > box.h - GUTTER) continue

          const dx = (x - keepOut.cx) / ko_rx
          const dy = (y - keepOut.cy) / ko_ry
          if (dx * dx + dy * dy < 1) continue

          let ok = true
          for (const p of placed) {
            const ex = x - p.x, ey = y - p.y
            if (Math.sqrt(ex * ex + ey * ey) < r + p.r + minEdge) { ok = false; break }
          }
          if (!ok) continue

          placed_pt = { x, y }
        }
      }
    } else {
      // ── Narrow layout: original spiral approach ───────────────────────────
      const CANDIDATES = 400
      for (let ci = 0; ci < CANDIDATES && placed_pt === null; ci++) {
        const leftHalf = ci % 2 === 0
        const base_angle = rng() * Math.PI * 2
        const spread = 1 + (ci >> 1) / (CANDIDATES / 4)
        const dist = Math.min(box.w, box.h) * 0.08 * spread
        const band_cx = leftHalf
          ? GUTTER + r + dist + (box.w * 0.15 * (rng() + 0.1))
          : box.w - GUTTER - r - dist - (box.w * 0.15 * (rng() + 0.1))
        const y_range = box.h - GUTTER * 2 - r * 2
        const band_cy = GUTTER + r + rng() * y_range
        const x = band_cx + Math.cos(base_angle) * dist * 0.3
        const y = band_cy + Math.sin(base_angle) * dist * 0.3
        if (x - r < GUTTER || x + r > box.w - GUTTER) continue
        if (y - r < GUTTER || y + r > box.h - GUTTER) continue
        const dx = (x - keepOut.cx) / ko_rx
        const dy = (y - keepOut.cy) / ko_ry
        if (dx * dx + dy * dy < 1) continue
        let ok = true
        for (const p of placed) {
          const ex = x - p.x, ey = y - p.y
          if (Math.sqrt(ex * ex + ey * ey) < r + p.r + minEdge) { ok = false; break }
        }
        if (!ok) continue
        placed_pt = { x, y }
      }
    }

    if (placed_pt) {
      placed.push({ x: placed_pt.x, y: placed_pt.y, r })
      result.set(id, placed_pt)
    }
  }

  return result
}

/**
 * Pill for a CCTP move: "$5.2K USDC · Base → Arc" (inbound) or "$800 USDC · Arc → Solana" (outbound).
 * null when the amount is unknown: a pill never shows an invented number.
 */
export function cctpPill(direction: 'in' | 'out', chain: string, usdc: number | null): string | null {
  if (usdc === null) return null
  const route = direction === 'in' ? `${chain} → Arc` : `Arc → ${chain}`
  return `${pillAmount(usdc)} USDC · ${route}`
}

/** Bridge id used in BridgeMove (mirrors BridgeId in bridgeLive.ts). */
export type BridgeColorKey = 'cctp' | 'gateway' | 'across' | 'hyperlane' | 'lifi' | 'debridge'

/** One colour per bridge — tuned for the #08111f scene background. */
export const BRIDGE_COLORS: Record<BridgeColorKey, string> = {
  cctp:      '#a9c4ea', // periwinkle
  gateway:   '#5ee6a8', // mint
  across:    '#f0997b', // coral
  hyperlane: '#c3a6ff', // violet
  lifi:      '#f5c451', // amber
  debridge:  '#6fd3e8', // sky
}

/**
 * Pill for any bridge move: "$5.2K USDC · Base → Arc · Across"
 * Format: `<amount> USDC · <from> → <to> · <bridge>`
 * Returns null when the amount is unknown — never invents a number.
 */
export function bridgePill(
  direction: 'in' | 'out',
  chain: string,
  usdc: number | null,
  bridge: BridgeColorKey,
): string | null {
  if (usdc === null) return null
  const from = direction === 'in' ? chain : 'Arc'
  const to   = direction === 'in' ? 'Arc' : chain
  const label = bridge.charAt(0).toUpperCase() + bridge.slice(1)
  return `${pillAmount(usdc)} USDC · ${from} → ${to} · ${label}`
}

// ── Safari perf: canvas resolution budget ───────────────────────────────────

/**
 * Compute the effective DPR for a canvas, capping it so the total pixel count
 * never exceeds `budget` and never exceeds min(deviceDpr, 2).
 *
 * @param w         CSS width of the canvas in px.
 * @param h         CSS height of the canvas in px.
 * @param deviceDpr Raw window.devicePixelRatio.
 * @param budget    Max total canvas pixels (default 2_400_000).
 * @returns         Effective DPR in [1, min(deviceDpr, 2)].
 */
export function canvasDpr(w: number, h: number, deviceDpr: number, budget = 2_400_000): number {
  const cap = Math.min(deviceDpr, 2)
  // Start with the capped value.
  let dpr = cap
  // Reduce dpr if total pixels exceed budget.
  if (w > 0 && h > 0 && w * h * dpr * dpr > budget) {
    dpr = Math.sqrt(budget / (w * h))
  }
  // Never below 1.
  return Math.max(1, dpr)
}

/**
 * True for Safari / WebKit browsers (macOS Safari and every iOS browser, which all use WebKit).
 * False for Chromium-based (Chrome, Chromium, Edge, CriOS), Android and Firefox user agents.
 * Note: Firefox on iOS ("FxiOS") is WebKit too and is reported as true.
 */
export function isWebKitSafari(ua: string): boolean {
  if (!ua.includes('AppleWebKit')) return false
  return !/Chrome|Chromium|CriOS|Edg|EdgA|EdgiOS|OPR|Android/.test(ua)
}

// ── Safari perf: adaptive quality governor ───────────────────────────────────

/** Quality level: 0 = full, 1 = reduced, 2 = minimal. */
export type QualityLevel = 0 | 1 | 2

/**
 * Rolling-average frame governor.
 *
 * Rules:
 * - Keeps a rolling average of the last `windowSize` frame durations (ms).
 * - Level 0 → 1 when avg > 24 ms.
 * - Level 1 → 2 when avg > 32 ms.
 * - Steps back up (level → level - 1) only after avg < 17 ms for `recoveryFrames` consecutive frames.
 * - Never changes more than one level per `cooldownFrames` frames.
 * - No flapping: recovery only begins once avg < 17 ms and holds for the full window.
 */
export class QualityGovernor {
  private readonly windowSize: number
  private readonly cooldownFrames: number
  private readonly recoveryFrames: number
  private samples: number[] = []
  private level: QualityLevel = 0
  private framesSinceChange = 0
  private consecutiveFastFrames = 0

  constructor(windowSize = 45, cooldownFrames = 90, recoveryFrames = 180, startLevel: QualityLevel = 0) {
    this.windowSize = windowSize
    this.cooldownFrames = cooldownFrames
    this.recoveryFrames = recoveryFrames
    this.level = startLevel
  }

  /** Feed a frame duration in ms. Returns the current quality level. */
  feed(dt: number): QualityLevel {
    // Maintain rolling window.
    this.samples.push(dt)
    if (this.samples.length > this.windowSize) this.samples.shift()
    this.framesSinceChange++

    const avg = this.rollingAvg()

    // Track consecutive fast frames for recovery.
    if (avg < 17) {
      this.consecutiveFastFrames++
    } else {
      this.consecutiveFastFrames = 0
    }

    // Only change once per cooldown window.
    if (this.framesSinceChange < this.cooldownFrames) return this.level

    // Step up (degrade quality): avg too high.
    if (this.level < 2 && avg > (this.level === 0 ? 24 : 32)) {
      this.level = (this.level + 1) as QualityLevel
      this.framesSinceChange = 0
      this.consecutiveFastFrames = 0
      return this.level
    }

    // Step down (recover quality): avg fast enough for long enough.
    if (this.level > 0 && this.consecutiveFastFrames >= this.recoveryFrames) {
      this.level = (this.level - 1) as QualityLevel
      this.framesSinceChange = 0
      this.consecutiveFastFrames = 0
      return this.level
    }

    return this.level
  }

  /** Current quality level without feeding a frame. */
  getLevel(): QualityLevel { return this.level }

  private rollingAvg(): number {
    if (this.samples.length === 0) return 0
    let sum = 0
    for (const s of this.samples) sum += s
    return sum / this.samples.length
  }
}
