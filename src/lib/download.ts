/**
 * Pure download helpers — no React, no DOM side-effects except triggerDownload
 * and svgToPngDataUrl. Safe to test with:
 *   node --experimental-strip-types src/lib/download.ts
 */

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * RFC 4180 cell escaping.
 *  - null / undefined  -> empty string
 *  - numbers           -> String() (no locale formatting)
 *  - strings that contain , " CR or LF -> wrap in double-quotes, double inner "
 */
export function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? String(v) : v
  // Must quote if the value contains comma, double-quote, CR or LF
  if (/[,"\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Characters that trigger spreadsheet formula injection when they appear as
 * the FIRST character of a cell. Plain finite numbers passed as `number` type
 * are exempt — negative numbers must stay numeric.
 */
const FORMULA_CHARS = /^[=+\-@]/

function cellValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''

  // Plain finite numbers: no injection prefix, no escaping needed
  if (typeof v === 'number') {
    if (!isFinite(v)) return csvEscape(String(v))
    return String(v)
  }

  // String values: prefix formula-injection characters with a single quote
  let s = v
  if (FORMULA_CHARS.test(s)) {
    s = "'" + s
  }
  return csvEscape(s)
}

export interface ToCsvOpts {
  /** Human-readable data source label (e.g. "Pulsarc /metrics") */
  source: string
  /** When the export was generated */
  generatedAt: Date
  /** Column definitions — order determines CSV column order */
  columns: { key: string; label: string }[]
  /** Data rows; missing keys treated as null */
  rows: Record<string, string | number | null | undefined>[]
}

/**
 * Build a CSV string.
 * Line 1: metadata comment  `# source: <source>; generated: <ISO time>`
 * Line 2: header labels
 * Lines 3+: data rows
 * Line endings: CRLF (\r\n). No UTF-8 BOM.
 */
export function toCsv(opts: ToCsvOpts): string {
  const { source, generatedAt, columns, rows } = opts
  const CRLF = '\r\n'

  const meta = `# source: ${source}; generated: ${generatedAt.toISOString()}`
  const header = columns.map(c => csvEscape(c.label)).join(',')
  const dataRows = rows.map(row =>
    columns.map(c => cellValue(row[c.key])).join(',')
  )

  return [meta, header, ...dataRows].join(CRLF) + CRLF
}

// ---------------------------------------------------------------------------
// File name helpers
// ---------------------------------------------------------------------------

/**
 * Returns `pulsarc-<page>-<net>-<YYYY-MM-DD>.<ext>` using UTC date.
 * Page is lowercased; non [a-z0-9] chars replaced by '-';
 * consecutive hyphens collapsed to one; leading/trailing hyphens stripped.
 */
export function downloadFileName(
  page: string,
  net: string,
  now: Date,
  ext: 'csv' | 'png',
): string {
  const slug = page
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const date = `${y}-${m}-${d}`

  return `pulsarc-${slug}-${net}-${date}.${ext}`
}

// ---------------------------------------------------------------------------
// SVG -> PNG helper (browser only)
// ---------------------------------------------------------------------------

/**
 * Serialize an SVGSVGElement to a PNG data URL via an off-screen canvas.
 *
 * @param svg       The SVG root element.
 * @param opts.scale      Pixel ratio multiplier (default 2).
 * @param opts.background Fill background color (default '#0b1a30').
 */
export function svgToPngDataUrl(
  svg: SVGSVGElement,
  opts?: { scale?: number; background?: string },
): Promise<string> {
  const scale = opts?.scale ?? 2
  const background = opts?.background ?? '#0b1a30'

  // Measure the rendered size: Recharts SVGs often have width="100%", where baseVal.value is unreliable.
  // Prefer the SVG's own viewBox size (a card scaled down on a phone still exports at full size);
  // fall back to the rendered size when there is no usable viewBox.
  const vb = svg.viewBox?.baseVal
  const rect = svg.getBoundingClientRect()
  const useVb = !!vb && vb.width > 0 && vb.height > 0
  const w = Math.round(useVb ? vb.width : rect.width)
  const h = Math.round(useVb ? vb.height : rect.height)

  if (w === 0 || h === 0) {
    return Promise.reject(
      new Error(`svgToPngDataUrl: SVG has zero rendered size (width=${w}, height=${h}).`),
    )
  }

  // Serialize a clone with explicit pixel size and namespace so it renders standalone as an image.
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`)
  const svgStr = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  return new Promise<string>((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = w * scale
        canvas.height = h * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('svgToPngDataUrl: could not get 2D canvas context'))
          return
        }
        ctx.scale(scale, scale)
        ctx.fillStyle = background
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      } finally {
        URL.revokeObjectURL(url)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('svgToPngDataUrl: failed to load serialized SVG as an image'))
    }

    img.src = url
  })
}

// ---------------------------------------------------------------------------
// Trigger browser download
// ---------------------------------------------------------------------------

/**
 * Programmatically trigger a browser file download.
 * Accepts a data URL, a blob URL, or any href string.
 * Object URLs (blob:) are revoked after the click.
 */
export function triggerDownload(href: string, fileName: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke only blob: URLs to avoid leaking object URLs
  if (href.startsWith('blob:')) {
    URL.revokeObjectURL(href)
  }
}
