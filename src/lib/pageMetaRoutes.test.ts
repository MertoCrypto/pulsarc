/**
 * Drift-protection test: every Pulsarc route must have its own browser title.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/pageMetaRoutes.test.ts
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { metaFor, DEFAULT_TITLE } from './pageMeta.ts'

// ---------------------------------------------------------------------------
// 1.  Extract every <Route path="..."> from App.tsx
// ---------------------------------------------------------------------------

const appSource = fs.readFileSync(
  path.join(process.cwd(), 'src/App.tsx'),
  'utf8',
)

// Matches  path="..."  or  path='...'
const routeRegex = /<Route\s[^>]*path=["']([^"']+)["']/g

const routes: string[] = []
let match: RegExpExecArray | null
while ((match = routeRegex.exec(appSource)) !== null) {
  routes.push(match[1])
}

// ---------------------------------------------------------------------------
// 2.  Guard: at least 15 routes must have been found
// ---------------------------------------------------------------------------

assert.ok(
  routes.length >= 15,
  `Expected at least 15 routes in src/App.tsx but only found ${routes.length}. ` +
    `The extraction regex may be broken. Found: ${JSON.stringify(routes)}`,
)

// ---------------------------------------------------------------------------
// 3.  Helper: replace :param segments with "sample"
// ---------------------------------------------------------------------------

function concretePath(route: string): string {
  return route
    .split('/')
    .map((seg) => (seg.startsWith(':') ? 'sample' : seg))
    .join('/')
}

// ---------------------------------------------------------------------------
// 4.  Run all checks; accumulate every violation
// ---------------------------------------------------------------------------

const violations: string[] = []

// Set of routes we will check for unique titles (excludes "/" and "*")
const checkableRoutes = routes.filter((r) => r !== '/' && r !== '*')

// --- Rule 1: checkable routes must have a distinct, suffixed title ----------

for (const route of checkableRoutes) {
  const concrete = concretePath(route)
  const meta = metaFor(concrete)

  if (meta.title === DEFAULT_TITLE) {
    violations.push(
      `[rule 1] Route "${route}" (tested as "${concrete}") returns DEFAULT_TITLE. ` +
        `Add an entry for ${concrete} in src/lib/pageMeta.ts.`,
    )
  } else if (!meta.title.endsWith('· Pulsarc')) {
    violations.push(
      `[rule 1] Route "${route}" (tested as "${concrete}") has title "${meta.title}" ` +
        `which does not end with "· Pulsarc". Fix it in src/lib/pageMeta.ts.`,
    )
  }
}

// --- Rule 2: "/" must return DEFAULT_TITLE; unknown path must return DEFAULT_TITLE ---

const rootMeta = metaFor('/')
if (rootMeta.title !== DEFAULT_TITLE) {
  violations.push(
    `[rule 2] metaFor("/").title should be DEFAULT_TITLE ("${DEFAULT_TITLE}") ` +
      `but got "${rootMeta.title}".`,
  )
}

const unknownMeta = metaFor('/definitely-not-a-page')
if (unknownMeta.title !== DEFAULT_TITLE) {
  violations.push(
    `[rule 2] metaFor("/definitely-not-a-page").title should be DEFAULT_TITLE ` +
      `("${DEFAULT_TITLE}") but got "${unknownMeta.title}".`,
  )
}

// --- Rule 3: no two different static routes share the same title ------------
// "Static" means no :param in the original route string.

const staticRoutes = checkableRoutes.filter((r) => !r.includes(':'))
const titleToRoutes: Map<string, string[]> = new Map()

for (const route of staticRoutes) {
  const { title } = metaFor(route)
  const existing = titleToRoutes.get(title) ?? []
  existing.push(route)
  titleToRoutes.set(title, existing)
}

for (const [title, dupeRoutes] of titleToRoutes) {
  if (dupeRoutes.length > 1) {
    violations.push(
      `[rule 3] Duplicate title "${title}" shared by routes: ${dupeRoutes.join(', ')}. ` +
        `Give each a unique title in src/lib/pageMeta.ts.`,
    )
  }
}

// --- Rule 4: every title and description is non-empty; description ≤ 160 chars ---

// Check all routes (including "/" but excluding "*")
const allCheckable = routes.filter((r) => r !== '*')

for (const route of allCheckable) {
  const concrete = concretePath(route)
  const meta = metaFor(concrete)

  if (!meta.title || meta.title.trim() === '') {
    violations.push(
      `[rule 4] Route "${route}" (tested as "${concrete}") has an empty title.`,
    )
  }
  if (!meta.description || meta.description.trim() === '') {
    violations.push(
      `[rule 4] Route "${route}" (tested as "${concrete}") has an empty description.`,
    )
  }
  if (meta.description && meta.description.length > 160) {
    violations.push(
      `[rule 4] Route "${route}" (tested as "${concrete}") has a description of ` +
        `${meta.description.length} chars (max 160): "${meta.description.slice(0, 40)}…". ` +
        `Shorten it in src/lib/pageMeta.ts.`,
    )
  }
}

// ---------------------------------------------------------------------------
// 5.  Single combined assertion
// ---------------------------------------------------------------------------

assert.deepEqual(
  violations,
  [],
  `Page-meta drift detected — ${violations.length} violation(s):\n` +
    violations.map((v, i) => `  ${i + 1}. ${v}`).join('\n'),
)

console.log(
  `pageMetaRoutes: all ${routes.length} routes passed ` +
    `(${checkableRoutes.length} with unique-title check, ` +
    `${staticRoutes.length} with duplicate-title check).`,
)
