/**
 * DownloadMenu — "Download" button with a dropdown offering CSV and PNG exports.
 *
 * Styled to match ShareButton: arc-act trigger, same panel classes.
 * No new dependencies.
 */

import { useState, useRef, useEffect } from 'react'
import { Download, FileText, Image as ImageIcon } from 'lucide-react'
import { clsx } from 'clsx'
import {
  toCsv,
  downloadFileName,
  svgToPngDataUrl,
  triggerDownload,
} from '@/lib/download'

export interface DownloadMenuColumn {
  key: string
  label: string
}

export interface DownloadMenuProps {
  /** Short page name used in the file name, e.g. "transactions" */
  page: string
  /** Network label used in the file name, e.g. "mainnet" or "testnet" */
  net: string
  /** Human-readable data source label written into the CSV metadata row */
  source: string
  /** Column definitions — order determines CSV column order */
  columns: DownloadMenuColumn[]
  /** Table rows for the CSV export */
  rows: Record<string, string | number | null | undefined>[]
  /**
   * Ref to the container that holds a Recharts (or any) <svg>.
   * When provided and the ref contains a child <svg>, a "PNG (chart)" option
   * is shown. When absent or no <svg> is found, the option is hidden.
   */
  chartRef?: React.RefObject<HTMLElement | null>
  className?: string
}

export function DownloadMenu({
  page,
  net,
  source,
  columns,
  rows,
  chartRef,
  className,
}: DownloadMenuProps) {
  const [open, setOpen] = useState(false)
  // hasPng is derived inside an effect so refs are never read during render
  const [hasPng, setHasPng] = useState(false)
  const [pngStatus, setPngStatus] = useState<'idle' | 'rendering' | 'error'>('idle')
  const [pngError, setPngError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click — same pattern as ShareButton
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Re-evaluate whether a chart SVG is present each time the menu opens.
  // Refs must not be read during render — use an effect instead.
  useEffect(() => {
    if (open && chartRef) {
      setHasPng(Boolean(chartRef.current?.querySelector('svg')))
    }
  }, [open, chartRef])

  // Stable helper used only in event handlers — safe to read refs here
  function findSvg(): SVGSVGElement | null {
    if (!chartRef?.current) return null
    return chartRef.current.querySelector('svg')
  }

  function handleCsv() {
    const now = new Date()
    const content = toCsv({ source, generatedAt: now, columns, rows })
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, downloadFileName(page, net, now, 'csv'))
    setOpen(false)
  }

  function handlePng() {
    const svg = findSvg()
    if (!svg) {
      setPngStatus('error')
      setPngError('No chart SVG found.')
      return
    }
    setPngStatus('rendering')
    setPngError(null)

    svgToPngDataUrl(svg)
      .then(dataUrl => {
        triggerDownload(dataUrl, downloadFileName(page, net, new Date(), 'png'))
        setPngStatus('idle')
        setOpen(false)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'PNG render failed.'
        setPngStatus('error')
        setPngError(msg.length > 80 ? msg.slice(0, 80) + '…' : msg)
      })
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => {
          setOpen(v => !v)
          // Reset error state each time the menu is opened
          if (!open) {
            setPngStatus('idle')
            setPngError(null)
          }
        }}
        className={clsx('arc-act', className)}
      >
        <Download className="w-3.5 h-3.5" />
        Download
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-52 rounded-xl bg-[#10213b] border border-[var(--line)] shadow-2xl py-1.5 z-50">
          {/* CSV option — always shown */}
          <button
            onClick={handleCsv}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>CSV (table data)</span>
          </button>

          {/* PNG option — only when chartRef contains an <svg> */}
          {hasPng && (
            <button
              onClick={handlePng}
              disabled={pngStatus === 'rendering'}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:text-white hover:bg-white/[0.05] transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              <ImageIcon className="w-4 h-4" />
              <span>
                {pngStatus === 'rendering' ? 'Rendering…' : 'PNG (chart)'}
              </span>
            </button>
          )}

          {/* Inline error message — never throws up to the caller */}
          {pngStatus === 'error' && pngError && (
            <p className="px-4 py-2 text-xs text-red-400 break-words">
              {pngError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
