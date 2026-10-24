/**
 * Comets for the Arc galaxy: the data shape and the painting. The scene owns where the endpoints are.
 * Transaction comets are category-coloured; CCTP comets are brighter, longer and periwinkle-white.
 */
import { cometPath, pointOnBezier, type Point } from '@/lib/orbitMap'

/** Where a comet starts or ends. Resolved to a screen point every frame, so it follows moving planets and ports. */
export type Endpoint =
  | { t: 'edge'; angle: number }
  | { t: 'core' }
  | { t: 'ring'; angle: number }
  | { t: 'node'; key: string }

export interface Comet {
  kind: 'tx' | 'in' | 'out'
  start: number
  life: number
  seed: number
  color: string
  from: Endpoint
  to: Endpoint
  /** What lights up on arrival: a node key, 'core', or 'ring'. */
  flashKey: string
  usdc: number | null
  pill: string | null
  flashed: boolean
}

export const CCTP_COLOR = '#dfeaff'
export const TX_TRAIL_POINTS = 24
export const CCTP_TRAIL_POINTS = 38

export const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t)
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

/** Points along the comet's curve from its head (index 0) back to its tail. */
export function trailOf(c: Comet, from: Point, to: Point, p: number, points: number, step: number): Point[] {
  const ctrl = cometPath(from, to, c.seed)
  const trail: Point[] = []
  for (let k = 0; k < points; k++) trail.push(pointOnBezier(from, ctrl, to, easeInOut(Math.max(0, p - k * step))))
  return trail
}

/**
 * Paints one comet.
 *
 * At quality 0 (full): caller has already switched to 'lighter' blending — identical to the original.
 * At quality ≥ 2: caller uses normal 'source-over' blending to avoid GPU overdraw on Safari; fewer
 *   trail segments are drawn and the head glow is smaller.
 *
 * @param quality  0 = full, 1 = reduced (same paint path, fewer points handled by caller),
 *                 2 = minimal (normal blend, compact paint).
 */
export function paintComet(ctx: CanvasRenderingContext2D, c: Comet, trail: Point[], fade: number, quality = 0) {
  const cctp = c.kind !== 'tx'
  const n = trail.length

  if (quality >= 2) {
    // Minimal path: normal compositing, no additive glow — just a dim streak and a small head dot.
    ctx.strokeStyle = c.color
    for (let k = 0; k < n - 1; k++) {
      const q = 1 - k / n
      ctx.globalAlpha = fade * q * q * (cctp ? 0.55 : 0.45)
      ctx.lineWidth = cctp ? 0.5 + 1.8 * q : 0.4 + 1.4 * q
      ctx.beginPath()
      ctx.moveTo(trail[k].x, trail[k].y)
      ctx.lineTo(trail[k + 1].x, trail[k + 1].y)
      ctx.stroke()
    }
    const head = trail[0]
    ctx.globalAlpha = fade * 0.8
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(head.x, head.y, cctp ? 2.0 : 1.4, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  // Full / reduced path: additive blending assumed by caller.
  ctx.strokeStyle = c.color
  for (let k = 0; k < n - 1; k++) {
    const q = 1 - k / n
    ctx.globalAlpha = fade * q * q * (cctp ? 1 : 0.9)
    ctx.lineWidth = cctp ? 0.8 + 4 * q : 0.6 + 2.6 * q
    ctx.beginPath()
    ctx.moveTo(trail[k].x, trail[k].y)
    ctx.lineTo(trail[k + 1].x, trail[k + 1].y)
    ctx.stroke()
  }
  const head = trail[0]
  ctx.globalAlpha = fade
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(head.x, head.y, cctp ? 3.2 : 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = fade * (cctp ? 0.45 : 0.35)
  ctx.fillStyle = c.color
  ctx.beginPath()
  ctx.arc(head.x, head.y, cctp ? 11 : 6, 0, Math.PI * 2)
  ctx.fill()
}

/** Dark rounded pill with the value, drawn near a comet's head. */
export function paintPill(
  ctx: CanvasRenderingContext2D, c: Comet, head: Point, stageW: number, stageH: number, text: string,
) {
  if (!c.pill) return
  ctx.font = '11px "Geist Mono", ui-monospace, monospace'
  const pw = ctx.measureText(c.pill).width + 16
  const ph = 20
  const x = Math.min(stageW - pw - 8, Math.max(8, head.x + 12))
  const y = Math.min(stageH - ph - 8, Math.max(8, head.y - 28))
  ctx.beginPath()
  ctx.roundRect(x, y, pw, ph, 10)
  ctx.fillStyle = 'rgba(8,17,31,0.88)'
  ctx.fill()
  ctx.strokeStyle = c.color
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = text
  ctx.textAlign = 'left'
  ctx.fillText(c.pill, x + 8, y + 14)
}
