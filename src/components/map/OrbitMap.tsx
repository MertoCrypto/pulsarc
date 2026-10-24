import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { ARC_APPS, CATEGORIES, type ArcApp } from '@/data/apps'
import type { RankedApp } from '@/hooks/useAllMetrics'
import { useLiveBlocks } from '@/hooks/useLiveBlocks'
import { buildAddressIndex, classifyTx, trackedShare } from '@/lib/liveTx'
import { CATEGORY_COLORS, orbitOrder, type OrbitKey } from '@/lib/orbitMap'
import { count } from '@/lib/numberFormat'
import { OrbitScene, type SceneData, type SceneTx } from './orbitScene'

const fmt = (n: number) => n.toLocaleString('en-US')
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

interface Props {
  items: RankedApp[]
}

export function OrbitMap({ items }: Props) {
  const live = useLiveBlocks()
  const reduced = usePrefersReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)
  const sceneRef = useRef<OrbitScene | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const desktopHudRef = useRef<HTMLDivElement>(null)
  const lastSeq = useRef(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({})
  const [seen, setSeen] = useState({ tracked: 0, total: 0 })

  const index = useMemo(() => buildAddressIndex(ARC_APPS), [])
  const metricsById = useMemo(() => new Map(items.map(r => [r.app.id, r.metrics])), [items])

  // ── Layout data: orbit order, labels, planet sizes ─────────────────────────
  const { data, rows } = useMemo(() => {
    const tx = (a: ArcApp) => metricsById.get(a.id)?.txCount ?? 0
    const totals: Record<string, number> = {}
    for (const a of ARC_APPS) totals[a.category] = (totals[a.category] ?? 0) + tx(a)
    const sum = Object.values(totals).reduce((s, n) => s + n, 0)
    const order = orbitOrder(totals, CATEGORIES)
    const labels: Record<string, string> = { Unlisted: 'Unlisted' }
    for (const c of order) labels[c] = sum > 0 ? `${c} · ${Math.round((100 * (totals[c] ?? 0)) / sum)}%` : c
    const planets = ARC_APPS.map(a => ({ id: a.id, name: a.name, category: a.category, tx: tx(a) }))
    const sceneData: SceneData = { order, planets, labels }
    const ordered = order.flatMap(c => planets.filter(p => p.category === c).sort((a, b) => b.tx - a.tx))
    return { data: sceneData, rows: ordered }
  }, [metricsById])

  const ariaLabel = useMemo(() => {
    const parts = data.order.map(c => data.labels[c] ?? c).join(', ')
    return `Arc orbit. Orbits from the core outward: ${parts}. An outermost dashed orbit holds transactions to contracts that are not tracked.`
  }, [data])

  // ── Canvas scene lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas) return
    const scene = new OrbitScene(canvas)
    sceneRef.current = scene
    let onScreen = true
    const sync = () => scene.setActive(onScreen && !document.hidden)
    const updateReserved = (w: number) => {
      // On mobile (< 640) the HUD is outside the canvas: reserve 0 px inside it.
      // On desktop the HUD is overlaid: reserve its measured height + 8 px gap.
      if (w < 640) {
        scene.setReservedBottom(0)
      } else {
        const hudH = desktopHudRef.current?.offsetHeight ?? 0
        scene.setReservedBottom(hudH + 8)
      }
    }
    const fit = () => {
      const r = box.getBoundingClientRect()
      setBoxWidth(r.width)
      scene.resize(r.width, r.height, window.devicePixelRatio || 1)
      updateReserved(r.width)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    const io = new IntersectionObserver(entries => {
      onScreen = entries.some(e => e.isIntersecting)
      sync()
    })
    io.observe(box)
    document.addEventListener('visibilitychange', sync)
    fit()
    sync()
    return () => {
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', sync)
      scene.destroy()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => { sceneRef.current?.setData(data) }, [data])
  useEffect(() => { sceneRef.current?.setReducedMotion(reduced) }, [reduced])
  useEffect(() => { sceneRef.current?.setSelected(selectedId) }, [selectedId])

  // ── Consume each newly fetched block exactly once ──────────────────────────
  useEffect(() => {
    const fresh = live.blocks.filter(b => b.seq > lastSeq.current)
    if (fresh.length === 0) return
    lastSeq.current = fresh[fresh.length - 1].seq
    const add: Record<string, number> = {}
    let tracked = 0
    let total = 0
    fresh.forEach((block, bi) => {
      const classified: SceneTx[] = block.txs.map(tx => classifyTx(tx, index))
      for (const c of classified) {
        total++
        if (c.appId) { tracked++; add[c.appId] = (add[c.appId] ?? 0) + 1 }
      }
      sceneRef.current?.addBlock(block.number, classified, bi)
    })
    setSeen(s => ({ tracked: s.tracked + tracked, total: s.total + total }))
    setLiveCounts(prev => {
      const next = { ...prev }
      for (const [id, n] of Object.entries(add)) next[id] = (next[id] ?? 0) + n
      return next
    })
  }, [live.blocks, index])

  // ── Panel: Esc closes, focus moves in ──────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  // ── Pointer ────────────────────────────────────────────────────────────────
  const hitAt = useCallback((e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const pointerType = 'pointerType' in e ? (e).pointerType : undefined
    return sceneRef.current?.hit(e.clientX - r.left, e.clientY - r.top, pointerType) ?? null
  }, [])
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const id = hitAt(e)
    sceneRef.current?.setHover(id)
    e.currentTarget.style.cursor = id ? 'pointer' : 'default'
  }

  const selected = selectedId ? ARC_APPS.find(a => a.id === selectedId) ?? null : null
  const selectedMetrics = selected ? metricsById.get(selected.id) : undefined
  const share = trackedShare(seen)
  const hhmm = timeFmt.format(live.since)

  return (
    <div>
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden rounded-[22px] border border-[var(--line)]"
        style={{
          // Mobile (< 640px): clamp(380px, 110vw, 560px) — portrait canvas.
          // Desktop: clamp(420px, 72vh, 760px).
          height: boxWidth > 0 && boxWidth < 640
            ? `clamp(380px, ${(boxWidth * 1.1).toFixed(0)}px, 560px)`
            : 'clamp(420px, 72vh, 760px)',
          background: 'radial-gradient(ellipse at 50% 50%, #0d1c34 0%, #08111f 70%)',
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          className="absolute inset-0 block h-full w-full"
          onPointerMove={onMove}
          onPointerLeave={() => sceneRef.current?.setHover(null)}
          onClick={e => { const id = hitAt(e); if (id) setSelectedId(id) }}
        />

        {/* Keyboard and screen-reader route to every planet */}
        <ul className="absolute left-3 top-3 z-10 m-0 list-none p-0">
          {rows.map(p => (
            <li key={p.id}>
              <button
                type="button"
                className="sr-only focus:not-sr-only focus:mb-1 focus:rounded-lg focus:border focus:border-[var(--line-strong)] focus:bg-[var(--surface)] focus:px-3 focus:py-1.5 focus:text-sm focus:text-[var(--text)]"
                onFocus={() => sceneRef.current?.setHover(p.id)}
                onBlur={() => sceneRef.current?.setHover(null)}
                onClick={() => setSelectedId(p.id)}
              >
                {`${p.name}, ${p.category}, ${fmt(p.tx)} transactions in 24 hours. Open details.`}
              </button>
            </li>
          ))}
        </ul>

        {/* HUD overlay — desktop only (≥ sm / ≥ 640 px); hidden on mobile via sm:block */}
        <div ref={desktopHudRef} className="pointer-events-none absolute bottom-3 left-4 z-[5] hidden font-mono text-[11px] leading-5 text-[var(--faint)] sm:block">
          <div>{`${fmt(live.seenTxs)} txs · ${fmt(live.seenBlocks)} blocks since ${hhmm}`}</div>
          <div>{live.latest === null ? 'Waiting for the first block…' : `Latest block ${fmt(live.latest)}`}</div>
          {live.skipped > 0 && <div>{`${fmt(live.skipped)} blocks skipped to keep up`}</div>}
          {live.error && <div className="text-[var(--negative)]">Arc RPC unreachable. Retrying.</div>}
        </div>
        <div className="pointer-events-none absolute bottom-3 right-4 z-[5] hidden text-right font-mono text-[11px] leading-5 text-[var(--faint)] sm:block">
          <div>{share === null ? 'Waiting for transactions' : `${Math.round(share)}% to tracked apps`}</div>
          {reduced && <div>Motion reduced</div>}
        </div>

        {/* Side panel (desktop) / bottom sheet (mobile) */}
        {selected && (
          <aside
            aria-label={`${selected.name} details`}
            className="absolute inset-x-0 bottom-0 z-20 max-h-[75%] overflow-y-auto rounded-t-[20px] border border-[var(--line-strong)] bg-[var(--surface)] p-5 sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-[320px] sm:rounded-[16px]"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close details"
              className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--muted)] transition-colors hover:text-white"
            >
              <X size={18} />
            </button>
            <p className="flex items-center gap-2 font-mono text-[11px] text-[var(--muted)]">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[selected.category] }} />
              {selected.category}
            </p>
            <h2 className="mt-2 pr-8 text-2xl font-light text-white">{selected.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{selected.description}</p>
            <dl className="mt-5 grid grid-cols-1 gap-3">
              <Stat label="Transactions, 24h" value={selectedMetrics ? fmt(selectedMetrics.txCount) : 'Loading'} />
              <Stat label="Active wallets, 24h" value={selectedMetrics ? fmt(selectedMetrics.activeWallets) : 'Loading'} />
              <Stat label="Live txs seen since you opened the page" value={fmt(liveCounts[selected.id] ?? 0)} />
            </dl>
            <Link
              to={`/dapp/${selected.id}`}
              className="mt-5 inline-block text-sm text-[var(--periwinkle)] underline-offset-4 hover:underline"
            >
              {`Open ${selected.name}`}
            </Link>
          </aside>
        )}
      </div>

      {/*
        HUD layout:
        - mobile (< sm / < 640 px): normal-flow row below the canvas, two columns, wrapping allowed.
        - desktop (≥ sm): absolute overlay inside the canvas card via negative margin trick —
          we can't portal inside a relative parent from outside, so we replicate the content in
          both places and toggle visibility with Tailwind's sm: prefix. This keeps the DOM
          simple and avoids a ref-portal.
      */}
      {/* Mobile-only HUD (below canvas, visible only < sm) */}
      <div
        ref={hudRef}
        className="sm:hidden mt-2 flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-1 font-mono text-[11px] leading-5 text-[var(--faint)]"
      >
        <div className="min-w-0">
          <div>{`${fmt(live.seenTxs)} txs · ${fmt(live.seenBlocks)} blocks since ${hhmm}`}</div>
          <div>{live.latest === null ? 'Waiting for the first block…' : `Latest block ${fmt(live.latest)}`}</div>
          {live.error && <div className="text-[var(--negative)]">Arc RPC unreachable. Retrying.</div>}
        </div>
        <div className="min-w-0 text-right">
          <div>{share === null ? 'Waiting for transactions' : `${Math.round(share)}% to tracked apps`}</div>
          {reduced && <div>Motion reduced</div>}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[14px] border border-[var(--line)]">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <caption className="px-4 py-3 text-left font-mono text-[11px] text-[var(--muted)]">Arc orbit — apps by category</caption>
          <thead>
            <tr className="border-t border-[var(--line)] text-[var(--faint)]">
              <th scope="col" className="px-4 py-2 font-normal">Category</th>
              <th scope="col" className="px-4 py-2 font-normal">App</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">24h transactions</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">Live txs seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id} className="border-t border-[var(--line)] text-[var(--text)]">
                <td className="px-4 py-2 text-[var(--muted)]">{p.category}</td>
                <th scope="row" className="px-4 py-2 font-normal">{p.name}</th>
                <td className="px-4 py-2 text-right font-mono">{count(p.tx)}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(liveCounts[p.id] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--faint)]">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg text-white">{value}</dd>
    </div>
  )
}
