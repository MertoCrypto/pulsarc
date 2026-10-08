import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { TokenBTC, TokenEURC, TokenUSDC } from '@web3icons/react'
import { PulsarcMark } from '@/components/brand/PulsarcMark'

/**
 * The Arc ecosystem drawn as a galaxy: a tilted spiral disc of dust around a bright core,
 * with the network's assets orbiting it as planets. Dust is Canvas 2D; planets are DOM so
 * their logos stay crisp and they can be clicked.
 */

type Tone = readonly [number, number, number]

const TONES: Tone[] = [
  [39, 117, 202],   // USDC blue
  [59, 123, 255],   // Arc blue
  [169, 196, 234],  // periwinkle
  [120, 196, 232],  // cyan haze
  [226, 238, 255],  // near-white
]

const DUST = 1700
const HAZE = 60       // soft clouds that give the arms their glow
const STARS = 150
const DISC = 400      // outer radius of the disc, in field units
const TILT = 0.42     // how far the disc leans away from the viewer
const ROLL = -0.3     // rotation of the disc in the screen plane (radians)
const ARMS = 2
const TWIST = 1.85    // how tightly the arms wind

interface Dust {
  r: number
  a: number      // angle at rest; the whole disc rotates on top of this
  size: number
  tone: Tone
  ring: boolean
  alpha: number
  phase: number
}

interface Planet {
  key: string
  label: string
  note: string
  r: number
  speed: number
  phase: number
  size: number
  /** Circle-issued assets get their logo; others a monogram. */
  icon?: 'usdc' | 'eurc' | 'btc'
  minor?: boolean
}

// Inner orbits: assets issued by Circle on Arc. Outer orbits: widely held ecosystem tokens.
const PLANETS: Planet[] = [
  { key: 'usdc', label: 'USDC', note: 'Native gas token', r: 118, speed: 0.0052, phase: 0.4, size: 46, icon: 'usdc' },
  { key: 'eurc', label: 'EURC', note: 'Euro stablecoin', r: 172, speed: 0.0036, phase: 2.6, size: 40, icon: 'eurc' },
  { key: 'usyc', label: 'USYC', note: 'Tokenized treasury fund', r: 228, speed: 0.0027, phase: 4.5, size: 36 },
  { key: 'cirbtc', label: 'cirBTC', note: 'Circle wrapped bitcoin', r: 286, speed: 0.0021, phase: 1.5, size: 36, icon: 'btc' },
  { key: 'syn', label: 'SYN', note: 'Synthra', r: 338, speed: 0.0017, phase: 3.5, size: 28, minor: true },
  { key: 'swprc', label: 'SWPRC', note: 'Swaparc', r: 338, speed: 0.0017, phase: 5.9, size: 28, minor: true },
  { key: 'warc', label: 'wARC', note: 'Wrapped ARC', r: 384, speed: 0.0014, phase: 0.2, size: 26, minor: true },
  { key: 'xyusdc', label: 'xyUSDC', note: 'XyloNet vault', r: 384, speed: 0.0014, phase: 2.9, size: 26, minor: true },
]

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
}

function makeDust(): Dust {
  const inArm = Math.random() < 0.74
  const r = 22 + Math.pow(Math.random(), inArm ? 0.85 : 0.6) * (inArm ? DISC : DISC * 1.12)
  const arm = ((Math.random() * ARMS) | 0) * ((Math.PI * 2) / ARMS)
  const spread = inArm ? 0.2 + (r / DISC) * 0.26 : Math.PI
  const a = inArm ? arm + TWIST * Math.log(r / 22) + gauss() * spread : Math.random() * Math.PI * 2
  const ring = Math.random() < 0.05
  const nearCore = 1 - Math.min(1, r / DISC)
  return {
    r,
    a,
    size: ring ? 3 + Math.random() * 7 : 0.6 + Math.random() * 2 + nearCore * 0.6,
    // the core runs warm-white, the arms cool blue
    tone: nearCore > 0.72 && Math.random() < 0.7 ? TONES[4] : TONES[(Math.random() * TONES.length) | 0],
    ring,
    alpha: (inArm ? 0.62 : 0.28) + Math.random() * 0.38,
    phase: Math.random() * Math.PI * 2,
  }
}

export function ArcField({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<HTMLDivElement>(null)
  const planetRefs = useRef<(HTMLAnchorElement | null)[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let fit = 1
    let wide = true

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      wide = w >= 900
      // Wide screens give the galaxy the right half; narrow ones tuck a smaller one behind the copy.
      fit = wide ? Math.max(0.7, Math.min(1.18, (w * 0.53) / (DISC * 2))) : Math.max(0.36, Math.min(0.6, w / 900))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const dust = Array.from({ length: DUST }, makeDust)
    const stars = Array.from({ length: STARS }, () => ({
      x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.1, p: Math.random() * Math.PI * 2, v: 0.004 + Math.random() * 0.012,
    }))
    const angles = PLANETS.map(p => p.phase)

    let px = 0, py = 0, tx = 0, ty = 0
    const onPointer = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    let scroll = window.scrollY
    const onScroll = () => { scroll = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })

    const cosR = Math.cos(ROLL)
    const sinR = Math.sin(ROLL)
    let raf = 0
    let t = 0
    let spin = 0

    const draw = () => {
      if (!reduced) { t += 1; spin += 0.00075 }
      ctx.clearRect(0, 0, w, h)

      px += (tx - px) * 0.04
      py += (ty - py) * 0.04

      const zoom = fit * (1 + Math.min(scroll, 700) / 700 * 0.3)
      const cx = w * (wide ? 0.715 : 0.5) + px * 18
      const cy = (wide ? h * 0.5 : 150) + py * 14
      const veil = wide ? 1 : 0.9

      // project a point on the disc (radius r, angle a) to the screen; depth > 0 is nearer
      const project = (r: number, a: number) => {
        const X = Math.cos(a) * r * zoom
        const Y = Math.sin(a) * r * zoom * TILT
        return { x: cx + X * cosR - Y * sinR, y: cy + X * sinR + Y * cosR, depth: Math.sin(a) }
      }

      // distant stars
      for (const s of stars) {
        const a = (0.25 + 0.3 * Math.sin(s.p + t * s.v)) * veil
        ctx.fillStyle = `rgba(200,220,255,${a})`
        ctx.beginPath()
        ctx.arc(s.x * w + px * 4, s.y * h + py * 4, s.s, 0, Math.PI * 2)
        ctx.fill()
      }

      // core glow
      const glowR = 190 * zoom
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
      glow.addColorStop(0, `rgba(120,170,255,${0.5 * veil})`)
      glow.addColorStop(0.32, `rgba(59,123,255,${0.2 * veil})`)
      glow.addColorStop(1, 'rgba(59,123,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fill()

      // orbit lines
      ctx.lineWidth = 1
      const seen = new Set<number>()
      for (const p of PLANETS) {
        if (seen.has(p.r) || (!wide && p.minor)) continue
        seen.add(p.r)
        ctx.strokeStyle = `rgba(169,196,234,${(p.minor ? 0.07 : 0.12) * veil})`
        ctx.beginPath()
        ctx.ellipse(cx, cy, p.r * zoom, p.r * zoom * TILT, ROLL, 0, Math.PI * 2)
        ctx.stroke()
      }

      // haze along the arms
      for (let i = 0; i < HAZE; i++) {
        const d = dust[i]
        if (d.r > DISC * 0.72) continue
        const { x, y } = project(d.r, d.a + spin * (1 + 60 / (d.r + 40)))
        const rad = (38 + (i % 5) * 9) * zoom
        const fog = ctx.createRadialGradient(x, y, 0, x, y, rad)
        fog.addColorStop(0, `rgba(88,140,235,${0.055 * veil})`)
        fog.addColorStop(1, 'rgba(88,140,235,0)')
        ctx.fillStyle = fog
        ctx.beginPath()
        ctx.arc(x, y, rad, 0, Math.PI * 2)
        ctx.fill()
      }

      // dust
      for (const d of dust) {
        const { x, y, depth } = project(d.r, d.a + spin * (1 + 60 / (d.r + 40)))
        if (x < -30 || x > w + 30 || y < -30 || y > h + 30) continue
        const edge = Math.min(1, (DISC * 1.12 - d.r) / 140)
        const twinkle = 0.78 + 0.22 * Math.sin(d.phase + t * 0.02)
        const alpha = d.alpha * edge * twinkle * (0.72 + 0.28 * depth) * veil
        if (alpha <= 0.015) continue
        const size = d.size * zoom * (1 + depth * 0.22)
        const [r, g, b] = d.tone
        if (d.ring) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.9})`
          ctx.lineWidth = Math.max(0.6, size * 0.15)
          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // core + planets (DOM)
      if (coreRef.current) {
        coreRef.current.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%) scale(${Math.max(0.6, zoom)})`
      }
      PLANETS.forEach((p, i) => {
        const el = planetRefs.current[i]
        if (!el) return
        if (!wide && p.minor) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; return }
        if (!reduced) angles[i] += p.speed
        const { x, y, depth } = project(p.r, angles[i])
        const s = zoom * (0.86 + 0.2 * depth)
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${s})`
        el.style.opacity = String((0.62 + 0.38 * (depth + 1) / 2) * veil)
        el.style.zIndex = depth > 0 ? '30' : '10'
        el.style.pointerEvents = wide ? 'auto' : 'none'
      })

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <div ref={wrapRef} className={className || 'relative'}>
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden />

      {/* Core */}
      <div ref={coreRef} className="pointer-events-none absolute left-0 top-0 z-20 will-change-transform" aria-hidden>
        <div className="relative">
          {[0, 1].map(i => (
            <div
              key={i}
              className="absolute -inset-3 rounded-full border border-[var(--periwinkle)]/30"
              style={{ animation: `arc-pulse-ring 3.4s ease-out ${i * 1.7}s infinite` }}
            />
          ))}
          <div className="relative flex h-[92px] w-[92px] items-center justify-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_30%,#4a8cf0,#14407f_62%,#0c2a57)] shadow-[0_0_60px_rgba(59,123,255,0.65),inset_0_1px_0_rgba(255,255,255,0.25)]">
            <PulsarcMark className="h-12 w-12 text-white" animated />
          </div>
        </div>
      </div>

      {/* Planets */}
      {PLANETS.map((p, i) => (
        <Link
          key={p.key}
          to="/tokens"
          ref={el => { planetRefs.current[i] = el }}
          title={`${p.label} · ${p.note}`}
          aria-label={`${p.label}, ${p.note}`}
          className="group absolute left-0 top-0 flex flex-col items-center opacity-0 will-change-transform"
        >
          <span
            className="flex items-center justify-center rounded-full border border-[var(--periwinkle)]/30 bg-[#0e2140]/90 shadow-[0_0_22px_rgba(59,123,255,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm transition-[border-color,box-shadow] duration-300 group-hover:border-[var(--periwinkle)] group-hover:shadow-[0_0_30px_rgba(169,196,234,0.55)]"
            style={{ width: p.size, height: p.size }}
          >
            {p.icon === 'usdc' && <TokenUSDC variant="branded" size={p.size * 0.72} />}
            {p.icon === 'eurc' && <TokenEURC variant="branded" size={p.size * 0.72} />}
            {p.icon === 'btc' && <TokenBTC variant="branded" size={p.size * 0.66} />}
            {!p.icon && (
              <span className="font-['Geist_Mono'] font-medium text-[var(--periwinkle-hi)]" style={{ fontSize: Math.max(8, p.size * 0.3) }}>
                {p.label.replace(/[^A-Za-z]/g, '').slice(0, p.minor ? 2 : 3).toUpperCase()}
              </span>
            )}
          </span>
          <span className="mt-1.5 whitespace-nowrap font-['Geist_Mono'] text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors group-hover:text-white">
            {p.label}
          </span>
        </Link>
      ))}
    </div>
  )
}
