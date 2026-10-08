import { useEffect, useRef } from 'react'

/**
 * Depth-of-field particle system: USDC flowing inward to the Arc core.
 * Particles spiral toward the centre while drifting toward the camera, so
 * scrolling reads as flying through the stream. Canvas 2D, ~700 particles.
 */

type Tone = readonly [number, number, number]

const TONES: Tone[] = [
  [39, 117, 202],   // USDC blue
  [59, 123, 255],   // Arc blue
  [169, 196, 234],  // periwinkle
  [120, 196, 232],  // cyan haze
  [226, 238, 255],  // near-white
]

const COUNT = 1000
const FOCAL = 460
const DEPTH = 1400

interface Particle {
  angle: number
  radius: number
  z: number
  speed: number
  drift: number
  size: number
  tone: Tone
  ring: boolean
}

function spawn(seedZ = false): Particle {
  const tone = TONES[(Math.random() * TONES.length) | 0]
  const ring = Math.random() < 0.075
  return {
    angle: Math.random() * Math.PI * 2,
    radius: 60 + Math.pow(Math.random(), 0.65) * 460,
    z: seedZ ? Math.random() * DEPTH : DEPTH * (0.72 + Math.random() * 0.28),
    speed: 0.0012 + Math.random() * 0.0038,
    drift: 0.22 + Math.random() * 0.75,
    size: ring ? 5 + Math.random() * 8 : 1 + Math.random() * 2.6,
    tone,
    ring,
  }
}

export function ArcField({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let dpr = 1

    // Narrow viewports get a smaller field so it never swamps the copy.
    let fit = 1
    const refit = () => { fit = Math.max(0.42, Math.min(1, w / 980)) }

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    refit()
    const ro = new ResizeObserver(() => { resize(); refit() })
    ro.observe(wrap)

    const particles: Particle[] = Array.from(
      { length: COUNT },
      () => spawn(true),
    )

    // Pointer parallax, eased.
    let px = 0
    let py = 0
    let tx = 0
    let ty = 0
    const onPointer = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    // Scroll pushes the camera forward through the field.
    let scroll = 0
    const onScroll = () => {
      scroll = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    let raf = 0
    let t = 0

    const draw = () => {
      t += reduced ? 0 : 1
      ctx.clearRect(0, 0, w, h)

      px += (tx - px) * 0.045
      py += (ty - py) * 0.045

      const cx = w * 0.57 + px * 26
      const cy = h / 2 + py * 20
      const camera = Math.min(scroll, 900) * 0.55

      for (const p of particles) {
        if (!reduced) {
          p.angle += p.speed
          p.z -= p.drift
          p.radius -= 0.09
        }

        if (p.z < 14 || p.radius < 26) {
          Object.assign(p, spawn())
          continue
        }

        const z = p.z - camera
        if (z < 14) continue

        const scale = FOCAL / (z + FOCAL)
        const x = cx + Math.cos(p.angle) * p.radius * scale * fit
        const y = cy + Math.sin(p.angle) * p.radius * scale * 0.82 * fit

        if (x < -60 || x > w + 60 || y < -60 || y > h + 60) continue

        const size = p.size * scale * 2.45 * fit
        if (size < 0.12) continue

        // Fade in from the far plane, out at the near plane and at the core.
        const far = Math.min(1, (DEPTH - z) / 420)
        const near = Math.min(1, z / 220)
        const core = Math.min(1, (p.radius - 26) / 110)
        const alpha = Math.min(1, far * near * core * (p.ring ? 1 : 0.92))
        if (alpha <= 0.01) continue

        const [r, g, b] = p.tone

        if (p.ring) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.lineWidth = Math.max(0.6, size * 0.16)
          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.stroke()

          if (scale > 0.5) {
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.14})`
            ctx.beginPath()
            ctx.arc(x, y, size * 0.74, 0, Math.PI * 2)
            ctx.fill()
          }
        } else {
          // Near particles bloom slightly — cheap depth-of-field.
          if (scale > 0.78) {
            const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 4)
            glow.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.55})`)
            glow.addColorStop(1, `rgba(${r},${g},${b},0)`)
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.arc(x, y, size * 4, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

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
    <div ref={wrapRef} className={className || 'relative'} aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Core */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <div className="absolute -inset-24 rounded-full bg-[radial-gradient(circle,rgba(59,123,255,0.42),transparent_68%)] blur-2xl" />
          {[0, 1].map(i => (
            <div
              key={i}
              className="absolute inset-0 rounded-full border border-[var(--periwinkle)]/30"
              style={{
                animation: `arc-pulse-ring 3.4s ease-out ${i * 1.7}s infinite`,
              }}
            />
          ))}
          <div className="relative w-[112px] h-[112px] rounded-full bg-gradient-to-b from-[#3d80e0] to-[#13407f] shadow-[0_0_70px_rgba(39,117,202,0.6)] flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="w-14 h-14 text-white" fill="none">
              <path d="M4 27 C 7 9, 15 4, 20 4 C 25 4, 28 12, 28 27" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M11 27 C 12 17, 16 13, 20 13" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
