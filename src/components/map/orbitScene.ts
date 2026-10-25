/**
 * Imperative engine for the Arc galaxy on the map. It is the landing hero's technique: a Canvas-2D dust
 * spiral around the Arc core, with DOM planets and ports positioned from the same projection every frame.
 * React owns data and panels; this owns pixels and per-frame positions (no React state per frame).
 * Layers, bottom to top: dust and rings, comets (canvas), planets and ports (DOM), core (DOM).
 *
 * Safari performance notes:
 * - Canvas DPR is capped via canvasDpr() so total pixel budget stays ≤ 2_400_000.
 * - Haze fog uses pre-rendered offscreen sprites (one per size bucket, rebuilt when zoom changes > 3%).
 * - Core glow uses a single offscreen sprite, rebuilt on resize.
 * - Dust is batched: filled dots grouped by tone+alpha bucket with one beginPath/fill per group.
 * - QualityGovernor reduces draw work when frame time exceeds thresholds.
 * - globalCompositeOperation 'lighter' is disabled at quality level 2.
 */
import { DISC, makeDust, type Dust } from '@/lib/arcFieldMath'
import {
  CATEGORY_COLORS, FIELD_ROLL, FIELD_TILT, PORT_COUNT_NARROW,
  QualityGovernor,
  appRingRadii, bridgePill, canvasDpr, cctpPill, ellipseExtent, ellipsePoint, mulberry32, pillAmount, projectPoint, ringSpeed,
  scatterNodes, seedFromString, placeLabels, type BridgeColorKey, type LabelItem, type Blocker, type OrbitKey, type Point,
} from '@/lib/orbitMap'
import {
  CCTP_COLOR, CCTP_TRAIL_POINTS, TX_TRAIL_POINTS, paintComet, paintPill, trailOf, type Comet, type Endpoint,
} from './cometDraw'
export const MAX_COMETS = 400
export const NARROW = 640

const DUST = 1700
const HAZE = 60
const STARS = 150
const CORE_SCALE = 0.88
const FLASH_MS = 560
const FRAME_MS = 1000 / 60
const PORT_COLOR = '#a9c4ea'
/** Estimated chars × px for planet label width (10 px Geist Mono, 0.14em spacing). */
const LABEL_PX_PER_CHAR = 7.5
const LABEL_H = 14
/** Gap between face bottom and label top (px, unscaled). */
const LABEL_GAP = 6

/** Number of distinct fog radius buckets (matches the (38+(i%5)*9)*zoom series). */
const HAZE_BUCKETS = 5
/** Zoom change threshold that triggers a haze sprite rebuild (3%). */
const HAZE_ZOOM_THRESHOLD = 0.03

export const appKey = (id: string) => `app:${id}`
export const portKey = (domain: number) => `port:${domain}`

export interface SceneRing { key: string; label: string }
export interface SceneApp { id: string; name: string; category: string; ring: number; slot: number; size: number; tx: number }
/** Free-body network port: size drives the visual radius. */
export interface ScenePort { domain: number; name: string; size: number; weight: number }
export interface SceneData { rings: SceneRing[]; apps: SceneApp[]; ports: ScenePort[] }
export interface SceneTx { appId: string | null; category: string | null; usdc: number | null }
export interface SceneMove {
  direction: 'in' | 'out'
  domain: number
  usdc: number | null
  name: string
  bridge?: BridgeColorKey
  color?: string
}
/** DOM the scene moves each frame; React fills it through callback refs. */
export class SceneDom {
  readonly nodes = new Map<string, HTMLElement>()
  core: HTMLElement | null = null
  halo: HTMLElement | null = null
  setNode(key: string, el: HTMLElement | null) { if (el) this.nodes.set(key, el); else this.nodes.delete(key) }
  setCore(el: HTMLElement | null) { this.core = el }
  setHalo(el: HTMLElement | null) { this.halo = el }
}

interface Node {
  key: string; kind: 'app' | 'port'; ring: number; angle: number; size: number; color: string
  hidden: boolean; lift: number; active: boolean; x: number; y: number; scale: number
}

export class OrbitScene {
  private ctx: CanvasRenderingContext2D
  private w = 0
  private h = 0
  private dpr = 1
  private insetRight = 0
  private data: SceneData = { rings: [], apps: [], ports: [] }
  private nodes: Node[] = []
  private byKey = new Map<string, Node>()
  /** Free-body scatter positions for port nodes (stage-space, no zoom applied). Recomputed on resize/layout. */
  private portPositions = new Map<string, Point>()
  private dust: Dust[] = Array.from({ length: DUST }, makeDust)
  private stars = Array.from({ length: STARS }, () => ({
    x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.1, p: Math.random() * Math.PI * 2, v: 0.004 + Math.random() * 0.012,
  }))
  private comets: Comet[] = []
  private flashes = new Map<string, number>()
  private raf = 0
  private active = false
  private reduced = false
  private paused = false
  private last = 0
  private t = 0
  private spin = 0
  private excite = 0
  private exciteTarget = 0
  private px = 0
  private py = 0
  private tx = 0
  private ty = 0
  private cx = 0
  private cy = 0
  private zoom = 1
  private hover: string | null = null
  private selected: string | null = null
  /** Cached .om-label child element per node key, populated lazily each frame. */
  private labelCache = new Map<string, HTMLElement | null>()

  // ── Sprite caches (Safari perf) ──────────────────────────────────────────
  /** Haze fog sprites: one per radius bucket, keyed by bucket index 0–4. Rebuilt when zoom changes > 3%. */
  private hazeSprites: (OffscreenCanvas | null)[] = Array.from({ length: HAZE_BUCKETS }, () => null)
  /** Zoom at which the haze sprites were last built. */
  private hazeSpriteZoom = -1
  /** Core glow sprite. Rebuilt on resize. */
  private coreGlowSprite: OffscreenCanvas | null = null
  /** Core glow sprite's last-built zoom (for rebuild detection). */
  private coreGlowZoom = -1
  /** Core glow sprite's last-built excite level. */
  private coreGlowExcite = -1

  // ── Quality governor (Safari perf) ───────────────────────────────────────
  private governor = new QualityGovernor()
  private quality = 0
  private frameStart = 0

  constructor(private canvas: HTMLCanvasElement, private dom: SceneDom) {
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
    window.addEventListener('pointermove', this.onPointer, { passive: true })
    document.addEventListener('pointerleave', this.onLeave)
  }

  // ── public API ────────────────────────────────────────────────────────────
  setData(data: SceneData) { this.data = data; this.layout(); this.scatterPorts(); this.labelCache.clear() }
  setReducedMotion(v: boolean) { this.reduced = v; if (v) this.comets = [] }
  setPaused(v: boolean) { this.paused = v; if (v) this.comets = [] }
  setHover(key: string | null) { this.hover = key }
  setSelected(key: string | null) { this.selected = key }

  resize(w: number, h: number, dpr: number, insetRight: number) {
    this.w = Math.max(1, Math.floor(w))
    this.h = Math.max(1, Math.floor(h))
    // Apply pixel-budget cap via canvasDpr()
    this.dpr = canvasDpr(this.w, this.h, dpr)
    this.insetRight = Math.max(0, insetRight)
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    this.canvas.style.width = `${this.w}px`
    this.canvas.style.height = `${this.h}px`
    // Invalidate cached sprites on resize
    this.coreGlowSprite = null
    this.coreGlowZoom = -1
    this.coreGlowExcite = -1
    this.hazeSprites = Array.from({ length: HAZE_BUCKETS }, () => null)
    this.hazeSpriteZoom = -1
    this.layout()
    this.scatterPorts()
    if (!this.active) this.frame(performance.now())
  }

  setActive(active: boolean) {
    this.active = active
    if (active && !this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.loop) }
    if (!active && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0 }
  }

  destroy() {
    this.setActive(false)
    this.comets = []
    window.removeEventListener('pointermove', this.onPointer)
    document.removeEventListener('pointerleave', this.onLeave)
  }

  /** One comet per transaction: from the stage edge to its app, or into the outer dashed ring when unlisted. */
  addBlock(blockNumber: number, txs: SceneTx[]) {
    const now = performance.now()
    txs.forEach((tx, i) => {
      const node = tx.appId ? this.byKey.get(appKey(tx.appId)) : undefined
      const flashKey = node ? node.key : 'ring'
      if (this.reduced || this.paused) { this.flashes.set(flashKey, now); return }
      const rng = mulberry32(seedFromString(`${blockNumber}:${i}`))
      const from: Endpoint = { t: 'edge', angle: rng() * Math.PI * 2 }
      const life = 1600 + rng() * 800
      const delay = rng() * 1200
      const to: Endpoint = node ? { t: 'node', key: node.key } : { t: 'ring', angle: rng() * Math.PI * 2 }
      const target = node ? this.data.apps.find(a => appKey(a.id) === node.key)?.name ?? 'app' : 'unlisted address'
      this.push({
        kind: 'tx', start: now + delay, life, seed: seedFromString(`${blockNumber}:${i}:path`),
        color: node ? node.color : CATEGORY_COLORS.Unlisted, from, to, flashKey, usdc: tx.usdc,
        pill: tx.usdc === null ? null : `${pillAmount(tx.usdc)} USDC → ${target}`, flashed: false,
      })
    })
  }

  /** One bright comet per CCTP move: port → core when USDC arrives, core → port when it leaves. */
  addCctp(move: SceneMove, index: number, salt: string) {
    this.addBridgeMove(move, index, salt)
  }

  /** One bright comet per bridge move: port ↔ core, coloured per bridge protocol. */
  addBridgeMove(move: SceneMove, index: number, salt: string) {
    const now = performance.now()
    const node = this.byKey.get(portKey(move.domain))
    const rng = mulberry32(seedFromString(`${salt}:${index}`))
    const port: Endpoint = node && !node.hidden ? { t: 'node', key: node.key } : { t: 'ring', angle: rng() * Math.PI * 2 }
    const inbound = move.direction === 'in'
    const flashKey = inbound ? 'core' : port.t === 'node' ? port.key : 'ring'
    const color = move.color ?? CCTP_COLOR
    if (this.reduced || this.paused) { this.flashes.set(flashKey, now); return }
    const pill = move.bridge && move.bridge !== 'cctp'
      ? bridgePill(move.direction, move.name, move.usdc, move.bridge)
      : cctpPill(move.direction, move.name, move.usdc)
    this.push({
      kind: move.direction, start: now + index * 350 + rng() * 500, life: 2400 + rng() * 700,
      seed: seedFromString(`${salt}:${index}:path`), color,
      from: inbound ? port : { t: 'core' }, to: inbound ? { t: 'core' } : port, flashKey,
      usdc: move.usdc, pill, flashed: false,
    })
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private push(c: Comet) {
    this.comets.push(c)
    if (this.comets.length > MAX_COMETS) this.comets.splice(0, this.comets.length - MAX_COMETS)
  }

  private onPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect()
    if (!r.width || !r.height) return
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    this.tx = ((e.clientX - r.left) / r.width - 0.5) * 2
    this.ty = ((e.clientY - r.top) / r.height - 0.5) * 2
    this.exciteTarget = inside ? 1 : 0
  }
  private onLeave = () => { this.exciteTarget = 0 }

  private get narrow() { return this.w < NARROW }

  /** Planets and ports from the data; app angles survive a data refresh so nothing jumps. */
  private layout() {
    const prev = this.byKey
    const next: Node[] = []
    const keep = (key: string, fallback: number) => prev.get(key)?.angle ?? fallback
    for (const a of this.data.apps) {
      const key = appKey(a.id)
      next.push({
        key, kind: 'app', ring: a.ring, angle: keep(key, a.slot * Math.PI * 2), size: a.size,
        color: CATEGORY_COLORS[a.category as OrbitKey] ?? CATEGORY_COLORS.Unlisted,
        hidden: false, lift: prev.get(key)?.lift ?? 0, active: false, x: 0, y: 0, scale: 1,
      })
    }
    this.data.ports.forEach((p, i) => {
      const key = portKey(p.domain)
      next.push({
        key, kind: 'port', ring: -1, angle: 0, size: p.size, color: PORT_COLOR,
        hidden: this.narrow && i >= PORT_COUNT_NARROW, lift: prev.get(key)?.lift ?? 0, active: false, x: 0, y: 0, scale: 1,
      })
    })
    this.nodes = next
    this.byKey = new Map(next.map(n => [n.key, n]))
  }

  /** Compute free-body scatter positions for all ports, in stage space. */
  private scatterPorts() {
    if (!this.w || !this.h) return
    const radii = this.ringRadii()
    const outerR = (radii[radii.length - 1] ?? DISC * 0.92) * this.zoom
    const keepOut = {
      cx: this.cx,
      cy: this.cy,
      rx: outerR * 1.12,
      ry: outerR * FIELD_TILT * 1.25,
    }
    const scatterInput = this.data.ports
      .filter((_, i) => !(this.narrow && i >= PORT_COUNT_NARROW))
      .map(p => ({ id: portKey(p.domain), r: p.size / 2 }))
    const scattered = scatterNodes(
      scatterInput,
      { w: this.w, h: this.h },
      keepOut,
      seedFromString('map-ports'),
    )
    this.portPositions = scattered
  }

  private loop = (now: number) => {
    this.raf = 0
    if (!this.active) return
    this.frameStart = now
    this.frame(now)
    // Feed frame duration to governor
    const dt = performance.now() - this.frameStart
    this.quality = this.governor.feed(dt)
    this.raf = requestAnimationFrame(this.loop)
  }

  private frame(now: number) {
    const { ctx, w, h } = this
    if (!w || !h) return
    const f = this.last ? Math.min(3, Math.max(0, (now - this.last) / FRAME_MS)) : 1
    this.last = now
    const frozen = this.reduced || this.paused
    const k = 1 - Math.pow(0.95, f)
    this.excite += (this.exciteTarget - this.excite) * k
    if (!frozen) { this.t += (1 + this.excite * 2.2) * f; this.spin += 0.00075 * (1 + this.excite * 3.4) * f }
    this.px += (this.tx - this.px) * k
    this.py += (this.ty - this.py) * k

    const wide = w >= NARROW
    this.zoom = this.computeZoom() * (1 + this.excite * 0.035)
    // Title is now above the stage — galaxy is always centred horizontally.
    this.cx = w * 0.5 + this.px * (18 + this.excite * 16)
    this.cy = h * 0.5 + this.py * (14 + this.excite * 12)

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    this.drawBackdrop()
    this.drawRings()
    this.drawDust()
    this.scatterPorts()
    this.placeNodes(f, frozen)
    this.placeNodeLabels()
    this.drawActiveRingLabel(wide)
    this.drawComets(now)
    this.drawFlashes(now)
    this.placeCore(now)
  }

  private project(r: number, a: number) {
    return projectPoint(r, a, this.cx, this.cy, this.zoom, FIELD_TILT, FIELD_ROLL)
  }

  // ── Offscreen sprite helpers ───────────────────────────────────────────────

  /** Rebuild haze sprites for the 5 radius buckets at current zoom+excite if zoom drifted > threshold. */
  private ensureHazeSprites(excite: number) {
    if (Math.abs(this.zoom - this.hazeSpriteZoom) / Math.max(0.01, this.hazeSpriteZoom) <= HAZE_ZOOM_THRESHOLD) return
    this.hazeSpriteZoom = this.zoom
    for (let b = 0; b < HAZE_BUCKETS; b++) {
      const rad = Math.ceil((38 + b * 9) * this.zoom) + 2
      const size = rad * 2 + 2
      const oc = new OffscreenCanvas(size, size)
      const octx = oc.getContext('2d')
      if (!octx) continue
      const cx = size / 2
      const fog = octx.createRadialGradient(cx, cx, 0, cx, cx, rad)
      fog.addColorStop(0, `rgba(88,140,235,${0.055 + excite * 0.03})`)
      fog.addColorStop(1, 'rgba(88,140,235,0)')
      octx.fillStyle = fog
      octx.beginPath()
      octx.arc(cx, cx, rad, 0, Math.PI * 2)
      octx.fill()
      this.hazeSprites[b] = oc
    }
  }

  /** Draw one haze fog particle using the pre-rendered sprite. */
  private drawHazeSprite(x: number, y: number, bucketIndex: number, alpha: number) {
    const sprite = this.hazeSprites[bucketIndex]
    if (!sprite) return
    const half = sprite.width / 2
    this.ctx.globalAlpha = alpha
    this.ctx.drawImage(sprite, x - half, y - half)
    this.ctx.globalAlpha = 1
  }

  /** Rebuild the core glow sprite if needed (resize or significant zoom/excite change). */
  private ensureCoreGlowSprite(excite: number): OffscreenCanvas | null {
    const zoomBucket = Math.round(this.zoom * 20) / 20
    const exciteBucket = Math.round(excite * 10) / 10
    if (this.coreGlowSprite && zoomBucket === this.coreGlowZoom && exciteBucket === this.coreGlowExcite) {
      return this.coreGlowSprite
    }
    this.coreGlowZoom = zoomBucket
    this.coreGlowExcite = exciteBucket
    const glowR = Math.ceil((190 + excite * 46) * this.zoom) + 4
    const size = glowR * 2 + 4
    const oc = new OffscreenCanvas(size, size)
    const octx = oc.getContext('2d')
    if (!octx) { this.coreGlowSprite = null; return null }
    const cx = size / 2
    const glow = octx.createRadialGradient(cx, cx, 0, cx, cx, glowR)
    glow.addColorStop(0, `rgba(120,170,255,${0.5 + excite * 0.22})`)
    glow.addColorStop(0.32, `rgba(59,123,255,${0.2 + excite * 0.1})`)
    glow.addColorStop(1, 'rgba(59,123,255,0)')
    octx.fillStyle = glow
    octx.beginPath()
    octx.arc(cx, cx, glowR, 0, Math.PI * 2)
    octx.fill()
    this.coreGlowSprite = oc
    return oc
  }

  // ── Draw methods ───────────────────────────────────────────────────────────

  private drawBackdrop() {
    const { ctx, w, h, excite, t } = this
    const starsToRender = this.quality >= 2 ? Math.floor(STARS * 0.6) : STARS
    for (let si = 0; si < starsToRender; si++) {
      const s = this.stars[si]
      const a = 0.25 + 0.3 * Math.sin(s.p + t * s.v)
      ctx.fillStyle = `rgba(200,220,255,${a})`
      ctx.beginPath()
      ctx.arc(s.x * w + this.px * 4, s.y * h + this.py * 4, s.s, 0, Math.PI * 2)
      ctx.fill()
    }
    // Core glow: use sprite instead of per-frame createRadialGradient
    const sprite = this.ensureCoreGlowSprite(excite)
    if (sprite) {
      const half = sprite.width / 2
      ctx.drawImage(sprite, this.cx - half, this.cy - half)
    } else {
      // Fallback (OffscreenCanvas unavailable)
      const glowR = (190 + excite * 46) * this.zoom
      const glow = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, glowR)
      glow.addColorStop(0, `rgba(120,170,255,${0.5 + excite * 0.22})`)
      glow.addColorStop(0.32, `rgba(59,123,255,${0.2 + excite * 0.1})`)
      glow.addColorStop(1, 'rgba(59,123,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, glowR, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private ringRadii(): number[] { return appRingRadii(this.data.rings.length, DISC) }

  private drawRings() {
    const { ctx, cx, cy, zoom, excite } = this
    const radii = this.ringRadii()
    ctx.lineWidth = 1
    // Active ring (hovered or selected app's ring): draw slightly brighter
    const activeRing = this.activeRingIndex()
    radii.forEach((r, i) => {
      const isActive = i === activeRing
      ctx.strokeStyle = isActive
        ? `rgba(169,196,234,${0.42 + excite * 0.12})`
        : `rgba(169,196,234,${0.12 + excite * 0.06})`
      ctx.lineWidth = isActive ? 1.5 : 1
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * zoom, r * zoom * FIELD_TILT, FIELD_ROLL, 0, Math.PI * 2)
      ctx.stroke()
    })
    // No outer port ring — networks are now free bodies scattered in the space around the galaxy.
  }

  private drawDust() {
    const { ctx, w, h, excite, zoom, spin, t } = this
    const q = this.quality

    // ── Haze fog: use pre-rendered sprites ────────────────────────────────────
    if (q < 2) {
      const hazeFraction = q === 0 ? 1 : 0.5
      const hazeCount = Math.floor(HAZE * hazeFraction)
      this.ensureHazeSprites(excite)
      for (let i = 0; i < hazeCount; i++) {
        const d = this.dust[i]
        if (d.r > DISC * 0.72) continue
        const { x, y } = this.project(d.r, d.a + spin * (1 + 60 / (d.r + 40)))
        const bucketIndex = i % HAZE_BUCKETS
        const baseAlpha = 0.055 + excite * 0.03
        // Scale draw alpha down for partial draws
        const alpha = hazeFraction < 1 ? baseAlpha * 0.75 : 1
        this.drawHazeSprite(x, y, bucketIndex, alpha)
      }
    }
    // q >= 2: no haze

    // ── Dust particles: batched by tone+alpha bucket ───────────────────────────
    // Determine how many dust particles to render based on quality.
    const dustFraction = q === 0 ? 1 : q === 1 ? 0.6 : 0.35
    const dustCount = Math.floor(DUST * dustFraction)

    // Quantise alpha to 6 levels (0–5, step 1/6).
    const ALPHA_LEVELS = 6
    // Collect filled (non-ring) particles by tone bucket (index into toneKeys) and alpha band.
    // Tone is identified by tone[0] (r channel) since tones are distinct.
    // We build a map: toneR -> alphaLevel -> list of {x, y, size}
    type DotBatch = { x: number; y: number; s: number }[]
    const filledBatches = new Map<number, Map<number, DotBatch>>()
    // Ring particles: still stroke individually (few), but quantised
    type RingBatch = { x: number; y: number; s: number; lineW: number }[]
    const ringBatches = new Map<number, Map<number, RingBatch>>()

    for (let di = 0; di < dustCount; di++) {
      const d = this.dust[di]
      const { x, y, depth } = this.project(d.r, d.a + spin * (1 + 60 / (d.r + 40)))
      if (x < -30 || x > w + 30 || y < -30 || y > h + 30) continue
      const edge = Math.min(1, (DISC * 1.12 - d.r) / 140)
      const twinkle = 0.78 + 0.22 * Math.sin(d.phase + t * 0.02)
      const alpha = Math.min(1, d.alpha * (1 + excite * 0.35)) * edge * twinkle * (0.72 + 0.28 * depth)
      if (alpha <= 0.015) continue
      const size = d.size * zoom * (1 + depth * 0.22) * (1 + excite * 0.18)
      const [r, g, b] = d.tone
      const toneKey = r * 65536 + g * 256 + b

      if (d.ring) {
        const alphaLevel = Math.min(ALPHA_LEVELS - 1, Math.floor(alpha * 0.9 * ALPHA_LEVELS))
        let toneMap = ringBatches.get(toneKey)
        if (!toneMap) { toneMap = new Map(); ringBatches.set(toneKey, toneMap) }
        let batch = toneMap.get(alphaLevel)
        if (!batch) { batch = []; toneMap.set(alphaLevel, batch) }
        batch.push({ x, y, s: size, lineW: Math.max(0.6, size * 0.15) })
      } else {
        const alphaLevel = Math.min(ALPHA_LEVELS - 1, Math.floor(alpha * ALPHA_LEVELS))
        let toneMap = filledBatches.get(toneKey)
        if (!toneMap) { toneMap = new Map(); filledBatches.set(toneKey, toneMap) }
        let batch = toneMap.get(alphaLevel)
        if (!batch) { batch = []; toneMap.set(alphaLevel, batch) }
        batch.push({ x, y, s: size })
      }
    }

    // Draw filled batches: one beginPath + fill per tone+alphaLevel bucket
    for (const [toneKey, toneMap] of filledBatches) {
      const r2 = (toneKey >> 16) & 0xff
      const g2 = (toneKey >> 8) & 0xff
      const b2 = toneKey & 0xff
      for (const [alphaLevel, batch] of toneMap) {
        const a = (alphaLevel + 0.5) / ALPHA_LEVELS
        ctx.fillStyle = `rgba(${r2},${g2},${b2},${a})`
        ctx.beginPath()
        for (const dot of batch) {
          ctx.moveTo(dot.x + dot.s, dot.y)
          ctx.arc(dot.x, dot.y, dot.s, 0, Math.PI * 2)
        }
        ctx.fill()
      }
    }

    // Draw ring batches: stroke per particle (still) but use quantised strokeStyle
    for (const [toneKey, toneMap] of ringBatches) {
      const r2 = (toneKey >> 16) & 0xff
      const g2 = (toneKey >> 8) & 0xff
      const b2 = toneKey & 0xff
      for (const [alphaLevel, batch] of toneMap) {
        const a = (alphaLevel + 0.5) / ALPHA_LEVELS
        ctx.strokeStyle = `rgba(${r2},${g2},${b2},${a})`
        for (const dot of batch) {
          ctx.lineWidth = dot.lineW
          ctx.beginPath()
          ctx.arc(dot.x, dot.y, dot.s, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    ctx.lineWidth = 1
  }

  /** Moves every planet (DOM) along its orbit; positions free-body port nodes from scatter map. */
  private placeNodes(f: number, frozen: boolean) {
    const radii = this.ringRadii()
    const iconScale = Math.min(1.15, Math.max(this.narrow ? 0.55 : 0.7, this.zoom))
    for (const n of this.nodes) {
      const hot = this.hover === n.key

      if (n.kind === 'port') {
        // Free-body: use scatter position (stage-space), apply float animation
        const scatter = this.portPositions.get(n.key)
        const el = this.dom.nodes.get(n.key)
        if (n.hidden || !scatter) {
          if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none' }
          continue
        }
        n.lift += ((hot || this.selected === n.key ? 1 : 0) - n.lift) * 0.14
        // Slow float: ±4 px, seeded per key
        const floatSeed = seedFromString(n.key)
        const floatPeriod = 6000 + (floatSeed % 5000)  // 6–11 s in ms
        const floatPhase = (floatSeed % 1000) / 1000 * Math.PI * 2
        const floatY = frozen ? 0 : Math.sin(this.t * 0.05 * (6000 / floatPeriod) + floatPhase) * 4
        n.x = scatter.x
        n.y = scatter.y + floatY
        n.scale = 1 + n.lift * 0.22
        if (el) {
          el.style.transform = `translate3d(${n.x}px, ${n.y}px, 0) translate(-50%, -50%) scale(${n.scale})`
          el.style.opacity = String(Math.min(1, 0.7 + n.lift * 0.3))
          el.style.zIndex = hot ? '60' : '20'
          el.style.pointerEvents = 'auto'
          const on = hot || this.selected === n.key
          if (on !== n.active) { n.active = on; el.dataset.active = String(on) }
        }
        continue
      }

      // App planet: orbit as before
      const speed = ringSpeed(n.ring)
      if (!frozen && !hot) n.angle += speed * (1 + this.excite * 1.6) * f
      n.lift += ((hot || this.selected === n.key ? 1 : 0) - n.lift) * 0.14
      const p = this.project(radii[n.ring] ?? 0, n.angle)
      n.x = p.x
      n.y = p.y
      n.scale = iconScale * (0.86 + 0.2 * p.depth) * (1 + n.lift * 0.42)
      const el = this.dom.nodes.get(n.key)
      if (!el) continue
      if (n.hidden) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; continue }
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${n.scale})`
      el.style.opacity = String(Math.min(1, 0.62 + (0.38 * (p.depth + 1)) / 2 + this.excite * 0.12 + n.lift * 0.5))
      el.style.zIndex = hot ? '60' : p.depth > 0 ? '30' : '10'
      el.style.pointerEvents = 'auto'
      const on = hot || this.selected === n.key
      if (on !== n.active) { n.active = on; el.dataset.active = String(on) }
    }
  }

  private placeCore(now: number) {
    const { core, halo } = this.dom
    const boost = this.flashLevel('core', now)
    if (core) {
      core.style.transform = `translate3d(${this.cx}px, ${this.cy}px, 0) translate(-50%, -50%) scale(${Math.max(0.6, this.zoom) * CORE_SCALE})`
    }
    if (halo) {
      const beat = this.reduced || this.paused ? 0 : (Math.sin(this.t * 0.045) + 1) / 2
      halo.style.opacity = String(Math.min(1, 0.55 + beat * 0.3 + this.excite * 0.15 + boost * 0.3))
      halo.style.transform = `scale(${1 + beat * 0.09 + this.excite * 0.12 + boost * 0.18})`
    }
  }

  private flashLevel(key: string, now: number): number {
    const at = this.flashes.get(key)
    if (at === undefined) return 0
    return Math.max(0, 1 - (now - at) / FLASH_MS)
  }

  private endpoint(e: Endpoint): Point {
    switch (e.t) {
      case 'edge': return ellipsePoint(this.w / 2, this.h / 2, this.w / 2, this.h / 2, 0, e.angle)
      case 'core': return { x: this.cx, y: this.cy }
      case 'ring': {
        // Unlisted comets fade toward a random point on the outermost app ring.
        const radii = this.ringRadii()
        const outerR = (radii[radii.length - 1] ?? DISC * 0.92)
        return this.project(outerR * 1.3, e.angle)
      }
      case 'node': {
        const n = this.byKey.get(e.key)
        return n ? { x: n.x, y: n.y } : { x: this.cx, y: this.cy }
      }
    }
  }

  private drawComets(now: number) {
    if (this.reduced || this.paused) return
    const { ctx } = this
    const live: Comet[] = []
    const pills: Array<{ c: Comet; head: Point }> = []
    const heavy = this.comets.length > 150
    const q = this.quality
    ctx.lineCap = 'round'
    // level 2: use normal compositing (no 'lighter') to avoid GPU overdraw in Safari
    if (q < 2) ctx.globalCompositeOperation = 'lighter'
    for (const c of this.comets) {
      const p = (now - c.start) / c.life
      if (p < 0) { live.push(c); continue }
      if (p >= 1) {
        if (!c.flashed) this.flashes.set(c.flashKey, now)
        continue
      }
      if (p >= 0.92 && !c.flashed) { c.flashed = true; this.flashes.set(c.flashKey, now) }
      live.push(c)
      const cctp = c.kind !== 'tx'
      const base = cctp ? CCTP_TRAIL_POINTS : TX_TRAIL_POINTS
      // Trail point count by quality level
      const maxPts = q === 2 ? (cctp ? 8 : 8) : q === 1 ? (cctp ? 14 : 12) : (heavy && !cctp ? 12 : base)
      const pts = Math.min(base, maxPts)
      const trail = trailOf(c, this.endpoint(c.from), this.endpoint(c.to), p, pts, (cctp ? 0.014 : 0.018) * (base / pts))
      paintComet(ctx, c, trail, p < 0.8 ? 1 : (1 - p) / 0.2, q)
      if (c.pill && p < 0.95) pills.push({ c, head: trail[0] })
    }
    if (q < 2) ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    this.comets = live
    pills.sort((a, b) => Number(b.c.kind !== 'tx') * 1e15 + (b.c.usdc ?? 0) - (Number(a.c.kind !== 'tx') * 1e15 + (a.c.usdc ?? 0)))
    for (const { c, head } of pills.slice(0, this.narrow ? 1 : 4)) paintPill(ctx, c, head, this.w, this.h, '#eaf1fb')
  }

  /** Expanding rings where a comet lands: on the core, a planet or a port. */
  private drawFlashes(now: number) {
    const { ctx } = this
    for (const [key, at] of this.flashes) {
      const f = 1 - (now - at) / FLASH_MS
      if (f <= 0) { this.flashes.delete(key); continue }
      if (key === 'ring') continue
      const node = this.byKey.get(key)
      const core = key === 'core'
      if (!core && (!node || node.hidden)) continue
      const x = core ? this.cx : node!.x
      const y = core ? this.cy : node!.y
      const base = core ? 50 * Math.max(0.6, this.zoom) * CORE_SCALE : (node!.size / 2) * node!.scale
      ctx.globalAlpha = 0.75 * f
      ctx.strokeStyle = core ? CCTP_COLOR : node!.color
      ctx.lineWidth = core ? 2.4 : 1.5
      ctx.beginPath()
      ctx.arc(x, y, base + 3 + (1 - f) * (core ? 46 : 14), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // ── Fix 5: zoom fitted to shifted centre ──────────────────────────────────

  /**
   * Zoom so the outer app ring (DISC × 0.92) fits nicely in the stage.
   *
   * Wide (≥ 900 px):
   *   Target: outer ring's horizontal half-extent = 0.24 · w.
   *   Constraint: vertical half-extent ≤ 0.36 · h (with tilt 0.42).
   *   Clamped to [0.45, 1.5].
   *
   * Narrow (< 900 px):
   *   Fit symmetrically with small gutters; clamped to [0.28, 0.6].
   */
  private computeZoom(): number {
    const { w, h } = this
    const { halfW, halfH } = ellipseExtent(DISC * 0.92, FIELD_TILT, FIELD_ROLL)
    if (!halfW || !halfH) return 1
    if (w >= 900) {
      const zByWidth  = (0.24 * w) / halfW
      const zByHeight = (0.36 * h) / halfH
      return Math.max(0.45, Math.min(1.5, Math.min(zByWidth, zByHeight)))
    }
    return Math.max(0.28, Math.min(0.6, (w / 2 - 20) / halfW))
  }

  // ── Fix 3: ring index of the hovered/selected node ────────────────────────

  /** Ring index of the currently hovered or selected app node, or -1 if none. */
  private activeRingIndex(): number {
    const key = this.hover ?? this.selected
    if (!key) return -1
    const node = this.byKey.get(key)
    if (!node || node.kind !== 'app') return -1
    return node.ring
  }

  /**
   * Fix 3: draw the active ring's label at the ring's right-end point, on the canvas.
   * Only drawn on wide stages and when zoom is sufficient to read the label.
   */
  private drawActiveRingLabel(wide: boolean) {
    const ri = this.activeRingIndex()
    if (ri < 0 || !wide || this.zoom < 0.55) return
    const ring = this.data.rings[ri]
    if (!ring) return
    const { ctx, excite } = this
    const radii = this.ringRadii()
    const r = radii[ri]
    if (!r) return
    // Right end of the ellipse in screen coordinates: angle = 0 puts us at the positive-x side
    // of the orbit ellipse after roll. For the rolled ellipse the rightmost screen point is at
    // angle 0 (since roll is small). A more exact approach would find the extremum, but at the
    // label size this is visually equivalent.
    const at = this.project(r, 0)
    const label = `${ring.label.toUpperCase()}`
    ctx.save()
    ctx.font = '10px "Geist Mono", ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = `rgba(169,196,234,${0.82 + excite * 0.18})`
    ctx.fillText(label, at.x + 10, at.y)
    ctx.restore()
  }

  // ── Fix 4: greedy per-frame DOM label pass ────────────────────────────────

  /** Lazily get the .om-label child of a node element, or null if absent/not yet mounted. */
  private getLabelEl(key: string): HTMLElement | null {
    if (this.labelCache.has(key)) return this.labelCache.get(key) ?? null
    const nodeEl = this.dom.nodes.get(key)
    const raw = nodeEl ? nodeEl.querySelector('.om-label') : null
    const el = raw instanceof HTMLElement ? raw : null
    this.labelCache.set(key, el)
    return el
  }

  /**
   * Fix 4: greedy overlap pass on DOM label spans each frame.
   * Estimates label bounding boxes from node coordinates and sizes (no DOM layout reads).
   * Priority = 24h tx (from Node.size as proxy; app nodes have tx encoded in size).
   * The hovered/selected node's label is always shown.
   * Labels that would overlap a higher-priority label or the core disc are hidden.
   */
  private placeNodeLabels() {
    const activeKey = this.hover ?? this.selected
    // Core blocker: a circle approximated as a square.
    const coreR = 50 * Math.max(0.6, this.zoom) * CORE_SCALE + 8
    const blockers: Blocker[] = [
      { x: this.cx - coreR, y: this.cy - coreR, w: coreR * 2, h: coreR * 2 },
    ]

    const items: LabelItem[] = []
    for (const n of this.nodes) {
      if (n.hidden) continue
      // Only app nodes have labels in the galaxy (port labels are inside om-port-body).
      if (n.kind !== 'app') continue
      const el = this.getLabelEl(n.key)
      if (!el) continue
      // Face height (half): for apps the face can be rectangular (kind === 'app' tiles have h = size * 0.65)
      // We use n.size as the face height proxy for simplicity (conservative).
      const faceHalf = (n.size / 2) * n.scale
      // Label estimated width from character count.
      const appData = this.data.apps.find(a => appKey(a.id) === n.key)
      const charCount = appData ? appData.name.length : 8
      const lw = charCount * LABEL_PX_PER_CHAR
      const lh = LABEL_H
      const lx = n.x - lw / 2
      const ly = n.y + faceHalf + LABEL_GAP
      items.push({ id: n.key, x: lx, y: ly, w: lw, h: lh, priority: n.size }) // size ∝ tx on log scale
    }

    // Always-visible: force the active label into the shown set (it overrides overlap).
    const shown = placeLabels(items, blockers)

    for (const n of this.nodes) {
      if (n.kind !== 'app' || n.hidden) continue
      const el = this.getLabelEl(n.key)
      if (!el) continue
      const alwaysShow = n.key === activeKey
      const visible = alwaysShow || shown.has(n.key)
      el.style.opacity = visible ? '' : '0'
    }
  }

}
