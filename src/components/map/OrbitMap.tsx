import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefCallback } from 'react'
import { ARC_APPS, CATEGORIES } from '@/data/apps'
import { ArcLogo } from '@/components/brand/ArcLogo'
import type { RankedApp } from '@/hooks/useAllMetrics'
import { useLiveBlocks } from '@/hooks/useLiveBlocks'
import { useChainSizes } from '@/hooks/useLlama'
import { domainName } from '@/lib/bridgeFlow'
import { PORT_DOMAINS } from '@/lib/chainPorts'

import { buildAddressIndex, trackedShare } from '@/lib/liveTx'
import { PORT_COUNT_NARROW, appPlanetSize, orbitOrder, ringSlot } from '@/lib/orbitMap'
import { CctpPanel, CounterPanel, Legend, usdcLabel } from './OrbitHud'
import { OrbitPanel, type Selection } from './OrbitPanel'
import { OrbitTable, type AppRow } from './OrbitTable'
import { OrbitScene, SceneDom, appKey, portKey, type SceneApp, type SceneData } from './orbitScene'
import { AppFace, PortFace } from './portIcons'
import { STAGE_CSS } from './stageCss'
import { useOrbitFeed } from './useOrbitFeed'

const fmt = (n: number) => n.toLocaleString('en-US')
const CORE_RING = 'absolute -inset-3 rounded-full border border-[rgba(169,196,234,0.3)]'

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
  /** Rendered under the table (loading note, footnote). */
  footer?: ReactNode
}

export function OrbitMap({ items, footer }: Props) {
  const live = useLiveBlocks()
  const reduced = usePrefersReducedMotion()
  const [paused, setPaused] = useState(false)
  const motionOn = !reduced && !paused
  const stageRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<Element | null>(null)
  const sceneRef = useRef<OrbitScene | null>(null)
  const [dom] = useState(() => new SceneDom())
  const [refCache] = useState(() => new Map<string, RefCallback<HTMLElement>>())
  const [narrow, setNarrow] = useState(() => window.innerWidth < 640)
  const [selection, setSelection] = useState<Selection | null>(null)

  const { data: chainSizesData } = useChainSizes()
  const chainSizes = chainSizesData?.sizes ?? null

  const index = useMemo(() => buildAddressIndex(ARC_APPS), [])
  const metricsById = useMemo(() => new Map(items.map(r => [r.app.id, r.metrics])), [items])

  // ── Layout data ──────────────────────────────────────────────────────────
  const { data, rows, labelled } = useMemo(() => {
    const tx = (id: string) => metricsById.get(id)?.txCount ?? 0
    const totals: Record<string, number> = {}
    for (const a of ARC_APPS) totals[a.category] = (totals[a.category] ?? 0) + tx(a.id)
    const sum = Object.values(totals).reduce((s, n) => s + n, 0)
    const order = orbitOrder(totals, CATEGORIES).filter(c => ARC_APPS.some(a => a.category === c))
    const maxTx = ARC_APPS.reduce((m, a) => Math.max(m, tx(a.id)), 0)
    const apps: SceneApp[] = []
    order.forEach((cat, ring) => {
      const inRing = ARC_APPS.filter(a => a.category === cat).sort((a, b) => tx(b.id) - tx(a.id))
      inRing.forEach((a, i) => apps.push({
        id: a.id, name: a.name, category: cat, ring, slot: ringSlot(i, inRing.length, ring), size: appPlanetSize(tx(a.id), maxTx), tx: tx(a.id),
      }))
    })
    // Build ports with sizes from chainSizes (or default size 32 when not yet loaded)
    const sizeByDomain = chainSizes ? new Map(chainSizes.map(s => [s.domain, s])) : null
    const ports = PORT_DOMAINS.map(domain => {
      const sz = sizeByDomain?.get(domain)
      const size = sz ? Math.round(sz.radius * 2) : 32
      const weight = sz?.weight ?? 0.5
      return { domain, name: domainName(domain), size, weight }
    })
    const sceneData: SceneData = {
      rings: order.map(c => ({ key: c, label: sum > 0 ? `${c} · ${Math.round((100 * (totals[c] ?? 0)) / sum)}%` : c })),
      apps,
      ports,
    }
    const table: AppRow[] = apps.map(a => ({ id: a.id, name: a.name, category: a.category, tx: a.tx }))
    const top = new Set([...apps].sort((a, b) => b.tx - a.tx).slice(0, 4).map(a => a.id))
    return { data: sceneData, rows: table, labelled: top }
  }, [metricsById, chainSizes])

  const ariaLabel = useMemo(() => {
    const rings = data.rings.map(r => r.label).join(', ')
    return `Arc galaxy. Apps orbit the Arc core on rings from the core outward: ${rings}. Other networks float around the galaxy — USDC crosses to and from them through CCTP.`
  }, [data])

  // ── Scene lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return
    const scene = new OrbitScene(canvas, dom)
    sceneRef.current = scene
    let onScreen = true
    const sync = () => scene.setActive(onScreen && !document.hidden)
    const fit = () => {
      const r = stage.getBoundingClientRect()
      setNarrow(r.width < 640)
      scene.resize(r.width, r.height, window.devicePixelRatio || 1, 0)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(stage)
    const io = new IntersectionObserver(entries => { onScreen = entries.some(e => e.isIntersecting); sync() })
    io.observe(stage)
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
  }, [dom])

  useEffect(() => { sceneRef.current?.setData(data) }, [data])
  useEffect(() => { sceneRef.current?.setReducedMotion(reduced) }, [reduced])
  useEffect(() => { sceneRef.current?.setPaused(paused) }, [paused])
  useEffect(() => {
    const key = !selection ? null : selection.kind === 'app' ? appKey(selection.id) : portKey(selection.domain)
    sceneRef.current?.setSelected(key)
  }, [selection])

  const { liveCounts, seen, stats, pulses } = useOrbitFeed(live, sceneRef, index, motionOn)

  // ── Panel: Esc closes, focus moves in and returns ─────────────────────────
  const close = useCallback(() => {
    setSelection(null)
    const back = returnFocus.current
    returnFocus.current = null
    if (back instanceof HTMLElement && back.isConnected) back.focus()
  }, [])
  const open = useCallback((s: Selection) => {
    if (!returnFocus.current) returnFocus.current = document.activeElement
    setSelection(s)
  }, [])
  useEffect(() => {
    if (!selection) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, close])

  // Stable callback refs: the scene reads positions straight from these elements.
  const refFor = (key: string): RefCallback<HTMLElement> => {
    let cb = refCache.get(key)
    if (!cb) {
      cb = el => dom.setNode(key, el)
      refCache.set(key, cb)
    }
    return cb
  }
  const hover = (key: string | null) => sceneRef.current?.setHover(key)

  const shownPorts = narrow ? PORT_DOMAINS.slice(0, PORT_COUNT_NARROW) : PORT_DOMAINS
  const share = trackedShare(seen)
  const selectedApp = selection?.kind === 'app' ? ARC_APPS.find(a => a.id === selection.id) ?? null : null
  // Lookup chain size info for the panel
  const selectedPortSize = selection?.kind === 'port' && chainSizes
    ? chainSizes.find(s => s.domain === selection.domain) ?? null
    : null

  const counters = (
    <CounterPanel blocks={live.seenBlocks} txs={live.seenTxs} latest={live.latest} share={share} skipped={live.skipped} error={live.error} />
  )
  const legend = <Legend motionOn={motionOn} reduced={reduced} onToggle={() => setPaused(p => !p)} className="justify-end" />

  return (
    <div>
      <style>{STAGE_CSS}</style>

      {/* Stage: full-viewport width, breaks out of the container */}
      <section
        ref={stageRef}
        data-paused={!motionOn}
        aria-label="Arc galaxy"
        className="om-stage relative overflow-x-clip overflow-y-hidden"
        style={{
          // Full viewport width from inside a constrained container
          position: 'relative',
          left: '50%',
          width: '100vw',
          transform: 'translateX(-50%)',
          height: 'max(560px, 92svh)',
          background: 'radial-gradient(ellipse 80% 70% at 50% 48%, #0a1426 0%, #08111f 45%, var(--bg) 100%)',
        }}
      >
        <div className="om-grain" aria-hidden />

        <div role="img" aria-label={ariaLabel} className="absolute inset-0">
          <canvas ref={canvasRef} className="absolute inset-0 block" aria-hidden />
        </div>

        {/* Full stage frame */}
        <div className="absolute inset-0">
          {/* Tiny LIVE indicator — only allowed overlay inside stage */}
          <div className="pointer-events-none absolute left-4 top-4 z-50 flex items-center gap-1.5" aria-hidden>
            <span className="relative flex h-1.5 w-1.5">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${live.error ? 'bg-[#ff7a8a]' : 'bg-[#5ee6a8]'} opacity-60`} />
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${live.error ? 'bg-[#ff7a8a]' : 'bg-[#5ee6a8]'}`} />
            </span>
            <span className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.14em] text-white/40">Live</span>
          </div>

          {/* Core: the Arc mark on a quiet disc */}
          <div ref={el => dom.setCore(el)} className="pointer-events-none absolute left-0 top-0 z-[45] will-change-transform" aria-hidden>
            <div className="relative">
              <div
                ref={el => dom.setHalo(el)}
                className="absolute -inset-9 rounded-full bg-[radial-gradient(circle,rgba(86,150,255,0.55),rgba(59,123,255,0.14)_58%,transparent_72%)]"
              />
              {[0, 1].map(i => (
                <div key={i} className={CORE_RING} style={{ animation: `arc-core-ring 2.6s cubic-bezier(.2,.6,.3,1) ${i * 0.32}s infinite` }} />
              ))}
              {pulses.map(p => (
                <div
                  key={p.id}
                  className="absolute -inset-3 rounded-full border-2 border-[rgba(195,214,242,0.75)]"
                  style={{ opacity: 0, animation: `arc-core-ring 1.9s cubic-bezier(.2,.6,.3,1) ${p.delay}s forwards` }}
                />
              ))}
              <div className="relative flex h-[100px] w-[100px] items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_30%,#4a8cf0,#14407f_62%,#0c2a57)] shadow-[0_0_40px_rgba(59,123,255,0.65),inset_0_1px_0_rgba(255,255,255,0.25)]">
                <span className="arc-core-beat absolute inset-0" />
                <ArcLogo className="relative h-[37px] w-auto" />
              </div>
            </div>
          </div>

          {/* Apps */}
          {data.apps.map(a => {
            const app = ARC_APPS.find(x => x.id === a.id)
            if (!app) return null
            const round = app.kind === 'asset'
            return (
              <button
                key={a.id}
                ref={refFor(appKey(a.id))}
                type="button"
                tabIndex={-1}
                aria-hidden
                data-active="false"
                title={`${a.name} · ${a.category}`}
                onMouseEnter={() => hover(appKey(a.id))}
                onMouseLeave={() => hover(null)}
                onClick={() => open({ kind: 'app', id: a.id })}
                className="om-node absolute left-0 top-0 flex flex-col items-center opacity-0 will-change-transform"
              >
                <span className={`om-face ${round ? 'rounded-full' : 'rounded-[10px]'}`} style={{ width: a.size, height: round ? a.size : a.size * 0.65 }}>
                  <AppFace app={app} size={a.size} />
                </span>
                {(!narrow || labelled.has(a.id)) && <span className="om-label">{a.name}</span>}
                <span className="om-note">{`${a.category} · ${fmt(a.tx)} transactions, 24h`}</span>
              </button>
            )
          })}

          {/* Other networks: free-body nodes scattered around the galaxy */}
          {shownPorts.map((d, _i) => {
            const s = stats.ports[d]
            const total = s ? s.inCount + s.outCount : 0
            const sz = chainSizes?.find(cs => cs.domain === d)
            const portSize = sz ? Math.round(sz.radius * 2) : 32
            return (
              <button
                key={d}
                ref={refFor(portKey(d))}
                type="button"
                tabIndex={-1}
                aria-hidden
                data-active="false"
                data-lit={total > 0}
                title={domainName(d)}
                onMouseEnter={() => hover(portKey(d))}
                onMouseLeave={() => hover(null)}
                onClick={() => open({ kind: 'port', domain: d })}
                className="om-node om-port absolute left-0 top-0 flex flex-col items-center opacity-0 will-change-transform"
                style={{ '--port-weight': sz?.weight ?? 0.5 } as React.CSSProperties}
              >
                {/* icon at full opacity, on top */}
                <span className="om-port-icon" style={{ width: portSize, height: portSize }}>
                  <PortFace domain={d} size={portSize} />
                </span>
                <span className="om-port-body">
                  <span className="relative">
                    <span className="om-face rounded-full" style={{ width: portSize, height: portSize }} />
                    {total > 0 && s && <span className="om-badge" title={`${s.inCount} in, ${s.outCount} out`}>{total}</span>}
                  </span>
                  {!narrow && <span className="om-label">{domainName(d)}</span>}
                </span>
                <span className="om-note">{`CCTP domain ${d}${total > 0 && s ? ` · ${s.inCount} in, ${s.outCount} out` : ''}${sz ? ` · ${sz.assets !== null ? `$${(sz.assets / 1e9).toFixed(1)}B in DeFi apps` : ''}` : ''}`}</span>
              </button>
            )
          })}

          {/* Keyboard and screen-reader route to every planet and port */}
          <ul className="absolute left-3 top-3 z-[80] m-0 list-none p-0">
            {rows.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  className="sr-only focus:not-sr-only focus:mb-1 focus:rounded-lg focus:border focus:border-[var(--line-strong)] focus:bg-[var(--surface)] focus:px-3 focus:py-1.5 focus:text-sm focus:text-[var(--text)]"
                  onFocus={() => hover(appKey(p.id))}
                  onBlur={() => hover(null)}
                  onClick={() => open({ kind: 'app', id: p.id })}
                >
                  {`${p.name}, ${p.category}, ${fmt(p.tx)} transactions in 24 hours. Open details.`}
                </button>
              </li>
            ))}
            {shownPorts.map(d => {
              const s = stats.ports[d]
              return (
                <li key={d}>
                  <button
                    type="button"
                    className="sr-only focus:not-sr-only focus:mb-1 focus:rounded-lg focus:border focus:border-[var(--line-strong)] focus:bg-[var(--surface)] focus:px-3 focus:py-1.5 focus:text-sm focus:text-[var(--text)]"
                    onFocus={() => hover(portKey(d))}
                    onBlur={() => hover(null)}
                    onClick={() => open({ kind: 'port', domain: d })}
                  >
                    {`${domainName(d)}, CCTP domain ${d}, ${usdcLabel(s?.inUsdc ?? 0)} USDC in and ${usdcLabel(s?.outUsdc ?? 0)} out since you opened this page. Open details.`}
                  </button>
                </li>
              )
            })}
          </ul>

          {selection && (
            <OrbitPanel
              ref={closeRef}
              selection={selection}
              app={selectedApp}
              metrics={selectedApp ? metricsById.get(selectedApp.id) : undefined}
              liveSeen={selectedApp ? liveCounts[selectedApp.id] ?? 0 : 0}
              port={selection.kind === 'port' ? stats.ports[selection.domain] : undefined}
              portSize={selectedPortSize}
              onClose={close}
            />
          )}
        </div>
      </section>

      {/* Below-stage strip: counters + CCTP panel */}
      <div className="mt-4 grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
        {counters}
        <CctpPanel stats={stats} />
      </div>

      {/* Legend + motion toggle */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {legend}
      </div>

      <div className="mt-8">
        <OrbitTable apps={rows} liveCounts={liveCounts} />
        {footer}
      </div>
    </div>
  )
}
