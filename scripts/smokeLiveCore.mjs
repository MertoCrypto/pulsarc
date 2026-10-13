/**
 * smokeLiveCore.mjs — pure, dependency-free logic for smoke-live.mjs.
 * No network I/O, no process.exit, no console output.
 * Every export is independently unit-testable.
 */

// ── extractPaths ─────────────────────────────────────────────────────────────

/**
 * Parse <loc> values from a sitemap XML string and return the unique
 * pathnames in document order.
 *
 * Each <loc> may be an absolute URL ("https://example.com/foo") or a
 * bare path ("/foo").  We always return just the pathname so the smoke
 * runner can re-base it against any host.
 *
 * Duplicate pathnames (same path from different origins) are dropped.
 *
 * @param {string} sitemapXml
 * @returns {string[]}
 */
export function extractPaths(sitemapXml) {
  const seen = new Set()
  const paths = []

  // Match every <loc>…</loc> content, including across whitespace.
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g
  let m
  while ((m = re.exec(sitemapXml)) !== null) {
    const raw = m[1].trim()
    let pathname
    try {
      // Absolute URL — take only the pathname (drops query + hash too).
      pathname = new URL(raw).pathname
    } catch {
      // Relative / bare path — keep as-is if it starts with "/".
      pathname = raw.startsWith('/') ? raw : '/' + raw
    }
    // Strip query strings that slipped through (e.g. bare "/foo?bar=1").
    const qIdx = pathname.indexOf('?')
    if (qIdx !== -1) pathname = pathname.slice(0, qIdx)

    if (!seen.has(pathname)) {
      seen.add(pathname)
      paths.push(pathname)
    }
  }

  return paths
}

// ── findMainScript ────────────────────────────────────────────────────────────

/**
 * Find the first <script src="…"> whose src matches /assets/*.js and return
 * the pathname portion of that src.  Returns null when none is found.
 *
 * Vite emits the main bundle as /assets/index-<hash>.js (or similar).
 * We want just the pathname so the caller can re-base it against any host.
 *
 * @param {string} html
 * @returns {string|null}
 */
export function findMainScript(html) {
  // Capture src attribute from any <script … src="…" …> tag.
  // Non-greedy so we stop at the first closing quote.
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const src = m[1]
    // Accept /assets/*.js regardless of whether the src is absolute or relative.
    const assetRe = /\/assets\/[^"'?#]+\.js(?:[?#]|$)/
    if (assetRe.test(src)) {
      // Return only the pathname.
      try {
        return new URL(src).pathname
      } catch {
        // src is already a relative path like /assets/index-abc.js
        const qIdx = src.indexOf('?')
        return qIdx === -1 ? src : src.slice(0, qIdx)
      }
    }
  }
  return null
}

// ── networkMarkerPresent ──────────────────────────────────────────────────────

/**
 * Return true when the JS bundle text contains the exact Vite-inlined string
 *   VITE_ARC_NETWORK:"mainnet"
 * (with either straight or curly quotes — Vite typically uses straight).
 *
 * We match only the whole word "mainnet" so "mainnet2", "testnet", etc.
 * do NOT produce a false positive.
 *
 * @param {string} js  Bundle source text
 * @returns {boolean}
 */
export function networkMarkerPresent(js) {
  // Matches: VITE_ARC_NETWORK:"mainnet"  or  VITE_ARC_NETWORK:'mainnet'
  // The word boundary \b after "mainnet" ensures "mainnet2" is rejected.
  return /VITE_ARC_NETWORK:["']mainnet["']/.test(js)
}

// ── parseArgs ─────────────────────────────────────────────────────────────────

/**
 * Parse and validate CLI arguments.
 *
 * @param {string[]} argv  Full process.argv
 * @returns {{ baseUrl: string, network: 'mainnet'|'testnet' }}
 * @throws {ArgError} on bad input
 */
export function parseArgs(argv) {
  // argv[0] = node, argv[1] = script path, argv[2+] = user args
  const [rawBase, network] = argv.slice(2)

  if (!rawBase || !network) {
    throw new ArgError(
      'Usage: node scripts/smoke-live.mjs <baseUrl> <mainnet|testnet>',
      2,
    )
  }

  if (network !== 'mainnet' && network !== 'testnet') {
    throw new ArgError(
      `Unknown network "${network}". Must be "mainnet" or "testnet".`,
      2,
    )
  }

  // Validate that baseUrl is a parseable absolute URL.
  let baseUrl
  try {
    baseUrl = new URL(rawBase).toString()
  } catch {
    throw new ArgError(`Invalid baseUrl "${rawBase}": not a valid URL.`, 2)
  }

  // Remove any trailing slash so we can always write baseUrl + "/path".
  baseUrl = baseUrl.replace(/\/+$/, '')

  return { baseUrl, network }
}

/**
 * Thrown by parseArgs when arguments are missing or invalid.
 * The `code` property maps directly to the desired process.exit code.
 */
export class ArgError extends Error {
  /** @param {string} message @param {number} code */
  constructor(message, code) {
    super(message)
    this.name = 'ArgError'
    this.code = code
  }
}
