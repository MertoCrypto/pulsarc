import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TokenBTC, TokenEURC, TokenUSDC } from '@web3icons/react'
import { ArcLogo } from '@/components/brand/ArcLogo'

/**
 * The Arc ecosystem drawn as a galaxy: a tilted spiral of dust around the Arc mark, with the
 * assets and apps listed on Arc Portal orbiting it. Dust is Canvas 2D; planets are DOM so their
 * logos stay crisp and clickable. Moving the pointer over the field energises it.
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

const PORTAL = 'https://portal.arc.io/assets'
const logo = (path: string) => `${PORTAL}/${path}`

interface Planet {
  key: string
  label: string
  note: string
  ring: number
  kind: 'asset' | 'app'
  size: number
  /** where it sits on its orbit, 0–1, filled in below */
  slot: number
  icon?: 'usdc' | 'eurc' | 'btc'
  img?: string
  /** a tracked app/token on Pulsarc opens its page; the rest open the Arc Portal listing */
  to?: string
  minor?: boolean
}

const RING_R = [0, 112, 176, 246, 318, 384]
const RING_SPEED = [0, 0.0054, 0.0038, 0.0027, 0.0019, 0.0014]

type Seed = Omit<Planet, 'slot' | 'kind'> & { kind?: Planet['kind'] }

const SEEDS: Seed[] = [
  // 1 · Circle-issued assets
  { key: 'usdc', label: 'USDC', note: 'Circle-issued · gas token on Arc', ring: 1, size: 44, icon: 'usdc', to: '/dapp/usdc' },
  { key: 'eurc', label: 'EURC', note: 'Circle-issued euro stablecoin', ring: 1, size: 40, icon: 'eurc', to: '/dapp/eurc' },
  { key: 'usyc', label: 'USYC', note: 'Tokenized money market fund', ring: 1, size: 38, to: '/dapp/usyc' },
  { key: 'cirbtc', label: 'cirBTC', note: 'Circle-issued wrapped bitcoin', ring: 1, size: 38, icon: 'btc', to: '/dapp/cirbtc' },
  // 2 · other core and yield assets
  { key: 'weth', label: 'WETH', note: 'Wrapped Ether, bridged via CCTP', ring: 2, size: 34, img: logo('tokens/weth.svg') },
  { key: 'syrupusdc', label: 'syrupUSDC', note: 'Yield-bearing USDC · Maple', ring: 2, size: 34, img: logo('tokens/syrupusdc.svg') },
  { key: 'usdai', label: 'USDai', note: 'Synthetic dollar · USD.AI', ring: 2, size: 32, img: logo('tokens/usdai.svg') },
  { key: 'dshares', label: 'dShares', note: 'Tokenized US equities · Dinari', ring: 2, size: 32, img: logo('tokens/dshares.svg') },
  { key: 'xstocks', label: 'xStocks', note: 'Tokenized equities · Backed', ring: 2, size: 32, img: logo('tokens/xstocks.svg') },
  // 3 · DeFi apps
  { key: 'uniswap', label: 'Uniswap', note: 'Decentralized exchange', kind: 'app', ring: 3, size: 54, img: logo('discover/uniswap.png') },
  { key: 'aave', label: 'Aave', note: 'Lending protocol', kind: 'app', ring: 3, size: 54, img: logo('discover/aave.png') },
  { key: 'morpho', label: 'Morpho', note: 'Lending network', kind: 'app', ring: 3, size: 54, img: logo('discover/morpho.png') },
  { key: 'maple', label: 'Maple', note: 'Onchain credit marketplace', kind: 'app', ring: 3, size: 54, img: logo('discover/maple.png') },
  { key: 'stargate', label: 'Stargate', note: 'Cross-chain transfers', kind: 'app', ring: 3, size: 54, img: logo('discover/stargate.png') },
  { key: 'across', label: 'Across', note: 'Cross-chain bridge', kind: 'app', ring: 3, size: 54, img: logo('discover/across.png') },
  { key: 'aerodrome', label: 'Aerodrome', note: 'Liquidity and trading', kind: 'app', ring: 3, size: 54, img: logo('discover/aerodrome.png') },
  { key: 'xylonet', label: 'XyloNet', note: 'Stablecoin-native DeFi on Arc', kind: 'app', ring: 3, size: 54, img: logo('discover/xylonet.webp'), to: '/dapp/xylonet' },
  // 4 · exchanges and more
  { key: 'binance', label: 'Binance', note: 'Exchange', kind: 'app', ring: 4, size: 48, img: logo('discover/binance.webp'), minor: true },
  { key: 'bybit', label: 'Bybit', note: 'Exchange', kind: 'app', ring: 4, size: 48, img: logo('discover/bybit.webp'), minor: true },
  { key: 'kraken', label: 'Kraken', note: 'Exchange', kind: 'app', ring: 4, size: 48, img: logo('discover/kraken.webp'), minor: true },
  { key: 'okx', label: 'OKX', note: 'Exchange and wallet', kind: 'app', ring: 4, size: 48, img: logo('discover/okx.webp'), minor: true },
  { key: 'robinhood', label: 'Robinhood', note: 'Retail trading', kind: 'app', ring: 4, size: 48, img: logo('discover/robinhood.webp'), minor: true },
  { key: 'hibachi', label: 'Hibachi', note: 'Perpetuals exchange', kind: 'app', ring: 4, size: 48, img: logo('discover/hibachi.png'), minor: true },
  { key: 'synthra', label: 'Synthra', note: 'Assets across ecosystems', kind: 'app', ring: 4, size: 48, img: logo('discover/synthra.png'), to: '/dapp/synthra', minor: true },
  // 5 · local-currency stablecoins
  { key: 'jpyc', label: 'JPYC', note: 'Japanese yen stablecoin', ring: 5, size: 28, img: logo('tokens/jpyc.svg'), minor: true },
  { key: 'gbpa', label: 'GBPA', note: 'British pound stablecoin', ring: 5, size: 28, img: logo('tokens/gbpa.svg'), minor: true },
  { key: 'audd', label: 'AUDD', note: 'Australian dollar stablecoin', ring: 5, size: 28, img: logo('tokens/audd.svg'), minor: true },
  { key: 'eurau', label: 'EURAU', note: 'Euro stablecoin · AllUnity', ring: 5, size: 28, img: logo('tokens/eurau.svg'), minor: true },
  { key: 'chfau', label: 'CHFAU', note: 'Swiss franc stablecoin', ring: 5, size: 28, img: logo('tokens/chfau.svg'), minor: true },
  { key: 'tryb', label: 'TRYB', note: 'Turkish lira stablecoin', ring: 5, size: 28, img: logo('tokens/tryb.svg'), minor: true },
  { key: 'sekau', label: 'SEKAU', note: 'Swedish krona stablecoin', ring: 5, size: 28, img: logo('tokens/sekau.svg'), minor: true },
  { key: 'cadd', label: 'CADD', note: 'Canadian dollar stablecoin', ring: 5, size: 28, img: logo('tokens/cadd.svg'), minor: true },
]

// spread each ring's planets evenly, staggering rings so they never line up
const PLANETS: Planet[] = SEEDS.map(seed => {
  const same = SEEDS.filter(x => x.ring === seed.ring)
  const i = same.indexOf(seed)
  return { kind: 'asset', ...seed, slot: (i / same.length + seed.ring * 0.137) % 1 }
})

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

function Face({ p }: { p: Planet }) {
  const [broken, setBroken] = useState(false)
  const mono = (
    <span className="font-['Geist_Mono'] font-medium text-[var(--periwinkle-hi)]" style={{ fontSize: Math.max(8, p.size * 0.3) }}>
      {p.label.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}
    </span>
  )
  if (p.icon === 'usdc') return <TokenUSDC variant="branded" size={p.size * 0.72} />
  if (p.icon === 'eurc') return <TokenEURC variant="branded" size={p.size * 0.72} />
  if (p.icon === 'btc') return <TokenBTC variant="branded" size={p.size * 0.66} />
  if (p.img && !broken) {
    return (
      <img
        src={p.img}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setBroken(true)}
        className={p.kind === 'app' ? 'h-full w-full object-cover' : 'h-full w-full object-contain'}
      />
    )
  }
  return mono
}

export function ArcField({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<HTMLDivElement>(null)
  const haloRef = useRef<HTMLDivElement>(null)
  const planetRefs = useRef<(HTMLElement | null)[]>([])
  const hovered = useRef(-1)

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
      // Wide screens give the galaxy the right side; narrow ones stack it above the copy.
      fit = wide ? Math.max(0.7, Math.min(1.18, (w * 0.53) / (DISC * 2))) : Math.max(0.36, Math.min(0.6, w / 900))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const dust = Array.from({ length: DUST }, makeDust)
    const stars = Array.from({ length: STARS }, () => ({
      x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.1, p: Math.random() * Math.PI * 2, v: 0.004 + Math.random() * 0.012,
    }))
    const angles = PLANETS.map(p => p.slot * Math.PI * 2)
    const lift = PLANETS.map(() => 0) // eased hover scale per planet

    let px = 0, py = 0, tx = 0, ty = 0
    let excite = 0
    let exciteTarget = 0
    const onPointer = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
      tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2
      exciteTarget = inside ? 1 : 0
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    const onLeave = () => { exciteTarget = 0 }
    document.addEventListener('pointerleave', onLeave)

    let scroll = window.scrollY
    const onScroll = () => { scroll = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })

    const cosR = Math.cos(ROLL)
    const sinR = Math.sin(ROLL)
    let raf = 0
    let t = 0
    let spin = 0

    const draw = () => {
      excite += (exciteTarget - excite) * 0.05
      if (!reduced) { t += 1 + excite * 2.2; spin += 0.00075 * (1 + excite * 3.4) }
      ctx.clearRect(0, 0, w, h)

      px += (tx - px) * 0.05
      py += (ty - py) * 0.05

      const zoom = fit * (1 + Math.min(scroll, 700) / 700 * 0.3) * (1 + excite * 0.035)
      const cx = w * (wide ? 0.715 : 0.5) + px * (18 + excite * 16)
      const cy = (wide ? h * 0.5 : 150) + py * (14 + excite * 12)
      const veil = wide ? 1 : 0.9

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

      // core glow swells when the field is energised
      const glowR = (190 + excite * 46) * zoom
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
      glow.addColorStop(0, `rgba(120,170,255,${(0.5 + excite * 0.22) * veil})`)
      glow.addColorStop(0.32, `rgba(59,123,255,${(0.2 + excite * 0.1) * veil})`)
      glow.addColorStop(1, 'rgba(59,123,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fill()

      // orbit lines
      ctx.lineWidth = 1
      for (let ring = 1; ring < RING_R.length; ring++) {
        if (!wide && ring >= 4) continue
        const minor = ring >= 4
        ctx.strokeStyle = `rgba(169,196,234,${((minor ? 0.07 : 0.12) + excite * 0.06) * veil})`
        ctx.beginPath()
        ctx.ellipse(cx, cy, RING_R[ring] * zoom, RING_R[ring] * zoom * TILT, ROLL, 0, Math.PI * 2)
        ctx.stroke()
      }

      // haze along the arms
      for (let i = 0; i < HAZE; i++) {
        const d = dust[i]
        if (d.r > DISC * 0.72) continue
        const { x, y } = project(d.r, d.a + spin * (1 + 60 / (d.r + 40)))
        const rad = (38 + (i % 5) * 9) * zoom
        const fog = ctx.createRadialGradient(x, y, 0, x, y, rad)
        fog.addColorStop(0, `rgba(88,140,235,${(0.055 + excite * 0.03) * veil})`)
        fog.addColorStop(1, 'rgba(88,140,235,0)')
        ctx.fillStyle = fog
        ctx.beginPath()
        ctx.arc(x, y, rad, 0, Math.PI * 2)
        ctx.fill()
      }

      // dust: brighter and faster-twinkling while energised
      for (const d of dust) {
        const { x, y, depth } = project(d.r, d.a + spin * (1 + 60 / (d.r + 40)))
        if (x < -30 || x > w + 30 || y < -30 || y > h + 30) continue
        const edge = Math.min(1, (DISC * 1.12 - d.r) / 140)
        const twinkle = 0.78 + 0.22 * Math.sin(d.phase + t * 0.02)
        const alpha = Math.min(1, d.alpha * (1 + excite * 0.35)) * edge * twinkle * (0.72 + 0.28 * depth) * veil
        if (alpha <= 0.015) continue
        const size = d.size * zoom * (1 + depth * 0.22) * (1 + excite * 0.18)
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

      // core (DOM): the Arc mark stays untouched; only the halo around it moves
      if (coreRef.current) {
        coreRef.current.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%) scale(${Math.max(0.6, zoom)})`
      }
      if (haloRef.current) {
        const beat = reduced ? 0 : (Math.sin(t * 0.045) + 1) / 2
        haloRef.current.style.opacity = String(0.55 + beat * 0.3 + excite * 0.15)
        haloRef.current.style.transform = `scale(${1 + beat * 0.09 + excite * 0.12})`
      }

      // planets (DOM)
      PLANETS.forEach((p, i) => {
        const el = planetRefs.current[i]
        if (!el) return
        if (!wide && p.minor) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; return }
        const isHot = hovered.current === i
        if (!reduced && !isHot) angles[i] += RING_SPEED[p.ring] * (1 + excite * 1.6)
        lift[i] += ((isHot ? 1 : 0) - lift[i]) * 0.14
        const { x, y, depth } = project(RING_R[p.ring], angles[i])
        const s = zoom * (0.86 + 0.2 * depth) * (1 + lift[i] * 0.42)
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${s})`
        el.style.opacity = String(Math.min(1, (0.62 + 0.38 * (depth + 1) / 2 + excite * 0.12 + lift[i] * 0.5)) * veil)
        el.style.zIndex = isHot ? '60' : depth > 0 ? '30' : '10'
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
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div ref={wrapRef} className={className || 'relative'}>
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden />

      {/* Core: the Arc mark on a quiet disc, with a halo that breathes */}
      <div ref={coreRef} className="pointer-events-none absolute left-0 top-0 z-20 will-change-transform" aria-hidden>
        <div className="relative">
          <div ref={haloRef} className="absolute -inset-7 rounded-full bg-[radial-gradient(circle,rgba(86,150,255,0.55),rgba(59,123,255,0.14)_58%,transparent_72%)] blur-md" />
          {[0, 1].map(i => (
            <div
              key={i}
              className="absolute -inset-3 rounded-full border border-[var(--periwinkle)]/30"
              style={{ animation: `arc-pulse-ring 3.4s ease-out ${i * 1.7}s infinite` }}
            />
          ))}
          <div className="relative flex h-[92px] w-[92px] items-center justify-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_30%,#4a8cf0,#14407f_62%,#0c2a57)] shadow-[0_0_60px_rgba(59,123,255,0.65),inset_0_1px_0_rgba(255,255,255,0.25)]">
            <ArcLogo className="h-[34px] w-auto" />
          </div>
        </div>
      </div>

      {/* Planets: assets are round, apps are tiles */}
      {PLANETS.map((p, i) => {
        const external = !p.to
        const href = p.kind === 'app' ? 'https://portal.arc.io/discover' : 'https://portal.arc.io/discover/assets'
        const common = {
          ref: (el: HTMLElement | null) => { planetRefs.current[i] = el },
          title: `${p.label} · ${p.note}`,
          'aria-label': `${p.label}, ${p.note}`,
          onMouseEnter: () => { hovered.current = i },
          onMouseLeave: () => { if (hovered.current === i) hovered.current = -1 },
          className: 'group absolute left-0 top-0 flex flex-col items-center opacity-0 will-change-transform',
        }
        const body = (
          <>
            <span
              className={`flex items-center justify-center overflow-hidden border border-[var(--periwinkle)]/30 bg-[#0e2140]/90 shadow-[0_0_22px_rgba(59,123,255,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm transition-[border-color,box-shadow] duration-300 group-hover:border-[var(--periwinkle)] group-hover:shadow-[0_0_34px_rgba(169,196,234,0.6)] ${p.kind === 'app' ? 'rounded-[10px]' : 'rounded-full'}`}
              style={p.kind === 'app' ? { width: p.size, height: p.size * 0.65 } : { width: p.size, height: p.size }}
            >
              <Face p={p} />
            </span>
            <span className="mt-1.5 whitespace-nowrap font-['Geist_Mono'] text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors group-hover:text-white">
              {p.label}
            </span>
            <span className="pointer-events-none absolute left-1/2 top-full mt-6 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--line)] bg-[#0b182c]/95 px-2.5 py-1 text-[11px] text-[var(--muted)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {p.note}
            </span>
          </>
        )
        return external ? (
          <a key={p.key} href={href} target="_blank" rel="noreferrer" {...common}>{body}</a>
        ) : (
          <Link key={p.key} to={p.to!} {...common}>{body}</Link>
        )
      })}
    </div>
  )
}
