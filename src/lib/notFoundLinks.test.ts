/**
 * notFoundLinks.test.ts
 * Run with: node --experimental-strip-types src/lib/notFoundLinks.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOT_FOUND_LINKS } from './notFoundLinks.ts'

// ---------------------------------------------------------------------------
// 1. Exactly six entries
// ---------------------------------------------------------------------------

assert.strictEqual(NOT_FOUND_LINKS.length, 5, 'must have exactly 5 links')
console.log('PASS  list has exactly 5 entries')

// ---------------------------------------------------------------------------
// 2. Exact order and hand-written values
// ---------------------------------------------------------------------------

const EXPECTED: { to: string; label: string }[] = [
  { to: '/',        label: 'Rankings'      },
  { to: '/network', label: 'Network'       },
  { to: '/tokens',  label: 'Tokens'        },
  { to: '/answers', label: 'Answers'       },
  { to: '/check',   label: 'Wallet checker' },
]

for (let i = 0; i < EXPECTED.length; i++) {
  const actual = NOT_FOUND_LINKS[i]
  const exp    = EXPECTED[i]
  assert.strictEqual(actual.to,    exp.to,    `entry[${i}].to — expected "${exp.to}", got "${actual.to}"`)
  assert.strictEqual(actual.label, exp.label, `entry[${i}].label — expected "${exp.label}", got "${actual.label}"`)
  console.log(`PASS  entry[${i}]  to="${actual.to}"  label="${actual.label}"`)
}

// ---------------------------------------------------------------------------
// 3. Every `to` starts with "/" and contains no ":" or "*"
// ---------------------------------------------------------------------------

for (const link of NOT_FOUND_LINKS) {
  assert.ok(link.to.startsWith('/'),           `"${link.to}" must start with "/"`)
  assert.ok(!link.to.includes(':'),            `"${link.to}" must not contain ":"`)
  assert.ok(!link.to.includes('*'),            `"${link.to}" must not contain "*"`)
}
console.log('PASS  all `to` values start with "/" and contain no ":" or "*"')

// ---------------------------------------------------------------------------
// 4. Labels are unique and non-empty
// ---------------------------------------------------------------------------

const labels = NOT_FOUND_LINKS.map(l => l.label)
const uniqueLabels = new Set(labels)
assert.strictEqual(uniqueLabels.size, labels.length, 'labels must be unique')
for (const label of labels) {
  assert.ok(label.length > 0, 'label must be non-empty')
}
console.log('PASS  labels are unique and non-empty')

// ---------------------------------------------------------------------------
// 5. Every `to` is a Route path declared in src/App.tsx
// ---------------------------------------------------------------------------

const appTsxPath = join(process.cwd(), 'src', 'App.tsx')
const appSrc = readFileSync(appTsxPath, 'utf8')

// Extract all <Route path="..."> values (handles single or double quotes)
const routePathRe = /<Route\s[^>]*path=["']([^"']+)["']/g
const routePaths = new Set<string>()
let m: RegExpExecArray | null
while ((m = routePathRe.exec(appSrc)) !== null) {
  routePaths.add(m[1])
}

assert.ok(routePaths.size > 0, 'could not extract any Route paths from src/App.tsx')

for (const link of NOT_FOUND_LINKS) {
  assert.ok(
    routePaths.has(link.to),
    `link.to "${link.to}" is not declared as a <Route path> in src/App.tsx (found: ${[...routePaths].join(', ')})`,
  )
}
console.log(`PASS  all link paths exist in src/App.tsx routes (checked against: ${[...routePaths].join(', ')})`)

// ---------------------------------------------------------------------------

console.log('\nAll tests passed.')
