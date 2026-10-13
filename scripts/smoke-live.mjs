#!/usr/bin/env node
/**
 * smoke-live.mjs — post-cutover smoke test for a deployed Pulsarc site.
 *
 * Usage:
 *   node scripts/smoke-live.mjs <baseUrl> <mainnet|testnet>
 *
 * Exit codes:
 *   0  all checks passed
 *   1  one or more checks failed
 *   2  bad arguments
 */

import {
  extractPaths,
  findMainScript,
  networkMarkerPresent,
  parseArgs,
  ArgError,
} from './smokeLiveCore.mjs'

// ── argument parsing ──────────────────────────────────────────────────────────

let baseUrl, network
try {
  ;({ baseUrl, network } = parseArgs(process.argv))
} catch (err) {
  if (err instanceof ArgError) {
    console.error(err.message)
    process.exit(err.code)
  }
  throw err
}

// ── result tracking ───────────────────────────────────────────────────────────

let failed = 0

/**
 * @param {boolean} ok
 * @param {string}  what
 * @param {string}  [reason]
 */
function report(ok, what, reason) {
  if (ok) {
    console.log(`ok   ${what}`)
  } else {
    console.log(`FAIL ${what}${reason ? ': ' + reason : ''}`)
    failed++
  }
}

// ── fetch helper ──────────────────────────────────────────────────────────────

/**
 * Fetch a URL with a 15 s timeout.  Returns { status, text } on any HTTP
 * response, or throws on network error / timeout.
 *
 * @param {string} url
 * @returns {Promise<{ status: number, text: string }>}
 */
async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  return { status: res.status, text }
}

// ── 1. fetch sitemap and extract paths ───────────────────────────────────────

const sitemapUrl = `${baseUrl}/sitemap.xml`
let paths
try {
  const { status, text } = await get(sitemapUrl)
  if (status !== 200) {
    report(false, 'sitemap.xml', `HTTP ${status}`)
    console.log(`\n1 checks, 1 failed`)
    process.exit(1)
  }
  report(true, 'sitemap.xml')
  paths = extractPaths(text)
  if (paths.length === 0) {
    report(false, 'sitemap.xml paths', 'no <loc> entries found')
    console.log(`\n2 checks, 1 failed`)
    process.exit(1)
  }
} catch (err) {
  report(false, 'sitemap.xml', err.message)
  console.log(`\n1 checks, 1 failed`)
  process.exit(1)
}

// ── 2. check every path in the sitemap ───────────────────────────────────────

// We need the home page HTML for the JS bundle check below.
let homeHtml = ''

for (const path of paths) {
  const url = baseUrl + path
  const label = `GET ${path}`
  try {
    const { status, text } = await get(url)
    if (status !== 200) {
      report(false, label, `HTTP ${status}`)
      continue
    }
    if (!text.includes('<div id="root">')) {
      report(false, label, 'body does not contain <div id="root">')
      continue
    }
    report(true, label)
    if (path === '/') homeHtml = text
  } catch (err) {
    report(false, label, err.message)
  }
}

// ── 3. network marker check ───────────────────────────────────────────────────

const bundlePath = findMainScript(homeHtml)
if (!bundlePath) {
  // Only a failure for mainnet (spec: "report … as a failure for mainnet only").
  report(
    network === 'testnet',
    'network marker',
    'no /assets/*.js script found in home page HTML',
  )
} else {
  const bundleUrl = baseUrl + bundlePath
  const bundleLabel = `network marker in ${bundlePath}`
  try {
    const { status, text: js } = await get(bundleUrl)
    if (status !== 200) {
      report(false, bundleLabel, `HTTP ${status} fetching bundle`)
    } else {
      const present = networkMarkerPresent(js)
      if (network === 'mainnet') {
        report(present, bundleLabel, present ? undefined : 'VITE_ARC_NETWORK:"mainnet" not found in bundle')
      } else {
        // testnet: marker must NOT be present
        report(
          !present,
          bundleLabel,
          present ? 'VITE_ARC_NETWORK:"mainnet" found in bundle (expected testnet build)' : undefined,
        )
      }
    }
  } catch (err) {
    report(false, bundleLabel, err.message)
  }
}

// ── summary ───────────────────────────────────────────────────────────────────

// Total checks = 1 (sitemap) + paths.length + 1 (network marker)
const total = 1 + paths.length + 1
console.log(`\n${total} checks, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
