/**
 * Sitemap + robots.txt integrity test.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/sitemap.test.ts
 *
 * The test:
 *   1. Reads public/sitemap.xml and public/robots.txt relative to process.cwd().
 *   2. Reads src/App.tsx as text and extracts static <Route path="…"> values.
 *   3. Reads src/lib/answers.ts as text and extracts ANSWERS slugs (avoids
 *      importing transitive deps that are not present in this environment).
 *   4. Asserts correctness; fails loudly on any violation.
 *
 * IMPORTANT: if you add a new static route to App.tsx without adding it to
 * public/sitemap.xml, this test will fail — that is intentional.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── helpers ──────────────────────────────────────────────────────────────────

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

// ── read files ────────────────────────────────────────────────────────────────

const sitemapXml  = read('public/sitemap.xml')
const robotsTxt   = read('public/robots.txt')
const appTsx      = read('src/App.tsx')
const answersTs   = read('src/lib/answers.ts')

// ── extract static routes from App.tsx ───────────────────────────────────────
// Matches:  <Route path="/something" …  or  <Route path='…'
// Captures the path value.  Parameterised routes (:id, :address) are filtered
// out afterward.

const routePathRe = /<Route\s+path=["']([^"']+)["']/g
const allRoutePaths: string[] = []
let m: RegExpExecArray | null
while ((m = routePathRe.exec(appTsx)) !== null) {
  allRoutePaths.push(m[1])
}

assert.ok(allRoutePaths.length > 0, 'No <Route path=…> found in App.tsx — regex may be broken')

// Static routes: no ":" in the path
// A wildcard catch-all (the 404 page) is not a real page, so it never belongs in the sitemap.
const staticRoutes = allRoutePaths.filter(p => !p.includes(':') && !p.includes('*'))

// Routes intentionally excluded from the sitemap
const EXCLUDED_ROUTES = new Set(['/deploy', '/brand', '/deploy-local'])

// The routes we expect to appear in the sitemap
const expectedRoutes = staticRoutes.filter(p => !EXCLUDED_ROUTES.has(p))

// ── extract ANSWERS slugs from answers.ts source ─────────────────────────────
// Matches lines like:   slug: 'transfer-fee',   or  slug: "transfer-fee",
// This avoids importing the module and its unavailable transitive dependencies.

const slugRe = /slug:\s*['"]([^'"]+)['"]/g
const allSlugs: string[] = []
while ((m = slugRe.exec(answersTs)) !== null) {
  allSlugs.push(m[1])
}

assert.ok(allSlugs.length > 0, 'No slug: … found in answers.ts — regex may be broken')

// Mainnet-only slugs that must NOT appear in the sitemap
const MAINNET_ONLY_SLUGS = new Set(['agents-registered', 'agent-owners'])

const expectedSlugs = allSlugs.filter(s => !MAINNET_ONLY_SLUGS.has(s))

// ── basic XML well-formedness ─────────────────────────────────────────────────

assert.ok(
  sitemapXml.trimStart().startsWith('<?xml'),
  'sitemap.xml must start with <?xml',
)

assert.ok(
  sitemapXml.includes('xmlns="http://www.w3.org/2006/sitemap-schema/sitemap/0.9"'),
  'sitemap.xml must contain the sitemap 0.9 xmlns declaration',
)

const openCount  = (sitemapXml.match(/<url>/g)  ?? []).length
const closeCount = (sitemapXml.match(/<\/url>/g) ?? []).length
assert.equal(openCount, closeCount, `<url> and </url> tag counts must match (got ${openCount} open, ${closeCount} close)`)
assert.ok(openCount > 0, 'sitemap.xml must contain at least one <url> element')

// ── extract <loc> values ──────────────────────────────────────────────────────

const locRe = /<loc>([^<]+)<\/loc>/g
const locs: string[] = []
while ((m = locRe.exec(sitemapXml)) !== null) {
  locs.push(m[1].trim())
}

assert.equal(locs.length, openCount, '<loc> count must equal <url> count')

// ── no duplicate <loc> ────────────────────────────────────────────────────────

const locSet = new Set(locs)
assert.equal(locSet.size, locs.length, `Duplicate <loc> entries found: ${locs.filter((l, i) => locs.indexOf(l) !== i).join(', ')}`)

// ── all locs are absolute URLs with the correct origin ───────────────────────

const ORIGIN = 'https://pulsarc.vercel.app'

for (const loc of locs) {
  assert.ok(
    loc.startsWith(ORIGIN + '/') || loc === ORIGIN,
    `<loc> must start with ${ORIGIN}: ${loc}`,
  )
}

// ── no <loc> contains ":" after the https:// prefix ─────────────────────────
// i.e. no parameterised route leaked into the sitemap

for (const loc of locs) {
  const pathPart = loc.slice(ORIGIN.length) // may be '' for the root
  assert.ok(
    !pathPart.includes(':'),
    `<loc> path must not contain ":" (parameterised route leaked): ${loc}`,
  )
}

// ── every expected static route is present exactly once ──────────────────────

for (const route of expectedRoutes) {
  const expectedLoc = route === '/' ? ORIGIN + '/' : ORIGIN + route
  const count = locs.filter(l => l === expectedLoc).length
  assert.equal(
    count,
    1,
    `Static route "${route}" → expected exactly one <loc>${expectedLoc}</loc> in sitemap, found ${count}`,
  )
}

// ── /deploy and /brand must NOT appear ───────────────────────────────────────

for (const excluded of EXCLUDED_ROUTES) {
  const excludedLoc = ORIGIN + excluded
  const count = locs.filter(l => l === excludedLoc).length
  assert.equal(count, 0, `Excluded route "${excluded}" must not appear in sitemap, found ${count} time(s)`)
}

// ── every expected ANSWERS slug is present exactly once ──────────────────────

for (const slug of expectedSlugs) {
  const expectedLoc = `${ORIGIN}/answers/${slug}`
  const count = locs.filter(l => l === expectedLoc).length
  assert.equal(
    count,
    1,
    `ANSWERS slug "${slug}" → expected exactly one <loc>${expectedLoc}</loc> in sitemap, found ${count}`,
  )
}

// ── mainnet-only slugs must NOT appear ───────────────────────────────────────

for (const slug of MAINNET_ONLY_SLUGS) {
  const forbiddenLoc = `${ORIGIN}/answers/${slug}`
  const count = locs.filter(l => l === forbiddenLoc).length
  assert.equal(
    count,
    0,
    `Mainnet-only slug "${slug}" must not appear in sitemap, found ${count} time(s)`,
  )
}

// ── robots.txt ────────────────────────────────────────────────────────────────

const robotsLines = robotsTxt.split('\n').map(l => l.trim()).filter(Boolean)

assert.ok(
  robotsLines.includes('User-agent: *'),
  'robots.txt must contain "User-agent: *"',
)
assert.ok(
  robotsLines.includes('Allow: /'),
  'robots.txt must contain "Allow: /"',
)
assert.ok(
  robotsLines.includes(`Sitemap: ${ORIGIN}/sitemap.xml`),
  `robots.txt must contain "Sitemap: ${ORIGIN}/sitemap.xml"`,
)

// ── all assertions passed ─────────────────────────────────────────────────────

console.log('sitemap.test.ts: all assertions passed')
console.log(`  static routes checked : ${expectedRoutes.length}  (${staticRoutes.length} total, ${EXCLUDED_ROUTES.size} excluded)`)
console.log(`  answers slugs checked : ${expectedSlugs.length}  (${allSlugs.length} total, ${MAINNET_ONLY_SLUGS.size} excluded)`)
console.log(`  <url> entries in sitemap: ${openCount}`)
console.log(`  no duplicate <loc>, no parameterised paths, no mainnet-only slugs`)
