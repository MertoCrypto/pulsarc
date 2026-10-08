import { useRef } from 'react'
import { Download } from 'lucide-react'
import { PulsarcMark, type MarkVariant } from '@/components/brand/PulsarcMark'

const OPTIONS: { variant: MarkVariant; name: string; idea: string }[] = [
  { variant: 'ring', name: 'A · Orbit', idea: 'An orbit broken by a single beat. The ring is the ecosystem, the line is its pulse.' },
  { variant: 'beacon', name: 'B · Beacon', idea: 'A pulsar sending out arcs. The name drawn literally: pulses made of arcs.' },
]

const NAVY = '#0b182c'

/** Serialises an on-page SVG and paints it on a canvas so it can be saved as a PNG. */
async function svgToImage(svg: SVGSVGElement, size: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(size))
  clone.setAttribute('height', String(size))
  clone.style.color = '#ffffff'
  clone.querySelectorAll('.pm-beat').forEach(n => n.remove())
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
  URL.revokeObjectURL(url)
  return img
}

function backdrop(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number) {
  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, w, h)
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6)
  g.addColorStop(0, '#17355f')
  g.addColorStop(0.45, '#0f2342')
  g.addColorStop(1, NAVY)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function save(canvas: HTMLCanvasElement, name: string) {
  const a = document.createElement('a')
  a.download = name
  a.href = canvas.toDataURL('image/png')
  a.click()
}

async function exportAvatar(svg: SVGSVGElement, variant: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const ctx = c.getContext('2d')!
  backdrop(ctx, 1024, 1024, 512, 480)
  const img = await svgToImage(svg, 620)
  ctx.drawImage(img, 202, 202)
  save(c, `pulsarc-avatar-${variant}.png`)
}

async function exportBanner(svg: SVGSVGElement, variant: string) {
  await document.fonts.ready
  const c = document.createElement('canvas')
  c.width = 1500
  c.height = 500
  const ctx = c.getContext('2d')!
  backdrop(ctx, 1500, 500, 900, 250)
  const img = await svgToImage(svg, 150)
  ctx.font = '300 124px "Inter Tight", sans-serif'
  const word = ctx.measureText('Pulsarc').width
  const total = 150 + 36 + word
  const x = (1500 - total) / 2 + 60
  ctx.drawImage(img, x, 150)
  ctx.textBaseline = 'middle'
  ctx.font = '300 124px "Inter Tight", sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('Pulsarc', x + 186, 228)
  ctx.font = '400 21px "Geist Mono", monospace'
  ctx.fillStyle = '#7f95b4'
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '7px'
  ctx.fillText('THE PULSE OF ARC', x + 190, 338)
  save(c, `pulsarc-banner-${variant}.png`)
}

function Option({ variant, name, idea }: (typeof OPTIONS)[number]) {
  const ref = useRef<HTMLDivElement>(null)
  const svg = () => ref.current?.querySelector('svg') as SVGSVGElement

  return (
    <section className="arc-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-6 py-4">
        <div>
          <p className="text-[17px] text-white">{name}</p>
          <p className="mt-1 max-w-[520px] text-sm text-[var(--muted)]">{idea}</p>
        </div>
        <div className="flex gap-2">
          <button className="arc-btn-ghost" onClick={() => { void exportAvatar(svg(), variant) }}><Download className="h-3.5 w-3.5" /> Avatar PNG</button>
          <button className="arc-btn-ghost" onClick={() => { void exportBanner(svg(), variant) }}><Download className="h-3.5 w-3.5" /> Banner PNG</button>
        </div>
      </div>

      <div className="grid gap-px bg-[var(--line)] md:grid-cols-[280px_1fr]">
        {/* avatar, shown as the round crop X uses */}
        <div className="flex items-center justify-center bg-[var(--bg)] p-8">
          <div ref={ref} className="flex h-[200px] w-[200px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_46%,#17355f,#0f2342_45%,#0b182c)] shadow-[0_0_0_1px_var(--line),0_20px_60px_rgba(0,0,0,0.5)]">
            <PulsarcMark variant={variant} className="h-[118px] w-[118px] text-white" animated />
          </div>
        </div>

        {/* banner */}
        <div className="flex min-h-[200px] items-center justify-center bg-[radial-gradient(ellipse_at_60%_50%,#17355f,#0f2342_42%,#0b182c_78%)] p-8">
          <div>
            <div className="flex items-center gap-5">
              <PulsarcMark variant={variant} className="h-[72px] w-[72px] text-white" animated />
              <span className="text-[64px] font-light leading-none tracking-[-0.02em] text-white">Pulsarc</span>
            </div>
            <p className="mt-5 pl-[92px] font-['Geist_Mono'] text-[11px] uppercase tracking-[0.34em] text-[var(--muted)]">The pulse of Arc</p>
          </div>
        </div>
      </div>

      {/* small sizes: header, favicon, light surface */}
      <div className="flex flex-wrap items-center gap-10 border-t border-[var(--line)] px-6 py-5">
        <div className="flex items-center gap-2.5 text-white">
          <PulsarcMark variant={variant} className="h-8 w-8" animated />
          <span className="text-[22px] font-light tracking-[-0.02em]">Pulsarc</span>
        </div>
        <div className="flex items-center gap-4 text-white">
          {[32, 24, 16].map(s => <PulsarcMark key={s} variant={variant} className="shrink-0" title={`${s}px`} style={{ width: s, height: s }} />)}
          <span className="text-xs text-[var(--faint)]">32 · 24 · 16 px</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl bg-[#eef3fa] px-4 py-2 text-[#0b182c]">
          <PulsarcMark variant={variant} className="h-7 w-7" />
          <span className="text-[19px] font-light tracking-[-0.02em]">Pulsarc</span>
        </div>
      </div>
    </section>
  )
}

export function Brand() {
  return (
    <div className="mx-auto max-w-[1040px] space-y-8 pt-4">
      <div>
        <p className="arc-eyebrow mb-4">Brand</p>
        <h1 className="arc-display text-[clamp(32px,4.4vw,56px)] text-white">Two marks, one pulse.</h1>
        <p className="mt-4 max-w-[600px] text-[17px] font-light leading-relaxed text-[var(--muted)]">
          Each option is shown as the round profile picture, the banner, the header lockup and at favicon sizes. The download buttons save X-ready files.
        </p>
      </div>
      {OPTIONS.map(o => <Option key={o.variant} {...o} />)}
    </div>
  )
}
