/**
 * smokeLiveCore.test.mjs
 *
 * Run with:
 *   node --test scripts/smokeLiveCore.test.mjs
 *
 * All tests are synchronous / pure — no network access.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractPaths,
  findMainScript,
  networkMarkerPresent,
  parseArgs,
  ArgError,
} from './smokeLiveCore.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// extractPaths
// ─────────────────────────────────────────────────────────────────────────────

describe('extractPaths', () => {
  it('returns pathnames from absolute <loc> entries', () => {
    const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://pulsarc.vercel.app/</loc></url>
  <url><loc>https://pulsarc.vercel.app/network</loc></url>
  <url><loc>https://pulsarc.vercel.app/answers/transfer-fee</loc></url>
</urlset>`
    assert.deepEqual(extractPaths(xml), ['/', '/network', '/answers/transfer-fee'])
  })

  it('returns pathnames from relative (bare-path) <loc> entries', () => {
    const xml = `<urlset>
  <url><loc>/network</loc></url>
  <url><loc>/tokens</loc></url>
</urlset>`
    assert.deepEqual(extractPaths(xml), ['/network', '/tokens'])
  })

  it('deduplicates paths that appear more than once', () => {
    const xml = `<urlset>
  <url><loc>https://example.com/foo</loc></url>
  <url><loc>https://other.host/foo</loc></url>
  <url><loc>/bar</loc></url>
  <url><loc>https://example.com/bar</loc></url>
</urlset>`
    // /foo appears twice (different origins), /bar appears twice — each once in output
    assert.deepEqual(extractPaths(xml), ['/foo', '/bar'])
  })

  it('returns [] for empty or whitespace-only input', () => {
    assert.deepEqual(extractPaths(''), [])
    assert.deepEqual(extractPaths('   \n  '), [])
  })

  it('returns [] when no <loc> elements are present', () => {
    assert.deepEqual(extractPaths('<urlset><url></url></urlset>'), [])
  })

  it('strips query strings from <loc> values', () => {
    const xml = `<urlset>
  <url><loc>https://example.com/page?utm_source=email</loc></url>
  <url><loc>/other?v=2</loc></url>
</urlset>`
    assert.deepEqual(extractPaths(xml), ['/page', '/other'])
  })

  it('handles the real sitemap.xml shape (multiple answers/* entries)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.w3.org/2006/sitemap-schema/sitemap/0.9">
  <url><loc>https://pulsarc.vercel.app/</loc></url>
  <url><loc>https://pulsarc.vercel.app/answers/transfer-fee</loc></url>
  <url><loc>https://pulsarc.vercel.app/answers/usdc-supply</loc></url>
</urlset>`
    const paths = extractPaths(xml)
    assert.equal(paths.length, 3)
    assert.ok(paths.includes('/'))
    assert.ok(paths.includes('/answers/transfer-fee'))
    assert.ok(paths.includes('/answers/usdc-supply'))
  })

  it('prepends "/" to a bare <loc> without a leading slash', () => {
    const xml = `<urlset>
  <url><loc>foo</loc></url>
  <url><loc>foo/bar</loc></url>
</urlset>`
    assert.deepEqual(extractPaths(xml), ['/foo', '/foo/bar'])
  })

  it('deduplicates a bare path and the equivalent absolute URL to one entry', () => {
    // 'foo' (no slash) and 'https://x.test/foo' both resolve to '/foo'.
    const xml = `<urlset>
  <url><loc>foo</loc></url>
  <url><loc>https://x.test/foo</loc></url>
</urlset>`
    assert.deepEqual(extractPaths(xml), ['/foo'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// findMainScript
// ─────────────────────────────────────────────────────────────────────────────

describe('findMainScript', () => {
  it('finds the first /assets/*.js script tag', () => {
    const html = `<html><head>
  <script type="module" src="/assets/index-Bx3fkZ9a.js"></script>
</head><body><div id="root"></div></body></html>`
    assert.equal(findMainScript(html), '/assets/index-Bx3fkZ9a.js')
  })

  it('picks the first matching script when several are present', () => {
    const html = `<html><head>
  <script src="/other/util.js"></script>
  <script src="/assets/vendor-abc123.js"></script>
  <script src="/assets/index-def456.js"></script>
</head></html>`
    // /other/util.js does NOT match the /assets/*.js pattern, so first match is vendor
    assert.equal(findMainScript(html), '/assets/vendor-abc123.js')
  })

  it('returns null when no matching script tag exists', () => {
    const html = `<html><head><script src="/other/script.js"></script></head></html>`
    assert.equal(findMainScript(html), null)
  })

  it('returns null for empty HTML', () => {
    assert.equal(findMainScript(''), null)
  })

  it('handles an absolute src (https://cdn.example.com/assets/app.js)', () => {
    const html = `<script src="https://cdn.example.com/assets/app-xyz.js"></script>`
    assert.equal(findMainScript(html), '/assets/app-xyz.js')
  })

  it('returns relative path (strips query) when src has a query string', () => {
    const html = `<script src="/assets/index-abc.js?v=1"></script>`
    assert.equal(findMainScript(html), '/assets/index-abc.js')
  })

  it('ignores non-JS assets in /assets/ (e.g. .css, .woff2)', () => {
    const html = `<link href="/assets/main.css">
<script src="/assets/index-abc.js"></script>`
    assert.equal(findMainScript(html), '/assets/index-abc.js')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// networkMarkerPresent
// ─────────────────────────────────────────────────────────────────────────────

describe('networkMarkerPresent', () => {
  it('returns true when the exact mainnet marker is present', () => {
    const js = `const e={VITE_ARC_NETWORK:"mainnet",VITE_OTHER:"x"}`
    assert.equal(networkMarkerPresent(js), true)
  })

  it('returns true with single-quoted marker', () => {
    const js = `const e={VITE_ARC_NETWORK:'mainnet'}`
    assert.equal(networkMarkerPresent(js), true)
  })

  it('returns false when the marker is absent', () => {
    const js = `const e={VITE_OTHER:"something"}`
    assert.equal(networkMarkerPresent(js), false)
  })

  it('returns false for a testnet build (no mainnet marker)', () => {
    const js = `const e={VITE_ARC_NETWORK:"testnet"}`
    assert.equal(networkMarkerPresent(js), false)
  })

  it('returns false for near-miss VITE_ARC_NETWORK:"mainnet2"', () => {
    // "mainnet2" is not the exact token
    const js = `const e={VITE_ARC_NETWORK:"mainnet2"}`
    assert.equal(networkMarkerPresent(js), false)
  })

  it('returns false for near-miss with extra whitespace inside the string', () => {
    const js = `const e={VITE_ARC_NETWORK:" mainnet"}`
    assert.equal(networkMarkerPresent(js), false)
  })

  it('returns false for empty bundle', () => {
    assert.equal(networkMarkerPresent(''), false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parseArgs
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  // Helper: prefix with the two Node argv positions scripts expect to skip.
  const argv = (...args) => ['node', 'smoke-live.mjs', ...args]

  it('returns parsed args for a valid mainnet invocation', () => {
    const result = parseArgs(argv('https://pulsarc.vercel.app', 'mainnet'))
    assert.equal(result.baseUrl, 'https://pulsarc.vercel.app')
    assert.equal(result.network, 'mainnet')
  })

  it('returns parsed args for a valid testnet invocation', () => {
    const result = parseArgs(argv('https://preview.pulsarc.vercel.app', 'testnet'))
    assert.equal(result.baseUrl, 'https://preview.pulsarc.vercel.app')
    assert.equal(result.network, 'testnet')
  })

  it('removes a trailing slash from baseUrl', () => {
    const result = parseArgs(argv('https://pulsarc.vercel.app/', 'mainnet'))
    assert.equal(result.baseUrl, 'https://pulsarc.vercel.app')
  })

  it('removes multiple trailing slashes from baseUrl', () => {
    const result = parseArgs(argv('https://pulsarc.vercel.app///', 'testnet'))
    assert.equal(result.baseUrl, 'https://pulsarc.vercel.app')
  })

  it('throws ArgError with code 2 when baseUrl is missing', () => {
    assert.throws(
      () => parseArgs(argv()),
      (err) => {
        assert.ok(err instanceof ArgError)
        assert.equal(err.code, 2)
        assert.ok(err.message.includes('Usage:'))
        return true
      },
    )
  })

  it('throws ArgError with code 2 when network is missing', () => {
    assert.throws(
      () => parseArgs(argv('https://pulsarc.vercel.app')),
      (err) => {
        assert.ok(err instanceof ArgError)
        assert.equal(err.code, 2)
        return true
      },
    )
  })

  it('throws ArgError with code 2 for an unknown network value', () => {
    assert.throws(
      () => parseArgs(argv('https://pulsarc.vercel.app', 'staging')),
      (err) => {
        assert.ok(err instanceof ArgError)
        assert.equal(err.code, 2)
        assert.ok(err.message.includes('staging'))
        return true
      },
    )
  })

  it('throws ArgError for an invalid (non-URL) baseUrl', () => {
    assert.throws(
      () => parseArgs(argv('not-a-url', 'mainnet')),
      (err) => {
        assert.ok(err instanceof ArgError)
        assert.equal(err.code, 2)
        return true
      },
    )
  })
})
