/**
 * Imperative canvas engine for the Arc Orbit. React owns data and panels; this owns pixels.
 * One requestAnimationFrame loop, no React state per frame, at most MAX_COMETS comets alive.
 */
import { compact } from '@/lib/numberFormat'
import {
  CATEGORY_COLORS, FLATTEN, TILT,
  cometPath, ellipsePoint, flattenFor, mulberry32, orbitRadii, planetAngle, planetRadius,
  placeLabels, pointOnBezier, seedFromString,
  type Blocker, type LabelItem, type OrbitKey, type Point,
} from '@/lib/orbitMap'

export const MAX_COMETS = 400
const TRAIL_POINTS = 24
const PULSE_MS = 1600
const FLASH_MS = 520
const NARROW = 640

export interface ScenePlanet { id: string; name: string; category: string; tx: number }
export interface SceneData {
  /** Category names from the core outward; "Unlisted" is always appended as the outermost orbit. */
  order: string[]
  planets: ScenePlanet[]
  /** Orbit label per orbit key, e.g. "DeFi · 32%". */
  labels: Record<string, string>
}
export interface SceneTx { appId: string | null; category: string | null; usdc: number | null }

interface Orbit { key: string; rx: number; ry: number; phase: number; color: string; label: string }
interface PlacedPlanet extends ScenePlanet {
  orbit: number; index: number; count: number; r: number; color: string; showLabel: boolean; x: number; y: number
}
interface Comet {
  start: number; life: number; from: Point; seed: number; color: string
  planetId: string | null; fixed: Point; flashKey: string
  usdc: number | null; pill: string | null; flashed: boolean
}

const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t)
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function formatPill(usdc: number, target: string): string {
  const amount = usdc < 0.01 ? '<$0.01' : `$${compact(usdc)}`
  return `${amount} USDC → ${target}`
}

export class OrbitScene {
  private ctx: CanvasRenderingContext2D
  private w = 0
  private h = 0
  private dpr = 1
  private data: SceneData = { order: [], planets: [], labels: {} }
  private orbits: Orbit[] = []
  private planets: PlacedPlanet[] = []
  private byId = new Map<string, PlacedPlanet>()
  private comets: Comet[] = []
  private pulses: number[] = []
  private flashes = new Map<string, number>()
  private stars: HTMLCanvasElement | null = null
  private raf = 0
  private active = false
  private reduced = false
  private t0 = performance.now()
  private selectedId: string | null = null
  private hoverId: string | null = null
  private faint = '#8397b1'
  private text = '#eaf1fb'
  private core = '#a9c4ea'
  private sans = 'system-ui, sans-serif'

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
    this.faint = cssVar('--faint', this.faint)
    this.text = cssVar('--text', this.text)
    this.core = cssVar('--periwinkle', this.core)
    this.sans = getComputedStyle(canvas).fontFamily || this.sans
  }

  // ── public API ────────────────────────────────────────────────────────────
  setData(data: SceneData) { this.data = data; this.layout() }
  setReducedMotion(v: boolean) { this.reduced = v; if (v) this.comets = [] }
  setSelected(id: string | null) { this.selectedId = id }
  setHover(id: string | null) { this.hoverId = id }

  /** Pixels from the bottom of the canvas that pills must not enter (0 = no restriction). */
  private reservedBottom = 0

  setReservedBottom(px: number) { this.reservedBottom = Math.max(0, px) }

  resize(w: number, h: number, dpr: number) {
    this.w = Math.max(1, Math.floor(w))
    this.h = Math.max(1, Math.floor(h))
    this.dpr = Math.min(2, Math.max(1, dpr))
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    this.stars = this.buildStars()
    this.layout()
    if (!this.active) this.drawFrame(performance.now())
  }

  setActive(active: boolean) {
    this.active = active
    if (active && !this.raf) this.raf = requestAnimationFrame(this.loop)
    if (!active && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0 }
  }

  destroy() { this.setActive(false); this.comets = []; this.pulses = [] }

  /** One pulse ring per block (staggered when several arrive together) and one comet per transaction. */
  addBlock(blockNumber: number, txs: SceneTx[], batchIndex: number) {
    const now = performance.now()
    if (!this.reduced) this.pulses.push(now + batchIndex * 200)
    if (this.pulses.length > 24) this.pulses.splice(0, this.pulses.length - 24)
    const unlisted = this.orbits[this.orbits.length - 1]
    txs.forEach((tx, i) => {
      const planet = tx.appId ? this.byId.get(tx.appId) : undefined
      const key = planet ? planet.id : 'orbit:Unlisted'
      if (this.reduced) { this.flashes.set(key, now); return }
      const rng = mulberry32(seedFromString(`${blockNumber}:${i}`))
      const angle = rng() * Math.PI * 2
      const life = 1600 + rng() * 800
      const delay = rng() * 1200
      const color = planet ? planet.color : CATEGORY_COLORS.Unlisted
      const fixed = unlisted && !planet
        ? ellipsePoint(this.w / 2, this.h / 2, unlisted.rx, unlisted.ry, TILT, rng() * Math.PI * 2)
        : { x: this.w / 2, y: this.h / 2 }
      const pill = tx.usdc === null ? null : formatPill(tx.usdc, planet ? planet.name : 'unlisted address')
      this.comets.push({
        start: now + delay, life, seed: seedFromString(`${blockNumber}:${i}:path`), color,
        from: ellipsePoint(this.w / 2, this.h / 2, this.w / 2, this.h / 2, 0, angle),
        planetId: planet ? planet.id : null, fixed, flashKey: key, usdc: tx.usdc, pill, flashed: false,
      })
    })
    if (this.comets.length > MAX_COMETS) this.comets.splice(0, this.comets.length - MAX_COMETS)
  }

  /** The planet under a CSS-pixel point, if any. Touch events use a larger radius. */
  hit(x: number, y: number, pointerType?: string): string | null {
    const baseRadius = pointerType === 'touch' ? 20 : 0
    let best: string | null = null
    let bestD = Infinity
    for (const p of this.planets) {
      const d = Math.hypot(p.x - x, p.y - y)
      const hitR = Math.max(14, p.r + 6, baseRadius)
      if (d <= hitR && d < bestD) { best = p.id; bestD = d }
    }
    return best
  }

  // ── layout ────────────────────────────────────────────────────────────────
  private layout() {
    if (!this.w || !this.h) return
    const keys = [...this.data.order, 'Unlisted']
    const fy = flattenFor(this.w, this.h)
    const radii = orbitRadii(keys.length, this.w, this.h * 0.94, 16, fy)
    this.orbits = keys.map((key, i) => ({
      key, rx: radii[i], ry: radii[i] * fy, phase: i * 1.3,
      color: CATEGORY_COLORS[key as OrbitKey] ?? CATEGORY_COLORS.Unlisted,
      label: this.data.labels[key] ?? key,
    }))
    const maxTx = this.data.planets.reduce((m, p) => Math.max(m, p.tx), 0)
    const labelled = new Set(
      this.data.planets
        .map((p, i) => ({ id: p.id, tx: p.tx, i }))
        .sort((a, b) => b.tx - a.tx || a.i - b.i)
        .slice(0, this.w < NARROW ? 4 : 8)
        .map(p => p.id),
    )
    const placed: PlacedPlanet[] = []
    this.data.order.forEach((cat, orbit) => {
      const inOrbit = this.data.planets.filter(p => p.category === cat)
      inOrbit.forEach((p, index) => placed.push({
        ...p, orbit, index, count: inOrbit.length, r: planetRadius(p.tx, maxTx),
        color: CATEGORY_COLORS[cat as OrbitKey] ?? CATEGORY_COLORS.Unlisted,
        showLabel: labelled.has(p.id), x: this.w / 2, y: this.h / 2,
      }))
    })
    this.planets = placed
    this.byId = new Map(placed.map(p => [p.id, p]))
    this.place(0)
  }

  private place(tSec: number) {
    const cx = this.w / 2
    const cy = this.h / 2
    for (const p of this.planets) {
      const o = this.orbits[p.orbit]
      if (!o) continue
      const pt = ellipsePoint(cx, cy, o.rx, o.ry, TILT, planetAngle(p.index, p.count, o.phase, tSec, o.rx))
      p.x = pt.x
      p.y = pt.y
    }
  }

  private buildStars(): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = Math.round(this.w * this.dpr)
    c.height = Math.round(this.h * this.dpr)
    const g = c.getContext('2d')
    if (!g) return c
    g.scale(this.dpr, this.dpr)
    const rng = mulberry32(140)
    for (let i = 0; i < 140; i++) {
      const x = rng() * this.w
      const y = rng() * this.h
      const r = 0.4 + rng() * 0.8
      g.globalAlpha = 0.12 + rng() * 0.38
      g.fillStyle = rng() < 0.2 ? this.core : '#ffffff'
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    return c
  }

  // ── frame ─────────────────────────────────────────────────────────────────
  private loop = (now: number) => {
    this.raf = 0
    if (!this.active) return
    this.drawFrame(now)
    this.raf = requestAnimationFrame(this.loop)
  }

  private drawFrame(now: number) {
    const { ctx, w, h } = this
    if (!w || !h) return
    const tSec = this.reduced ? 0 : (now - this.t0) / 1000
    this.place(tSec)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = 1
    if (this.stars) ctx.drawImage(this.stars, 0, 0, w, h)
    this.drawOrbits(now)
    this.drawPulses(now)
    this.drawCore(tSec)
    this.drawPlanets(now)
    this.drawComets(now)
  }

  private drawOrbits(now: number) {
    const { ctx } = this
    const cx = this.w / 2
    const cy = this.h / 2
    const fontSize = this.w < NARROW ? 9 : 10
    ctx.font = `${fontSize}px "Geist Mono", ui-monospace, monospace`
    ctx.textBaseline = 'alphabetic'

    // Draw ellipses first.
    this.orbits.forEach(o => {
      const flash = this.flashes.get(`orbit:${o.key}`)
      const boost = flash !== undefined && now - flash < FLASH_MS ? 0.45 * (1 - (now - flash) / FLASH_MS) : 0
      ctx.beginPath()
      ctx.ellipse(cx, cy, o.rx, o.ry, TILT, 0, Math.PI * 2)
      ctx.setLineDash(o.key === 'Unlisted' ? [4, 7] : [])
      ctx.strokeStyle = o.color
      ctx.globalAlpha = 0.2 + boost
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
    })
    ctx.globalAlpha = 1

    // Build label boxes anchored at the orbit's top-left arc point (angle 200° = 200*π/180).
    // Priority: orbit labels are highest so they are placed first.
    const LABEL_ANGLE = (200 * Math.PI) / 180
    const labelItems: LabelItem[] = this.orbits.map((o, i) => {
      const pt = ellipsePoint(cx, cy, o.rx, o.ry, TILT, LABEL_ANGLE)
      const tw = ctx.measureText(o.label).width
      const lh = fontSize + 4  // text height approx
      // place text to the left of the arc point
      const x0 = pt.x - tw - 4
      const y0 = pt.y - lh / 2
      return { id: `orbit:${i}`, x: x0, y: y0, w: tw, h: lh, priority: 1000 + i }
    })

    // Core glow blocker: the radial gradient extends to coreR*3.4.
    const coreR = this.coreRadius()
    const coreGlowR = coreR * 3.4
    const coreBlocker: Blocker = {
      x: cx - coreGlowR, y: cy - coreGlowR, w: coreGlowR * 2, h: coreGlowR * 2,
    }
    // Planet disc blockers (fixed positions from last place() call).
    const planetBlockers: Blocker[] = this.planets.map(p => ({
      x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2,
    }))
    const blockers: Blocker[] = [coreBlocker, ...planetBlockers]

    // Filter: also exclude labels that bleed off canvas edges.
    const inCanvas = (item: LabelItem) => item.x >= 2 && item.x + item.w <= this.w - 2
    const visible = placeLabels(labelItems.filter(inCanvas), blockers)

    ctx.fillStyle = this.faint
    ctx.textAlign = 'left'
    this.orbits.forEach((o, i) => {
      if (!visible.has(`orbit:${i}`)) return
      const item = labelItems[i]
      ctx.globalAlpha = 1
      // baseline sits at bottom of the box
      ctx.fillText(o.label, item.x, item.y + item.h - 2)
    })
    ctx.globalAlpha = 1
  }

  private pulseRadius(): number {
    const outer = this.orbits[this.orbits.length - 1]
    return (outer ? outer.rx : 200) * 0.8
  }

  private drawPulses(now: number) {
    const { ctx } = this
    const cx = this.w / 2
    const cy = this.h / 2
    const coreR = this.coreRadius()
    ctx.strokeStyle = this.core
    ctx.lineWidth = 1.5
    if (this.reduced) {
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.ellipse(cx, cy, coreR * 2.2, coreR * 2.2 * FLATTEN, TILT, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
      return
    }
    this.pulses = this.pulses.filter(s => now - s < PULSE_MS)
    const max = this.pulseRadius()
    for (const start of this.pulses) {
      const p = (now - start) / PULSE_MS
      if (p < 0) continue
      const r = coreR + easeOut(p) * (max - coreR)
      ctx.globalAlpha = 0.55 * (1 - p) * (1 - p)
      ctx.beginPath()
      ctx.ellipse(cx, cy, r, r * FLATTEN, TILT, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private coreRadius(): number { return this.w < NARROW ? 20 : 30 }

  private drawCore(tSec: number) {
    const { ctx } = this
    const cx = this.w / 2
    const cy = this.h / 2
    const r = this.coreRadius()
    const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 3.4)
    glow.addColorStop(0, 'rgba(169,196,234,0.38)')
    glow.addColorStop(1, 'rgba(169,196,234,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, r * 3.4, 0, Math.PI * 2)
    ctx.fill()

    const disc = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r)
    disc.addColorStop(0, '#e4eefb')
    disc.addColorStop(0.55, this.core)
    disc.addColorStop(1, '#6f93c4')
    ctx.fillStyle = disc
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()

    // Slow inner swirl.
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.translate(cx, cy)
    ctx.rotate(tSec * 0.25)
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#ffffff'
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3)
      ctx.globalAlpha = 0.34
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(r * 0.18, 0, r * 0.62, -0.2, 1.7)
      ctx.stroke()
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }

  private drawPlanets(now: number) {
    const { ctx } = this
    ctx.font = `11px ${this.sans}`
    ctx.textAlign = 'left'
    for (const p of this.planets) {
      const flash = this.flashes.get(p.id)
      const f = flash !== undefined && now - flash < FLASH_MS ? 1 - (now - flash) / FLASH_MS : 0
      const focus = p.id === this.hoverId || p.id === this.selectedId
      if (f > 0) {
        ctx.globalAlpha = 0.7 * f
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r + 3 + (1 - f) * 14, 0, Math.PI * 2)
        ctx.stroke()
      }
      const halo = ctx.createRadialGradient(p.x, p.y, p.r * 0.5, p.x, p.y, p.r * 2.6)
      halo.addColorStop(0, p.color)
      halo.addColorStop(1, 'rgba(8,17,31,0)')
      ctx.globalAlpha = 0.28 + 0.4 * f
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = f > 0.4 ? '#ffffff' : p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
      if (focus) {
        ctx.strokeStyle = this.text
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (p.showLabel || focus) {
        ctx.fillStyle = focus ? this.text : this.faint
        ctx.fillText(p.name, p.x + p.r + 7, p.y + 4)
      }
    }
    ctx.globalAlpha = 1
  }

  private drawComets(now: number) {
    if (this.reduced) return
    const { ctx } = this
    const live: Comet[] = []
    const pills: Array<{ c: Comet; head: Point }> = []
    const heavy = this.comets.length > 150
    const pts = heavy ? 12 : TRAIL_POINTS
    const dp = 0.018 * (TRAIL_POINTS / pts)
    ctx.lineCap = 'round'
    ctx.globalCompositeOperation = 'lighter'
    for (const c of this.comets) {
      const p = (now - c.start) / c.life
      if (p < 0) { live.push(c); continue }
      const target = c.planetId ? this.byId.get(c.planetId) : undefined
      const to: Point = target ? { x: target.x, y: target.y } : c.fixed
      if (p >= 1) {
        if (!c.flashed && p < 1.15) this.flashes.set(c.flashKey, now)
        continue
      }
      if (p >= 0.92 && !c.flashed) { c.flashed = true; this.flashes.set(c.flashKey, now) }
      live.push(c)
      const ctrl = cometPath(c.from, to, c.seed)
      const fade = p < 0.8 ? 1 : (1 - p) / 0.2
      const trail: Point[] = []
      for (let k = 0; k < pts; k++) trail.push(pointOnBezier(c.from, ctrl, to, easeInOut(Math.max(0, p - k * dp))))
      ctx.strokeStyle = c.color
      for (let k = 0; k < pts - 1; k++) {
        const q = 1 - k / pts
        ctx.globalAlpha = fade * q * q * 0.9
        ctx.lineWidth = 0.6 + 2.6 * q
        ctx.beginPath()
        ctx.moveTo(trail[k].x, trail[k].y)
        ctx.lineTo(trail[k + 1].x, trail[k + 1].y)
        ctx.stroke()
      }
      const head = trail[0]
      ctx.globalAlpha = fade
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = fade * 0.35
      ctx.fillStyle = c.color
      ctx.beginPath()
      ctx.arc(head.x, head.y, 6, 0, Math.PI * 2)
      ctx.fill()

      if (c.pill && p < 0.95) this.keepTopPills(pills, { c, head })
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    this.comets = live
    for (const { c, head } of pills) this.drawPill(c, head)
  }

  private keepTopPills(list: Array<{ c: Comet; head: Point }>, item: { c: Comet; head: Point }) {
    list.push(item)
    list.sort((a, b) => (b.c.usdc ?? 0) - (a.c.usdc ?? 0))
    const maxPills = this.w < NARROW ? 1 : 3
    if (list.length > maxPills) list.length = maxPills
  }

  private drawPill(c: Comet, head: Point) {
    if (!c.pill) return
    const { ctx } = this
    ctx.font = '11px "Geist Mono", ui-monospace, monospace'
    const tw = ctx.measureText(c.pill).width
    const pw = tw + 16
    const ph = 20
    const x = Math.min(this.w - pw - 8, Math.max(8, head.x + 12))
    // Pill box must end above (h − reservedBottom); add an 8 px gap above that boundary.
    const maxY = this.h - this.reservedBottom - ph - 8
    const y = Math.min(maxY, Math.max(8, head.y - 28))
    ctx.beginPath()
    ctx.roundRect(x, y, pw, ph, 10)
    ctx.fillStyle = 'rgba(8,17,31,0.88)'
    ctx.fill()
    ctx.strokeStyle = c.color
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = this.text
    ctx.textAlign = 'left'
    ctx.fillText(c.pill, x + 8, y + 14)
  }
}
