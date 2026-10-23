/**
 * Arc Transit Map — SVG metro diagram of the Arc ecosystem.
 *
 * Visual language: dark navy, periwinkle thin lines, Geist Mono labels,
 * Inter Tight numbers — matching the rest of the Pulsarc site.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'
import {
  buildTransitLayout,
  placeLabels,
  contentBounds,
  trainCount,
  pointAlong,
  clampZoom,
  labelBoxK,
  subLabelBox,
  labelAnchor,
  SUB_LABEL_TEXT,
  type LabelBox,
  type Station,
  type LayoutResult,
} from '@/lib/transitMap'
import { ARC_APPS, CATEGORIES, type ArcApp, type AppCategory } from '@/data/apps'
import { PORTAL, PORTAL_APPS } from '@/data/portal'
import { compact, count } from '@/lib/arcscan'
import type { RankedApp } from '@/hooks/useAllMetrics'

// ─── Palette ──────────────────────────────────────────────────────────────────

const LINE_COLORS: Record<string, string> = {
  Stablecoin: '#a9c4ea',  // periwinkle
  DeFi:       '#3b7bff',  // arc-blue
  RWA:        '#2775ca',  // usdc blue
  Payments:   '#5ee6a8',  // positive green
  Agents:     '#b9a7ff',  // lilac
  Infra:      '#f5c26b',  // warn amber
  Portal:     'var(--faint)',
}

interface AppMeta {
  app: ArcApp
  tx: number
  wallets: number
  description?: string
}

interface TransitMapProps {
  rankedApps: RankedApp[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEW_W = 1200
const VIEW_H = 680  // 16:10-ish

const TRAIN_SPEED = 0.00008   // t-units per ms

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useReducedMotion(): boolean {
  const [rm, setRm] = useState(
    () => typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setRm(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return rm
}

// ─── Station Tooltip ─────────────────────────────────────────────────────────

interface TooltipProps {
  station: Station
  color: string
  volume?: number
}

function StationTooltip({ station, color, volume }: TooltipProps) {
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-xl border p-3 shadow-2xl"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--line-strong)',
        minWidth: 180,
        maxWidth: 240,
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-sm font-medium text-white">{station.name}</span>
      </div>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4 text-xs text-[var(--muted)]">
          <span>Transactions</span>
          <span className="tabular-nums text-white">{count(station.tx)}</span>
        </div>
        <div className="flex justify-between gap-4 text-xs text-[var(--muted)]">
          <span>Wallets</span>
          <span className="tabular-nums text-white">{count(station.wallets)}</span>
        </div>
        {volume != null && volume > 0 && (
          <div className="flex justify-between gap-4 text-xs text-[var(--muted)]">
            <span>Volume</span>
            <span className="tabular-nums text-white">${compact(volume, 1)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  station: Station
  color: string
  volume?: number
  description?: string
  onClose: () => void
}

function DetailPanel({ station, color, volume, description, onClose }: DetailPanelProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="arc-card flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <span className="arc-eyebrow">{station.line} line</span>
          </div>
          <p className="text-xl font-light text-white">{station.name}</p>
          {description && (
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="mt-0.5 rounded-lg p-1.5 transition-colors hover:bg-white/10"
        >
          <X size={16} className="text-[var(--muted)]" />
        </button>
      </div>

      <dl className="space-y-2">
        <div className="flex justify-between border-t pt-2 text-sm" style={{ borderColor: 'var(--line)' }}>
          <dt className="text-[var(--muted)]">Transactions (24h)</dt>
          <dd className="tabular-nums text-white">{count(station.tx)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 text-sm" style={{ borderColor: 'var(--line)' }}>
          <dt className="text-[var(--muted)]">Active wallets</dt>
          <dd className="tabular-nums text-white">{count(station.wallets)}</dd>
        </div>
        {volume != null && volume > 0 && (
          <div className="flex justify-between border-t pt-2 text-sm" style={{ borderColor: 'var(--line)' }}>
            <dt className="text-[var(--muted)]">Dollars moved</dt>
            <dd className="tabular-nums text-white">${compact(volume, 1)}</dd>
          </div>
        )}
      </dl>

      <Link
        to={`/dapp/${station.id}`}
        className="arc-btn-ghost mt-1 w-full justify-center text-center text-sm"
      >
        Open app page
      </Link>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TransitMap({ rankedApps }: TransitMapProps) {
  const reducedMotion = useReducedMotion()

  // ── Build layout input ───────────────────────────────────────────────────

  const metricsMap = useMemo(() => {
    const m = new Map<string, AppMeta>()
    for (const { app, metrics } of rankedApps) {
      m.set(app.id, { app, tx: metrics.txCount, wallets: metrics.activeWallets, description: app.description })
    }
    // Also add description for apps not yet in rankedApps (tx=0)
    for (const app of ARC_APPS) {
      if (!m.has(app.id)) {
        m.set(app.id, { app, tx: 0, wallets: 0, description: app.description })
      }
    }
    return m
  }, [rankedApps])

  const volumeMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const { app, metrics } of rankedApps) {
      if (metrics.volume != null && metrics.volume > 0) {
        m.set(app.id, metrics.volume)
      }
    }
    return m
  }, [rankedApps])

  const trackedIds = useMemo(() => new Set(ARC_APPS.map((a: ArcApp) => a.id.toLowerCase())), [])

  const lineInputs = useMemo(() => {
    // Category lines
    const categoryLines = CATEGORIES.map((cat: AppCategory) => {
      const apps = ARC_APPS.filter((a: ArcApp) => a.category === cat)
      return {
        key: cat as string,
        dashed: false,
        stations: apps.map((app: ArcApp) => {
          const meta = metricsMap.get(app.id)
          return {
            id: app.id,
            name: app.name,
            line: cat as string,
            tx: meta?.tx ?? 0,
            wallets: meta?.wallets ?? 0,
          }
        }),
      }
    })

    // Portal line: only apps NOT already tracked.
    const portalStations = PORTAL_APPS
      .filter((p: { key: string }) => !trackedIds.has(p.key.toLowerCase()))
      .map((p: { key: string; name: string }) => ({
        id: `portal:${p.key}`,
        name: p.name,
        line: 'Portal',
        tx: 0,
        wallets: 0,
        hollow: true,
      }))

    const all = [...categoryLines]
    if (portalStations.length > 0) {
      all.push({ key: 'Portal', dashed: true, stations: portalStations })
    }

    return all
  }, [metricsMap, trackedIds])

  // ── Geometry layout (positions only, no label placement) ─────────────────

  const geometry: LayoutResult = useMemo(() =>
    buildTransitLayout(lineInputs, { width: VIEW_W, height: VIEW_H }),
  [lineInputs])

  // ── Content bounds (stable — uses k=1 label boxes for viewBox) ───────────

  const bounds = useMemo(() => contentBounds(geometry), [geometry])

  // ── Pan / zoom state ─────────────────────────────────────────────────────

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanningState, setIsPanningState] = useState(false)
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Rendered SVG pixel width — measured by ResizeObserver on the SVG element.
  // Used to compute unitsPerPx for label placement.
  const [svgPixelWidth, setSvgPixelWidth] = useState(VIEW_W)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) setSvgPixelWidth(w)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // unitsPerPx at fit (zoom=1): viewBoxWidth / renderedPixelWidth
  // At zoom>1, the actual unitsPerPx shrinks proportionally.
  const unitsPerPxAtFit = useMemo(() => {
    if (svgPixelWidth <= 0) return 1
    return bounds.width / svgPixelWidth
  }, [bounds.width, svgPixelWidth])

  // Debounced zoom for label re-placement — zooming in may reveal labels;
  // zooming out never shows newly overlapping ones.
  const [debouncedZoom, setDebouncedZoom] = useState(zoom)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedZoom(zoom), 150)
    return () => clearTimeout(id)
  }, [zoom])

  // Rounded unitsPerPx (0.05 steps) to avoid spurious memo invalidation.
  // At fit view unitsPerPx = unitsPerPxAtFit; zooming in divides by zoom.
  // Zooming out never makes labels appear that were hidden at fit, so clamp
  // the effective k to at most unitsPerPxAtFit (placement is strictest at fit).
  const roundedK = useMemo(() => {
    const raw = unitsPerPxAtFit / Math.max(1, debouncedZoom)
    return Math.round(raw / 0.05) * 0.05
  }, [unitsPerPxAtFit, debouncedZoom])

  // Label-placed layout, re-computed only when geometry or rounded k changes.
  const layout: LayoutResult = useMemo(() =>
    placeLabels(geometry, roundedK),
  [geometry, roundedK])

  // Container size (for viewBox calculation)
  const [containerSize, setContainerSize] = useState({ w: VIEW_W, h: VIEW_H })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) setContainerSize({ w: width, h: height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Adaptive SVG height for narrow containers: follow content aspect ratio
  // instead of a fixed 568px, so there is no large empty band.
  const svgHeight = useMemo(() => {
    if (containerSize.w >= 480) return 'min(70vh, 640px)'
    const aspectH = Math.round(containerSize.w * bounds.height / bounds.width)
    const clamped = Math.min(560, Math.max(320, aspectH))
    return `${clamped}px`
  }, [containerSize.w, bounds.width, bounds.height])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.ctrlKey ? -e.deltaY * 0.01 : -e.deltaY * 0.003
    setZoom(z => clampZoom(z + delta))
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isPanning.current = true
    setIsPanningState(true)
    lastPan.current = { x: e.clientX, y: e.clientY }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return
    const dx = (e.clientX - lastPan.current.x) / zoom
    const dy = (e.clientY - lastPan.current.y) / zoom
    lastPan.current = { x: e.clientX, y: e.clientY }
    setPan(p => ({ x: p.x + dx, y: p.y + dy }))
  }, [zoom])

  const onPointerUp = useCallback(() => {
    isPanning.current = false
    setIsPanningState(false)
  }, [])

  // ── Interaction state ────────────────────────────────────────────────────

  const [hovered, setHovered] = useState<Station | null>(null)
  const [hoveredPos, setHoveredPos] = useState({ x: 0, y: 0 })
  const [selected, setSelected] = useState<Station | null>(null)
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null)

  // ── Train animation ───────────────────────────────────────────────────────
  const trainOffsets = useRef<Map<string, number>>(new Map())
  const [trainSnapshot, setTrainSnapshot] = useState<ReadonlyMap<string, number>>(new Map())
  const rafRef = useRef<number>(0)
  const lastTime = useRef<number>(0)

  useEffect(() => {
    if (reducedMotion) return

    layout.lines.forEach(line => {
      const n = trainCount(line.totalTx)
      for (let i = 0; i < n; i++) {
        const key = `${line.key}-${i}`
        if (!trainOffsets.current.has(key)) {
          trainOffsets.current.set(key, i / Math.max(n, 1))
        }
      }
    })

    const tick = (ts: number) => {
      if (document.hidden) {
        lastTime.current = ts
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const dt = lastTime.current === 0 ? 0 : ts - lastTime.current
      lastTime.current = ts

      let changed = false
      trainOffsets.current.forEach((off, key) => {
        const next = (off + dt * TRAIN_SPEED) % 1
        trainOffsets.current.set(key, next)
        changed = true
      })
      if (changed) setTrainSnapshot(new Map(trainOffsets.current))
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [reducedMotion, layout])

  // ── Render helpers ────────────────────────────────────────────────────────

  const lineColor = (key: string) => LINE_COLORS[key] ?? '#8397b1'

  const stationLineColor = (s: Station) => lineColor(s.line)

  const isPortalStation = (id: string) => id.startsWith('portal:')

  const lineOpacity = (key: string) =>
    activeLineKey === null ? 1 : activeLineKey === key ? 1 : 0.25

  const polylinePath = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  type TextAnchor = 'end' | 'start' | 'middle'
  // Text is positioned from the very boxes placeLabels reserved (same k), so what is drawn is
  // what was collision-checked: anchored at the box edge/centre, vertically centred in the box.
  const textInBox = (s: Station, box: LabelBox): { x: number; y: number; textAnchor: TextAnchor } => {
    const textAnchor = labelAnchor(s)
    const x = textAnchor === 'start' ? box.x : textAnchor === 'end' ? box.x + box.w : box.x + box.w / 2
    return { x, y: box.y + box.h / 2, textAnchor }
  }
  const labelProps = (s: Station) => textInBox(s, labelBoxK(s, roundedK))
  const subLabelProps = (s: Station) => textInBox(s, subLabelBox(s, roundedK))

  const handleStationClick = useCallback((s: Station) => {
    setSelected(prev => prev?.id === s.id ? null : s)
  }, [])

  const handleStationKeyDown = useCallback((e: React.KeyboardEvent, s: Station) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleStationClick(s)
    }
  }, [handleStationClick])

  // ── Render ───────────────────────────────────────────────────────────────

  const { hub } = layout

  // scaleFactor: SVG layout units per screen pixel at the current zoom.
  // Used to keep dots and rings at a minimum screen size.
  const scaleFactor = useMemo(() => {
    const fitScaleX = bounds.width / containerSize.w
    const fitScaleY = bounds.height / containerSize.h
    return Math.max(fitScaleX, fitScaleY) / zoom
  }, [bounds, containerSize, zoom])

  const viewBox = useMemo(() => {
    const fitScaleX = bounds.width / containerSize.w
    const fitScaleY = bounds.height / containerSize.h
    const fitScale = Math.max(fitScaleX, fitScaleY)

    const vw = containerSize.w * fitScale / zoom
    const vh = containerSize.h * fitScale / zoom

    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2

    return `${(cx - vw / 2 - pan.x).toFixed(1)} ${(cy - vh / 2 - pan.y).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`
  }, [zoom, pan, bounds, containerSize])

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ── Map + controls ─────────────────────────────────────────────── */}
      <div className="relative flex-1">
        {/* Zoom controls */}
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
          {[
            { icon: <Plus size={14} />, label: 'Zoom in',  onClick: () => setZoom(z => clampZoom(z + 0.2)) },
            { icon: <Minus size={14} />, label: 'Zoom out', onClick: () => setZoom(z => clampZoom(z - 0.2)) },
            { icon: <RotateCcw size={14} />, label: 'Reset view', onClick: () => { setZoom(1); setPan({ x: 0, y: 0 }) } },
          ].map(btn => (
            <button
              key={btn.label}
              aria-label={btn.label}
              onClick={btn.onClick}
              className="flex h-7 w-7 items-center justify-center rounded-lg border text-[var(--muted)] transition-colors hover:border-[var(--periwinkle)] hover:text-white"
              style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
            >
              {btn.icon}
            </button>
          ))}
        </div>

        {/* SVG map */}
        <div ref={containerRef} className="arc-card overflow-hidden" style={{ position: 'relative', cursor: isPanningState ? 'grabbing' : 'grab' }}>
          <svg
            ref={svgRef}
            viewBox={viewBox}
            width="100%"
            style={{ height: svgHeight, display: 'block' }}
            role="img"
            aria-label="Arc ecosystem transit map"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <defs>
              {/* Hub glow */}
              <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#a9c4ea" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#a9c4ea" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* ── Lines ─────────────────────────────────────────────────── */}
            {layout.lines.map(line => {
              const color = lineColor(line.key)
              const n = reducedMotion ? 0 : trainCount(line.totalTx)
              return (
                <g key={line.key} opacity={lineOpacity(line.key)} style={{ transition: reducedMotion ? 'none' : 'opacity 0.3s ease' }}>
                  {/* Track */}
                  <path
                    d={polylinePath(line.points)}
                    fill="none"
                    stroke={color}
                    strokeWidth={line.dashed ? 1 : 1.5}
                    strokeDasharray={line.dashed ? '5 4' : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={line.dashed ? 0.5 : 0.7}
                  />

                  {/* Trains */}
                  {!reducedMotion && Array.from({ length: n }, (_, i) => {
                    const key = `${line.key}-${i}`
                    const t = trainSnapshot.get(key) ?? 0
                    const pt = pointAlong(line.points, t)
                    return (
                      <circle
                        key={key}
                        cx={pt.x}
                        cy={pt.y}
                        r={2}
                        fill={color}
                        opacity={0.9}
                      />
                    )
                  })}

                  {/* Stations */}
                  {line.stations.map(s => {
                    const lp = labelProps(s)
                    const slp = subLabelProps(s)
                    const portal = isPortalStation(s.id)
                    const labelFontSize = Math.max(7, 11 * scaleFactor)
                    const noteFontSize = Math.max(5, 8 * scaleFactor)
                    const displayR = Math.max(s.r, 5 * scaleFactor)
                    const strokeW = Math.max(0.5, 1.5 * scaleFactor)
                    const hitR = Math.max(displayR + 8 * scaleFactor, 14 * scaleFactor)
                    return (
                      <g key={s.id}>
                        {/* Hit target (larger than visible marker for easy clicking) */}
                        <circle
                          cx={s.x}
                          cy={s.y}
                          r={hitR}
                          fill="transparent"
                          tabIndex={0}
                          role="button"
                          aria-label={
                            portal
                              ? `${s.name}, listed on Arc Portal, not measured yet`
                              : `${s.name}, ${s.line} line, ${count(s.tx)} transactions in 24 hours`
                          }
                          style={{ cursor: 'pointer', outline: 'none' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (portal) {
                              window.open(PORTAL, '_blank', 'noopener,noreferrer')
                            } else {
                              handleStationClick(s)
                            }
                          }}
                          onKeyDown={(e) => handleStationKeyDown(e, s)}
                          onMouseEnter={(e: React.MouseEvent) => {
                            setHovered(s)
                            const card = (e.target as Element).closest('.arc-card')
                            if (card) {
                              const r = card.getBoundingClientRect()
                              setHoveredPos({ x: e.clientX - r.left + 10, y: e.clientY - r.top - 10 })
                            }
                          }}
                          onMouseLeave={() => setHovered(null)}
                        />

                        {/* Visible marker */}
                        {s.hollow ? (
                          <circle
                            cx={s.x}
                            cy={s.y}
                            r={displayR}
                            fill="none"
                            stroke={color}
                            strokeWidth={strokeW}
                            pointerEvents="none"
                            opacity={0.6}
                          />
                        ) : (
                          <circle
                            cx={s.x}
                            cy={s.y}
                            r={displayR}
                            fill={color}
                            pointerEvents="none"
                            opacity={selected?.id === s.id ? 1 : 0.85}
                          />
                        )}

                        {/* Selected ring */}
                        {selected?.id === s.id && (
                          <circle
                            cx={s.x}
                            cy={s.y}
                            r={displayR + 4 * scaleFactor}
                            fill="none"
                            stroke={color}
                            strokeWidth={Math.max(0.3, scaleFactor)}
                            opacity={0.6}
                            pointerEvents="none"
                          />
                        )}

                        {/* Station label */}
                        {!portal && !s.labelHidden && (
                          <text
                            x={lp.x}
                            y={lp.y}
                            dy="0.35em"
                            textAnchor={lp.textAnchor}
                            fontSize={labelFontSize}
                            fontFamily="Geist Mono, ui-monospace, monospace"
                            letterSpacing="0.1em"
                            style={{ textTransform: 'uppercase' }}
                            fill={selected?.id === s.id ? '#eaf1fb' : 'var(--muted)'}
                            pointerEvents="none"
                          >
                            {s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name}
                          </text>
                        )}

                        {/* Portal label */}
                        {portal && !s.labelHidden && (
                          <>
                            <text
                              x={lp.x}
                              y={lp.y}
                              dy="0.35em"
                              textAnchor={lp.textAnchor}
                              fontSize={labelFontSize}
                              fontFamily="Geist Mono, ui-monospace, monospace"
                              letterSpacing="0.1em"
                              fill="var(--faint)"
                              pointerEvents="none"
                            >
                              {s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name}
                            </text>
                            {s.subLabelVisible && (
                              <text
                                x={slp.x}
                                y={slp.y}
                                dy="0.35em"
                                textAnchor={slp.textAnchor}
                                fontSize={noteFontSize}
                                fontFamily="Geist Mono, ui-monospace, monospace"
                                fill="var(--faint)"
                                opacity={0.6}
                                pointerEvents="none"
                              >
                                {SUB_LABEL_TEXT}
                              </text>
                            )}
                          </>
                        )}
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {/* ── Hub ──────────────────────────────────────────────────── */}
            <g>
              <circle cx={hub.x} cy={hub.y} r={36} fill="url(#hubGlow)" />
              <circle cx={hub.x} cy={hub.y} r={18} fill="none" stroke="var(--periwinkle)" strokeWidth={1} opacity={0.4} />
              <circle cx={hub.x} cy={hub.y} r={12} fill="var(--surface)" stroke="var(--periwinkle)" strokeWidth={1.5} />
              <text
                x={hub.x}
                y={hub.y}
                textAnchor="middle"
                dy="0.38em"
                fontSize={9}
                fontFamily="Geist Mono, ui-monospace, monospace"
                fontWeight="500"
                letterSpacing="0.14em"
                fill="var(--periwinkle)"
              >
                ARC
              </text>
            </g>
          </svg>

          {/* Tooltip */}
          {hovered && (
            <div style={{ position: 'absolute', left: hoveredPos.x, top: hoveredPos.y, pointerEvents: 'none', zIndex: 20 }}>
              <StationTooltip
                station={hovered}
                color={stationLineColor(hovered)}
                volume={volumeMap.get(hovered.id)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel or legend placeholder ──────────────────────────── */}
      <div className="flex w-full flex-col gap-4 lg:w-64">
        {selected ? (
          <DetailPanel
            station={selected}
            color={stationLineColor(selected)}
            volume={volumeMap.get(selected.id)}
            description={metricsMap.get(selected.id)?.description}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="arc-card p-4">
            <p className="arc-eyebrow mb-3">Lines</p>
            <p className="mb-4 text-xs text-[var(--faint)]">Click a station to see details. Click a line chip to highlight it.</p>
            <div className="flex flex-col gap-2">
              {layout.lines.map(line => (
                <button
                  key={line.key}
                  onClick={() => setActiveLineKey(k => k === line.key ? null : line.key)}
                  aria-pressed={activeLineKey === line.key}
                  className="arc-chip flex w-full items-center justify-between text-left"
                  style={activeLineKey === line.key ? {
                    background: 'rgba(255,255,255,0.05)',
                    borderColor: lineColor(line.key),
                    color: lineColor(line.key),
                  } : undefined}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: line.dashed ? 'transparent' : lineColor(line.key), border: line.dashed ? `1.5px dashed ${lineColor(line.key)}` : 'none' }}
                    />
                    <span className="truncate text-xs">{line.key}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--faint)]">
                    {line.stations.length} · {count(line.totalTx)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Legend (full-width, under the map) ──────────────────────────────────────

interface LegendProps {
  layout: LayoutResult
  activeKey: string | null
  onToggle: (key: string) => void
}

export function TransitLegend({ layout, activeKey, onToggle }: LegendProps) {
  const lineColor = (key: string) => LINE_COLORS[key] ?? '#8397b1'

  return (
    <div className="flex flex-wrap gap-2">
      {layout.lines.map(line => (
        <button
          key={line.key}
          onClick={() => onToggle(line.key)}
          aria-pressed={activeKey === line.key}
          className="arc-chip flex items-center gap-2"
          style={activeKey === line.key ? {
            background: 'rgba(255,255,255,0.06)',
            borderColor: lineColor(line.key),
            color: lineColor(line.key),
          } : undefined}
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{
              background: line.dashed ? 'transparent' : lineColor(line.key),
              border: line.dashed ? `1.5px dashed ${lineColor(line.key)}` : 'none',
            }}
          />
          <span className="text-xs">{line.key}</span>
          <span className="text-xs tabular-nums text-[var(--faint)]">
            {line.stations.length} · {count(line.totalTx)}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Accessible fallback table ────────────────────────────────────────────────

interface AccessibleTableProps {
  layout: LayoutResult
}

export function TransitAccessibleTable({ layout }: AccessibleTableProps) {
  return (
    <details className="mt-2">
      <summary className="arc-eyebrow cursor-pointer py-2 hover:text-white">Map as a list</summary>
      <div className="mt-3 overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--line)' }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Line', 'Station', '24h Tx', 'Wallets'].map(h => (
                <th
                  key={h}
                  className="arc-eyebrow px-4 py-2 text-left"
                  style={{ fontWeight: 400 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layout.lines.flatMap(line =>
              line.stations.map((s, i) => (
                <tr
                  key={`${line.key}-${s.id}`}
                  style={{ borderBottom: i < line.stations.length - 1 ? '1px solid var(--line)' : undefined }}
                >
                  <td className="px-4 py-2 text-[var(--muted)]">{line.key}</td>
                  <td className="px-4 py-2 font-light text-white">{s.name}</td>
                  <td className="px-4 py-2 tabular-nums text-[var(--muted)]">{count(s.tx)}</td>
                  <td className="px-4 py-2 tabular-nums text-[var(--muted)]">{count(s.wallets)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </details>
  )
}
