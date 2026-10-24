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
