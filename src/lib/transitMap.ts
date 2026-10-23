/**
 * Pure layout engine for the Arc Transit Map.
 * No React, no DOM, no network — fully deterministic, fully testable.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface StationInput {
  id: string
  name: string
  line: string
  tx: number
  wallets: number
  hollow?: boolean
}

export interface LayoutOptions {
  width: number
  height: number
  /** Distance between consecutive stations along the polyline. Default 64. */
  spacing?: number
}

export interface Station {
  id: string
  name: string
  line: string
  tx: number
  wallets: number
  hollow: boolean
  x: number
  y: number
  r: number
  labelSide: 'left' | 'right' | 'above' | 'below'
  /** When true, the label collides with another label/station/hub and must be hidden (show name in tooltip only). */
  labelHidden?: boolean
  /**
   * Portal stations only: true when the "not measured yet" sub-label fits (it sits directly
   * under the name box). false/undefined → render the name only.
   */
  subLabelVisible?: boolean
  /**
   * Optional box shift used when the centred position is blocked. For 'above'/'below' the box
   * extends rightwards from the station ('start') or leftwards ('end'); for 'left'/'right' it
   * extends downwards ('start') or upwards ('end'). Absent = centred on the station.
   */
  labelAlign?: 'start' | 'end'
}

export interface Line {
  key: string
  angle: number          // degrees, octilinear
  points: { x: number; y: number }[]
  stations: Station[]
  totalTx: number
  dashed: boolean
}

export interface LayoutResult {
  hub: { x: number; y: number }
  lines: Line[]
}

// ─── Label geometry ───────────────────────────────────────────────────────────

export interface LabelBox {
  x: number  // left edge
  y: number  // top edge
  w: number
  h: number
}

const LABEL_H = 14
const LABEL_OFFSET = 14  // distance from station centre to start of label
const LABEL_CHAR_W = 6.2
const LABEL_PAD = 8

type LabelGeom = Pick<Station, 'x' | 'y' | 'name' | 'labelSide'> & Partial<Pick<Station, 'labelAlign' | 'r'>>

/** Shared box construction: `off` = centre-to-label distance, `k` = scale. */
function boxAt(station: LabelGeom, k: number, off: number): LabelBox {
  const w = (LABEL_CHAR_W * station.name.length + LABEL_PAD) * k
  const h = LABEL_H * k
  const al = station.labelAlign
  // Cross-axis position: centred unless aligned.
  const bx = al === 'start' ? station.x : al === 'end' ? station.x - w : station.x - w / 2
  const by = al === 'start' ? station.y : al === 'end' ? station.y - h : station.y - h / 2
  switch (station.labelSide) {
    case 'right':
      return { x: station.x + off, y: by, w, h }
    case 'left':
      return { x: station.x - off - w, y: by, w, h }
    case 'above':
      return { x: bx, y: station.y - off - h, w, h }
    case 'below':
      return { x: bx, y: station.y + off, w, h }
  }
}

/**
 * Compute the label bounding box for a station given its labelSide (and optional labelAlign).
 * Dimensions are in layout units (k=1).
 */
export function labelBox(station: LabelGeom): LabelBox {
  return boxAt(station, 1, LABEL_OFFSET)
}

/**
 * Distance from station centre to the near edge of its label at scale k.
 * Normally 14·k; grows to (r + 3·k) when the station circle would otherwise
 * poke into the label (only possible for large dots at k < ~0.8). Identical
 * to LABEL_OFFSET at k=1 because r ≤ 11.
 */
export function labelOffsetK(r: number, k: number): number {
  return Math.max(LABEL_OFFSET * k, r + 3 * k)
}

/**
 * Compute the label bounding box scaled by k (layout units per screen pixel).
 * At k=1 this equals labelBox().
 */
export function labelBoxK(station: LabelGeom & Pick<Station, 'r'>, k: number): LabelBox {
  return boxAt(station, k, labelOffsetK(station.r, k))
}

/** Text of the portal sub-label. */
export const SUB_LABEL_TEXT = 'not measured yet'
const SUB_CHAR_W = 5.2
const SUB_PAD = 6
const SUB_H = 11

/** Horizontal text anchor of a placed label (also the alignment of its sub-label). */
export function labelAnchor(station: Pick<Station, 'labelSide' | 'labelAlign'>): 'start' | 'middle' | 'end' {
  switch (station.labelSide) {
    case 'right': return 'start'
    case 'left': return 'end'
    default: return station.labelAlign ?? 'middle'
  }
}

/**
 * Box of the portal sub-label: directly under the name box (top edge = name box bottom),
 * width (5.2 × chars + 6)·k, height 11·k, aligned to the same text anchor as the name.
 */
export function subLabelBox(station: LabelGeom & Pick<Station, 'r'>, k: number): LabelBox {
  const nb = labelBoxK(station, k)
  const w = (SUB_CHAR_W * SUB_LABEL_TEXT.length + SUB_PAD) * k
  const h = SUB_H * k
  const y = nb.y + nb.h
  switch (labelAnchor(station)) {
    case 'start': return { x: nb.x, y, w, h }
    case 'end': return { x: nb.x + nb.w - w, y, w, h }
    default: return { x: nb.x + nb.w / 2 - w / 2, y, w, h }
  }
}

/** True when two axis-aligned boxes overlap (touching edges do not count). */
export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

// ─── Segment / rectangle intersection ────────────────────────────────────────

type Pt = { x: number; y: number }

function pointInBox(p: Pt, b: LabelBox): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/** c is collinear with a–b; true when it lies within the a–b bounding box. */
function withinSpan(a: Pt, b: Pt, c: Pt): boolean {
  return (
    c.x >= Math.min(a.x, b.x) && c.x <= Math.max(a.x, b.x) &&
    c.y >= Math.min(a.y, b.y) && c.y <= Math.max(a.y, b.y)
  )
}

/** Closed segment–segment intersection (touching and collinear overlap count). */
function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = orient(p3, p4, p1)
  const d2 = orient(p3, p4, p2)
  const d3 = orient(p1, p2, p3)
  const d4 = orient(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  if (d1 === 0 && withinSpan(p3, p4, p1)) return true
  if (d2 === 0 && withinSpan(p3, p4, p2)) return true
  if (d3 === 0 && withinSpan(p1, p2, p3)) return true
  if (d4 === 0 && withinSpan(p1, p2, p4)) return true
  return false
}

/**
 * Exact test: does the segment p–q intersect the CLOSED rectangle `box`?
 * True when either endpoint lies in the rectangle (edges included) or the
 * segment crosses/touches one of its 4 edges. Unlike boxesOverlap, touching
 * counts as a hit — a label must keep clear of a line, not merely graze it.
 */
export function segmentHitsBox(p: Pt, q: Pt, box: LabelBox): boolean {
  if (pointInBox(p, box) || pointInBox(q, box)) return true
  const tl = { x: box.x, y: box.y }
  const tr = { x: box.x + box.w, y: box.y }
  const br = { x: box.x + box.w, y: box.y + box.h }
  const bl = { x: box.x, y: box.y + box.h }
  return (
    segmentsIntersect(p, q, tl, tr) ||
    segmentsIntersect(p, q, tr, br) ||
    segmentsIntersect(p, q, br, bl) ||
    segmentsIntersect(p, q, bl, tl)
  )
}

/** Convert a hub circle to a LabelBox for collision purposes. */
function hubBox(hub: { x: number; y: number }, r: number): LabelBox {
  return { x: hub.x - r, y: hub.y - r, w: r * 2, h: r * 2 }
}

/** Convert a station circle to a LabelBox for collision purposes, with a minimum radius. */
function stationCircleBox(s: { x: number; y: number; r: number }, minR: number): LabelBox {
  const r = Math.max(s.r, minR)
  return { x: s.x - r, y: s.y - r, w: r * 2, h: r * 2 }
}

// ─── contentBounds ────────────────────────────────────────────────────────────

export interface ContentBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Compute the bounding box that covers:
 *   - the hub circle (radius 18 + glow = 36)
 *   - every polyline point on every line
 *   - every station circle (station.r) plus its label box
 *     (label width = 6.2 × chars + 8, label height = 14, offset = 14)
 *
 * `pad` (default 48) is added on all sides.
 * Returns a {x, y, width, height} viewBox-ready rectangle.
 */
export function contentBounds(layout: LayoutResult, pad = 48): ContentBounds {
  const HUB_R = 36  // hub glow radius

  let minX = layout.hub.x - HUB_R
  let maxX = layout.hub.x + HUB_R
  let minY = layout.hub.y - HUB_R
  let maxY = layout.hub.y + HUB_R

  const expand = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  for (const line of layout.lines) {
    for (const pt of line.points) {
      expand(pt.x, pt.y)
    }
    for (const s of line.stations) {
      // Station circle
      expand(s.x - s.r, s.y - s.r)
      expand(s.x + s.r, s.y + s.r)

      // Label bounding box (always expand even when labelHidden so viewBox is stable)
      const lb = labelBox(s)
      expand(lb.x, lb.y)
      expand(lb.x + lb.w, lb.y + lb.h)
    }
  }

  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + 2 * pad,
    height: maxY - minY + 2 * pad,
  }
}

// ─── Core helpers (exported for tests) ───────────────────────────────────────

/**
 * Maps tx count to a station radius: sqrt-scaled in [4, 11].
 * tx === 0 (or hollow) → 4.
 */
export function stationRadius(tx: number, maxTx: number): number {
  if (tx <= 0 || maxTx <= 0) return 4
  // sqrt scale: r = 4 + 7 * sqrt(tx / maxTx)
  const r = 4 + 7 * Math.sqrt(tx / maxTx)
  return Math.min(11, Math.max(4, r))
}

/**
 * Number of animated trains on a line: clamp(round(log10(lineTx + 1)), 0, 4).
 */
export function trainCount(lineTx: number): number {
  if (lineTx < 0) return 0
  const v = Math.round(Math.log10(lineTx + 1))
  return Math.min(4, Math.max(0, v))
}

/**
 * Interpolates a point along a polyline at parameter t ∈ [0, 1] by arc length.
 * t < 0 → first point; t > 1 → last point.
 */
export function pointAlong(points: { x: number; y: number }[], t: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { ...points[0] }
  if (t <= 0) return { ...points[0] }
  if (t >= 1) return { ...points[points.length - 1] }

  // Compute cumulative arc lengths
  const segs: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    segs.push(segs[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  const total = segs[segs.length - 1]
  if (total === 0) return { ...points[0] }

  const target = t * total
  for (let i = 1; i < segs.length; i++) {
    if (segs[i] >= target) {
      const segLen = segs[i] - segs[i - 1]
      if (segLen === 0) return { ...points[i] }
      const u = (target - segs[i - 1]) / segLen
      return {
        x: points[i - 1].x + u * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + u * (points[i].y - points[i - 1].y),
      }
    }
  }
  return { ...points[points.length - 1] }
}

/** Clamps zoom to [0.6, 3]. */
export function clampZoom(z: number): number {
  return Math.min(3, Math.max(0.6, z))
}

// ─── Layout engine ────────────────────────────────────────────────────────────

const MARGIN = 40
const MIN_SPACING = 36
// Minimum distance between stations on different lines
const MIN_INTER_LINE_DIST = 24

/** Hub collision radius for labels (layout units). */
const HUB_COLLISION_R = 22

/**
 * Priority list of octilinear directions for NON-DASHED (category) lines.
 * Ordered so lines with more stations get the most spacious directions:
 * horizontal (0°, 180°) and diagonal (45°, 315°, 135°, 225°) have more
 * label room than vertical (90°, 270°).
 *
 * With 7 lines total (up to 6 category + 1 dashed portal):
 *   category lines: use DIRECTION_PRIORITY[0..5] → 0, 180, 45, 225, 315, 135
 *   dashed portal:  always 270° (south)
 *   unassigned:     90° (north) — the 8th direction left empty
 */
const DIRECTION_PRIORITY = [0, 180, 45, 225, 315, 135] as const

/** Direction reserved for dashed (portal) lines — not in DIRECTION_PRIORITY. */
const DASHED_LINE_ANGLE = 270

type LabelSide = 'left' | 'right' | 'above' | 'below'

/**
 * Deterministic side-preference order for the station at `index` on a line of direction `angle`.
 *
 * - horizontal (0/180): above, below (swapped on odd stations so neighbours differ),
 *   then the two sides along the line, outward first.
 * - vertical (90/270): right, left, then above/below (alternating).
 * - diagonal: the sides that sit on a perpendicular of the line first (a wide label beside a
 *   diagonal clears it), horizontal-extent sides before vertical ones; even stations start
 *   on the "up" normal, odd stations on the "down" normal.
 *   "/" (45/225): up normal = left/above, down normal = right/below.
 *   "\" (135/315): up normal = right/above, down normal = left/below.
 */
export function labelSideOrder(angle: number, index: number): LabelSide[] {
  const a = ((angle % 360) + 360) % 360
  const even = index % 2 === 0
  if (a === 0 || a === 180) {
    const first: LabelSide[] = even ? ['above', 'below'] : ['below', 'above']
    const along: LabelSide[] = a === 0 ? ['right', 'left'] : ['left', 'right']
    return [...first, ...along]
  }
  if (a === 90 || a === 270) {
    return even ? ['right', 'left', 'above', 'below'] : ['right', 'left', 'below', 'above']
  }
  if (a === 45 || a === 225) {
    return even ? ['left', 'right', 'above', 'below'] : ['right', 'left', 'below', 'above']
  }
  if (a === 135 || a === 315) {
    return even ? ['right', 'left', 'above', 'below'] : ['left', 'right', 'below', 'above']
  }
  return ['right', 'left', 'above', 'below']
}

interface LabelCandidate {
  side: LabelSide
  align?: 'start' | 'end'
}

/**
 * Candidate positions for one station: first the four centred sides in `order`, then, only if
 * all of those are blocked, shifted variants of each side in the same order. Shifts go away
 * from the hub first (the hub end of a line is where other lines crowd in), then back toward it.
 */
function labelCandidates(
  order: LabelSide[],
  s: { x: number; y: number },
  hub: { x: number; y: number },
): LabelCandidate[] {
  const out: LabelCandidate[] = order.map(side => ({ side }))
  const alongX: Array<'start' | 'end'> = s.x >= hub.x ? ['start', 'end'] : ['end', 'start']
  const alongY: Array<'start' | 'end'> = s.y >= hub.y ? ['start', 'end'] : ['end', 'start']
  for (const side of order) {
    const aligns = side === 'above' || side === 'below' ? alongX : alongY
    for (const align of aligns) out.push({ side, align })
  }
  return out
}

/** Build the polyline for a line given hub, angle, stationCount, spacing, width/height.
 * Exported so tests can verify bend-vertex placement without going through layoutTransitMap.
 */
export function buildPolyline(
  hx: number,
  hy: number,
  angleDeg: number,
  stationCount: number,
  spacing: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = -Math.sin(rad)  // SVG y-axis is inverted

  // Total required length
  const totalLen = stationCount * spacing

  // Check if last station would be out of bounds; if so, try a 45° bend
  let lastX = hx + dx * totalLen
  let lastY = hy + dy * totalLen

  const inBounds = (x: number, y: number) =>
    x >= MARGIN && x <= width - MARGIN && y >= MARGIN && y <= height - MARGIN

  if (inBounds(lastX, lastY)) {
    // Single straight segment: hub → last point (intermediate stations sit on it)
    return [{ x: hx, y: hy }, { x: lastX, y: lastY }]
  }

  // Try a bend: go straight for half the stations, then bend 45° toward center
  const bendIdx = Math.max(1, Math.floor(stationCount / 2))
  const bendLen = bendIdx * spacing

  const bendX = hx + dx * bendLen
  const bendY = hy + dy * bendLen

  // Determine which 45° turn keeps things in bounds:
  // Perpendicular choices are +45° and -45° from current angle
  const bendAngles = [angleDeg + 45, angleDeg - 45]
  let bestPoints: { x: number; y: number }[] | null = null

  for (const ba of bendAngles) {
    const brad = (ba * Math.PI) / 180
    const bdx = Math.cos(brad)
    const bdy = -Math.sin(brad)
    const remStations = stationCount - bendIdx
    const bLastX = bendX + bdx * remStations * spacing
    const bLastY = bendY + bdy * remStations * spacing
    if (inBounds(bLastX, bLastY)) {
      bestPoints = [{ x: hx, y: hy }, { x: bendX, y: bendY }, { x: bLastX, y: bLastY }]
      break
    }
  }

  if (bestPoints) return bestPoints

  // Still overflowing: shrink spacing until it fits (never below MIN_SPACING)
  const safeLen = (() => {
    const maxX = dx > 0 ? width - MARGIN - hx : dx < 0 ? hx - MARGIN : Infinity
    const maxY = dy > 0 ? height - MARGIN - hy : dy < 0 ? hy - MARGIN : Infinity
    const maxDxSteps = dx !== 0 ? Math.abs(maxX / dx) : Infinity
    const maxDySteps = dy !== 0 ? Math.abs(maxY / dy) : Infinity
    return Math.min(maxDxSteps, maxDySteps)
  })()

  const safeTotalLen = Math.max(stationCount * MIN_SPACING, safeLen)
  lastX = hx + dx * Math.min(safeTotalLen, totalLen)
  lastY = hy + dy * Math.min(safeTotalLen, totalLen)

  return [{ x: hx, y: hy }, { x: lastX, y: lastY }]
}

/** Snap (x,y) to nearest point on polyline by arc length, returning {x,y}. */
function snapToPolyline(
  points: { x: number; y: number }[],
  idx: number,
  spacing: number,
): { x: number; y: number } {
  const segs: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    segs.push(segs[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  const total = segs[segs.length - 1]
  const target = Math.min((idx + 1) * spacing, total)
  return pointAlong(points, total > 0 ? target / total : 0)
}

// ─── Label placement ──────────────────────────────────────────────────────────

/**
 * Run a deterministic label placement pass over all stations in a layout.
 *
 * `unitsPerPx` (layout units per screen pixel; default 1) scales every label box
 * dimension and offset used for collision checks.
 *
 * A label box (name, and for portal stations the "not measured yet" sub-label under it)
 * is accepted only when it clears: the hub, EVERY line segment (own line included),
 * EVERY station circle (own included) and every label already placed. Sides are tried in
 * `labelSideOrder(line.angle, indexOnLine)` order.
 *
 * Portal stations first look for a side where name AND sub-label fit; failing that the name
 * is placed alone (`subLabelVisible = false`). Hidden labels reserve no space.
 *
 * Iteration order gives priority to the first station on each line before the
 * second, third, etc. — so the busiest station on each line (sorted tx-desc
 * inside layoutTransitMap) is placed before later stations on that same line.
 *
 * Returns a new LayoutResult with cloned Station objects (labelSide, labelHidden,
 * subLabelVisible updated). The input layout is NOT mutated.
 */
export function placeLabels(layout: LayoutResult, unitsPerPx = 1): LayoutResult {
  const k = unitsPerPx

  // Deep-clone stations so the input is not mutated
  const lines: Line[] = layout.lines.map(line => ({
    ...line,
    stations: line.stations.map(s => ({ ...s })),
  }))

  // Obstacles: hub, every polyline segment, every station circle.
  const hubObs = hubBox(layout.hub, HUB_COLLISION_R * k)
  const segments: Array<[Pt, Pt]> = []
  const circles: LabelBox[] = []
  for (const line of lines) {
    for (let i = 1; i < line.points.length; i++) {
      segments.push([line.points[i - 1], line.points[i]])
    }
    for (const s of line.stations) circles.push(stationCircleBox(s, 5 * k))
  }

  const placedLabels: LabelBox[] = []

  const isFree = (box: LabelBox): boolean => {
    if (boxesOverlap(box, hubObs)) return false
    for (const [p, q] of segments) if (segmentHitsBox(p, q, box)) return false
    for (const cb of circles) if (boxesOverlap(box, cb)) return false
    for (const lb of placedLabels) if (boxesOverlap(box, lb)) return false
    return true
  }

  // Interleaved priority order: index 0 of every line first, then index 1, …
  const maxLen = lines.reduce((m, l) => Math.max(m, l.stations.length), 0)
  const ordered: Array<{ s: Station; line: Line; index: number }> = []
  for (let idx = 0; idx < maxLen; idx++) {
    for (const line of lines) {
      if (idx < line.stations.length) ordered.push({ s: line.stations[idx], line, index: idx })
    }
  }

  interface Option { cand: LabelCandidate; withSub: boolean }
  interface Job { s: Station; order: LabelSide[]; options: Option[]; first: boolean }

  const jobs: Job[] = ordered.map(({ s, line, index }) => {
    const order = labelSideOrder(line.angle, index)
    const hasSub = line.dashed || s.id.startsWith('portal:')
    const cands = labelCandidates(order, s, layout.hub)
    const options: Option[] = []
    if (hasSub) for (const cand of cands) options.push({ cand, withSub: true })
    for (const cand of cands) options.push({ cand, withSub: false })
    return { s, order, options, first: index === 0 }
  })

  const geomOf = (s: Station, o: Option) => ({ ...s, labelSide: o.cand.side, labelAlign: o.cand.align })

  const fits = (s: Station, o: Option): boolean => {
    const g = geomOf(s, o)
    return isFree(labelBoxK(g, k)) && (!o.withSub || isFree(subLabelBox(g, k)))
  }

  /** Apply option to the station and reserve its boxes; returns how many boxes were reserved. */
  const commit = (s: Station, o: Option): number => {
    s.labelSide = o.cand.side
    if (o.cand.align) s.labelAlign = o.cand.align
    else delete s.labelAlign
    s.labelHidden = false
    s.subLabelVisible = o.withSub
    placedLabels.push(labelBoxK(s, k))
    if (o.withSub) placedLabels.push(subLabelBox(s, k))
    return o.withSub ? 2 : 1
  }

  const hide = (j: Job): void => {
    j.s.labelSide = j.order[0]
    delete j.s.labelAlign
    j.s.labelHidden = true
    j.s.subLabelVisible = false
  }

  // Pass 1: the first station of every line must keep a visible label. Depth-first search in
  // preference order (so it equals the plain greedy result whenever greedy already succeeds),
  // backtracking when a later first station would be left without any free position. The node
  // budget keeps it bounded and deterministic; on failure we fall back to plain greedy below.
  const firsts = jobs.filter(j => j.first)
  let budget = 5000
  const search = (i: number): boolean => {
    if (i === firsts.length) return true
    for (const o of firsts[i].options) {
      if (budget-- <= 0) return false
      if (!fits(firsts[i].s, o)) continue
      const n = commit(firsts[i].s, o)
      if (search(i + 1)) return true
      placedLabels.length -= n
    }
    return false
  }
  // On success every first station already carries its chosen option (the last commit per
  // station is the one on the successful path) and placedLabels holds exactly their boxes.
  const solved = search(0)

  // Pass 2: everything else (and, if the search failed, the first stations too), greedy.
  for (const j of jobs) {
    if (solved && j.first) continue
    const o = j.options.find(opt => fits(j.s, opt))
    if (o) commit(j.s, o)
    else hide(j)
  }

  return { hub: layout.hub, lines }
}

// ─── Geometry engine (internal) ───────────────────────────────────────────────

/**
 * Build the geometric layout: station positions, polylines, hub.
 * Stations are assigned their preferred labelSide and labelHidden=false.
 * Callers must call placeLabels() to resolve collisions.
 */
function _buildGeometry(
  lineInputs: { key: string; dashed?: boolean; stations: StationInput[] }[],
  opts: LayoutOptions,
): LayoutResult {
  const { width, height } = opts

  // Adaptive spacing: when opts.spacing is not provided, pick a larger spacing
  // for layouts with few stations so the map fills the canvas.
  let spacing: number
  if (opts.spacing !== undefined) {
    spacing = Math.max(MIN_SPACING, opts.spacing)
  } else {
    const allStations = lineInputs.reduce((n, l) => Math.max(n, l.stations.length), 0)
    const longestLine = Math.max(allStations, 1)
    const adaptive = Math.floor(Math.min(width, height) / 2 / (longestLine + 1))
    spacing = Math.min(120, Math.max(MIN_SPACING, adaptive))
  }

  const hub = { x: Math.round(width / 2), y: Math.round(height / 2) }

  // Filter empty lines
  const nonEmpty = lineInputs.filter(l => l.stations.length > 0)

  // ── Direction assignment ───────────────────────────────────────────────────
  const dashedLines = nonEmpty.filter(l => l.dashed)
  const categoryLines = nonEmpty.filter(l => !l.dashed)

  const sortedCat = [...categoryLines].sort((a, b) => b.stations.length - a.stations.length)

  const angleMap = new Map<string, number>()
  for (let i = 0; i < sortedCat.length; i++) {
    angleMap.set(sortedCat[i].key, DIRECTION_PRIORITY[i % DIRECTION_PRIORITY.length])
  }
  for (const l of dashedLines) {
    angleMap.set(l.key, DASHED_LINE_ANGLE)
  }

  // Collect all placed stations for inter-line distance checks
  const placed: { x: number; y: number }[] = []

  const lines: Line[] = []

  for (const li of nonEmpty) {
    const angle = angleMap.get(li.key) ?? 0

    // Sort stations: tx desc, then name asc
    const sorted = [...li.stations].sort((a, b) =>
      b.tx !== a.tx ? b.tx - a.tx : a.name.localeCompare(b.name, 'en-US'),
    )

    const n = sorted.length
    const maxTx = sorted[0]?.tx ?? 0

    // Determine effective spacing (may shrink if line overflows)
    let effectiveSpacing = spacing
    {
      const polyTest = buildPolyline(hub.x, hub.y, angle, n, effectiveSpacing, width, height)
      const lastPt = snapToPolyline(polyTest, n - 1, effectiveSpacing)
      const inBounds = (p: { x: number; y: number }) =>
        p.x >= MARGIN && p.x <= width - MARGIN && p.y >= MARGIN && p.y <= height - MARGIN
      if (!inBounds(lastPt)) {
        for (let s = effectiveSpacing - 4; s >= MIN_SPACING; s -= 4) {
          const poly2 = buildPolyline(hub.x, hub.y, angle, n, s, width, height)
          const last2 = snapToPolyline(poly2, n - 1, s)
          if (inBounds(last2)) {
            effectiveSpacing = s
            break
          }
          if (s <= MIN_SPACING) {
            effectiveSpacing = MIN_SPACING
          }
        }
      }
    }

    // Hub-clearance offset: station i sits at distance (1.5 + i) * spacing from hub.
    const stationDist = (i: number) => (1.5 + i) * effectiveSpacing

    const totalLenWithOffset = stationDist(n - 1)
    const polylineWithOffset = buildPolyline(
      hub.x, hub.y, angle, Math.ceil(totalLenWithOffset / effectiveSpacing), effectiveSpacing, width, height,
    )

    function snapDist(poly: { x: number; y: number }[], dist: number): { x: number; y: number } {
      const segs: number[] = [0]
      for (let i = 1; i < poly.length; i++) {
        const dx = poly[i].x - poly[i - 1].x
        const dy = poly[i].y - poly[i - 1].y
        segs.push(segs[i - 1] + Math.sqrt(dx * dx + dy * dy))
      }
      const total = segs[segs.length - 1]
      if (total === 0) return { ...poly[0] }
      return pointAlong(poly, Math.min(dist, total) / total)
    }

    const stations: Station[] = sorted.map((s, i) => {
      let { x, y } = snapDist(polylineWithOffset, stationDist(i))

      x = Math.min(width - MARGIN, Math.max(MARGIN, x))
      y = Math.min(height - MARGIN, Math.max(MARGIN, y))

      const rad = (angle * Math.PI) / 180
      const pdx = Math.cos(rad)
      const pdy = -Math.sin(rad)
      for (let pass = 0; pass < 8; pass++) {
        let anyConflict = false
        for (const p of placed) {
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2)
          if (dist < MIN_INTER_LINE_DIST && dist > 0) {
            anyConflict = true
            const nudge = MIN_INTER_LINE_DIST - dist
            x += pdx * nudge
            y += pdy * nudge
            x = Math.min(width - MARGIN, Math.max(MARGIN, x))
            y = Math.min(height - MARGIN, Math.max(MARGIN, y))
          }
        }
        if (!anyConflict) break
      }

      placed.push({ x, y })

      return {
        id: s.id,
        name: s.name,
        line: s.line,
        tx: s.tx,
        wallets: s.wallets,
        hollow: s.hollow ?? s.tx === 0,
        x,
        y,
        r: stationRadius(s.hollow || s.tx === 0 ? 0 : s.tx, maxTx),
        labelSide: labelSideOrder(angle, i)[0],
        labelHidden: false,
        subLabelVisible: false,
      }
    })

    const totalTx = stations.reduce((acc, s) => acc + s.tx, 0)

    lines.push({
      key: li.key,
      angle,
      points: polylineWithOffset,
      stations,
      totalTx,
      dashed: li.dashed ?? false,
    })
  }

  return { hub, lines }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the geometric layout without running label placement.
 * Stations are assigned their preferred labelSide and labelHidden=false.
 *
 * Exported so tests can obtain the pre-placement geometry and verify that
 * placeLabels(buildTransitLayout(…), 1) deepEquals layoutTransitMap(…).
 */
export function buildTransitLayout(
  lineInputs: { key: string; dashed?: boolean; stations: StationInput[] }[],
  opts: LayoutOptions,
): LayoutResult {
  return _buildGeometry(lineInputs, opts)
}

/**
 * Main layout function. Computes geometry then runs label placement at k=1.
 *
 * Rules:
 * - Stations sorted by tx desc then name asc within each line.
 * - The first station on each line is placed at 1.5× spacing from the hub
 *   so its label clears the hub halo.
 * - Consecutive stations are exactly `spacing` apart along the polyline thereafter.
 * - All stations stay inside [margin, width-margin] × [margin, height-margin].
 * - Empty lines omitted.
 * - 7 lines get 7 of the 8 octilinear directions; lines with more stations get the
 *   horizontal/diagonal directions (more label room). Dashed portal line gets 270°.
 * - Label sides are assigned by a deterministic collision-avoidance pass (k=1);
 *   irresolvable collisions produce labelHidden=true.
 * - Spacing reduced for overflowing lines (never below MIN_SPACING).
 */
export function layoutTransitMap(
  lineInputs: { key: string; dashed?: boolean; stations: StationInput[] }[],
  opts: LayoutOptions,
): LayoutResult {
  return placeLabels(_buildGeometry(lineInputs, opts), 1)
}
