/**
 * Tests for src/lib/dataCatalog.ts
 * Run: node --experimental-strip-types src/lib/dataCatalog.test.ts
 *
 * Sample files are read from the directory given by the CATALOG_SAMPLES env var
 * (default: src/lib/fixtures/catalog). For entries with an empty keys array or whose
 * file path contains "/" (hourly/) or ends in ".xml", the sample check is skipped.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  CATALOG,
  DATA_BASE,
  catalogUrl,
  buildCatalogJson,
  type Net,
} from './dataCatalog.ts'

let pass = 0
let fail = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✔ ${name}`)
    pass++
  } catch (e) {
    console.log(`  ✘ ${name}`)
    console.log(`    ${e instanceof Error ? e.message : String(e)}`)
    fail++
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const SAMPLES_DIR = resolve(
  process.env['CATALOG_SAMPLES'] ?? 'src/lib/fixtures/catalog',
)

/**
 * Returns true for entries where we should not attempt a sample file check:
 *  - feed.xml (RSS, not JSON)
 *  - hourly/<YYYY-MM-DD>.json (path template, no fixed sample)
 *  - any entry with no keys to check
 */
function skipSampleCheck(file: string, keys: string[]): boolean {
  if (keys.length === 0) return true
  if (file.includes('/')) return true
  if (file.endsWith('.xml')) return true
  return false
}

function samplePath(net: Net, file: string): string {
  // e.g. mainnet-latest.json
  const name = `${net}-${file}`
  return join(SAMPLES_DIR, name)
}

function readSample(net: Net, file: string): Record<string, unknown> {
  const p = samplePath(net, file)
  const raw = readFileSync(p, 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

// ── CATALOG integrity ─────────────────────────────────────────────────────────

console.log('\nCATALOG — structure')

test('CATALOG is a non-empty array', () => {
  assert.ok(Array.isArray(CATALOG))
  assert.ok(CATALOG.length > 0)
})

test('every entry has required fields', () => {
  for (const entry of CATALOG) {
    assert.ok(typeof entry.file === 'string' && entry.file.length > 0, `file missing on ${JSON.stringify(entry)}`)
    assert.ok(typeof entry.title === 'string' && entry.title.length > 0, `title missing on ${entry.file}`)
    assert.ok(typeof entry.description === 'string' && entry.description.length > 0, `description missing on ${entry.file}`)
    assert.ok(typeof entry.updates === 'string' && entry.updates.length > 0, `updates missing on ${entry.file}`)
    assert.ok(Array.isArray(entry.nets) && entry.nets.length > 0, `nets missing on ${entry.file}`)
    assert.ok(Array.isArray(entry.keys), `keys must be array on ${entry.file}`)
  }
})

test('no duplicate file entries', () => {
  const files = CATALOG.map(e => e.file)
  const unique = new Set(files)
  assert.equal(unique.size, files.length, 'Duplicate file entries found')
})

// ── catalogUrl ────────────────────────────────────────────────────────────────

console.log('\ncatalogUrl')

for (const entry of CATALOG) {
  for (const net of entry.nets) {
    test(`catalogUrl(${entry.file}, ${net}) starts with DATA_BASE/${net}/`, () => {
      const url = catalogUrl(entry, net)
      assert.ok(
        url.startsWith(`${DATA_BASE}/${net}/`),
        `Expected url to start with ${DATA_BASE}/${net}/ but got: ${url}`,
      )
    })
  }
}

// ── sample key checks ─────────────────────────────────────────────────────────

console.log('\nCATALOG — key parity with sample files')

for (const entry of CATALOG) {
  if (skipSampleCheck(entry.file, entry.keys)) {
    console.log(`  – ${entry.file}: sample check skipped (no keys or not a fixed JSON file)`)
    continue
  }

  for (const net of entry.nets) {
    test(`${net}/${entry.file} — catalog keys match sample (both directions)`, () => {
      const sample = readSample(net, entry.file)
      const sampleKeys = Object.keys(sample)
      const catalogKeys = entry.keys

      // Every catalog key must exist in the sample
      for (const k of catalogKeys) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(sample, k),
          `catalog key "${k}" not found in ${net}-${entry.file} sample`,
        )
      }

      // Every sample key must be listed in the catalog
      for (const k of sampleKeys) {
        assert.ok(
          catalogKeys.includes(k),
          `sample key "${k}" from ${net}-${entry.file} is not listed in catalog keys`,
        )
      }
    })
  }
}

// ── buildCatalogJson ──────────────────────────────────────────────────────────

console.log('\nbuildCatalogJson')

test('lists every CATALOG entry exactly once', () => {
  const result = buildCatalogJson()
  assert.equal(result.files.length, CATALOG.length, 'File count mismatch')
  for (const entry of CATALOG) {
    const found = result.files.filter(f => f.file === entry.file)
    assert.equal(found.length, 1, `Entry "${entry.file}" should appear exactly once`)
  }
})

test('generatedAt parses as a valid date', () => {
  const result = buildCatalogJson()
  const d = new Date(result.generatedAt)
  assert.ok(!isNaN(d.getTime()), `generatedAt "${result.generatedAt}" is not a valid date`)
})

test('generatedAt reflects the injected date', () => {
  const fixed = new Date('2026-10-11T00:00:00.000Z')
  const result = buildCatalogJson(fixed)
  assert.equal(result.generatedAt, '2026-10-11T00:00:00.000Z')
})

test('base is DATA_BASE', () => {
  const result = buildCatalogJson()
  assert.equal(result.base, DATA_BASE)
})

test('each file entry has correct urls for its nets', () => {
  const result = buildCatalogJson()
  for (const f of result.files) {
    const entry = CATALOG.find(e => e.file === f.file)!
    for (const net of entry.nets) {
      assert.ok(
        f.urls[net].startsWith(`${DATA_BASE}/${net}/`),
        `url for ${f.file}/${net} should start with ${DATA_BASE}/${net}/`,
      )
    }
  }
})

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exit(1)
