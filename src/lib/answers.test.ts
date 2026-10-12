/**
 * Tests for src/lib/answers.ts
 * Run: ANSWERS_SAMPLES=src/lib/fixtures/catalog node --experimental-strip-types src/lib/answers.test.ts
 * (defaults to src/lib/fixtures/catalog when env var is absent)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANSWERS, answerValue, answerSeries } from './answers.ts'
import { parseLatest } from './networkHealth.ts'
import { parseSupply } from './activityMix.ts'
import type { AutoField, SupplySeriesPoint } from './activityMix.ts'
import type { SeriesPoint, IndexedWindow } from './networkHealth.ts'

// ── Raw JSON shapes (typed so we avoid any-typed member access) ───────────────

interface RawWindow {
  hours: number
  blocks: number
  txs: number
  failed: number
  fees: number
  walletHours: number
  top: unknown[]
  auto?: AutoField
  autoCoverageHours?: number
  [key: string]: unknown
}

interface RawLatestJson {
  network: string
  generatedAt: string
  windows: { '1h': RawWindow; '24h': RawWindow; '7d': RawWindow }
  series: SeriesPoint[]
}

interface RawSupplyToken {
  supply: number
  series: SupplySeriesPoint[]
}

interface RawSupplyJson {
  generatedAt: string
  network: string
  tokens: { usdc: RawSupplyToken; eurc: RawSupplyToken }
}

// ── Fixture loading ───────────────────────────────────────────────────────────

const SAMPLES_DIR = process.env['ANSWERS_SAMPLES'] ?? 'src/lib/fixtures/catalog'

function loadLatest(net: 'mainnet' | 'testnet') {
  const raw = JSON.parse(readFileSync(join(SAMPLES_DIR, `${net}-latest.json`), 'utf-8')) as RawLatestJson
  const parsed = parseLatest(raw)
  if (!parsed) throw new Error(`parseLatest returned null for ${net}`)
  return { raw, parsed }
}

function loadSupply(net: 'mainnet' | 'testnet') {
  const raw = JSON.parse(readFileSync(join(SAMPLES_DIR, `${net}-supply.json`), 'utf-8')) as RawSupplyJson
  const parsed = parseSupply(raw)
  if (!parsed) throw new Error(`parseSupply returned null for ${net}`)
  return { raw, parsed }
}

const mainnetLatest = loadLatest('mainnet')
const mainnetSupply = loadSupply('mainnet')

// ── Test harness ──────────────────────────────────────────────────────────────

let pass = 0
let fail = 0

function test(name: string, fn: () => void) {
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

// ── ANSWERS catalog ───────────────────────────────────────────────────────────

console.log('\nANSWERS catalog')

test('has exactly 5 entries', () => {
  assert.equal(ANSWERS.length, 5)
})

test('slugs are in the required order', () => {
  const expected = [
    'transfer-fee',
    'daily-transactions',
    'success-rate',
    'usdc-supply',
    'automated-share',
  ]
  assert.deepEqual(ANSWERS.map(a => a.slug), expected)
})

test('slugs are unique', () => {
  const slugs = ANSWERS.map(a => a.slug)
  assert.equal(new Set(slugs).size, slugs.length)
})

test('every entry has question, short, method, sourceFile', () => {
  for (const a of ANSWERS) {
    assert.ok(a.question.length > 0, `${a.slug}: question is empty`)
    assert.ok(a.short.length > 0, `${a.slug}: short is empty`)
    assert.ok(a.method.length > 0, `${a.slug}: method is empty`)
    assert.ok(a.sourceFile === 'latest.json' || a.sourceFile === 'supply.json', `${a.slug}: bad sourceFile`)
  }
})

// ── answerValue: null when latest/supply is null ──────────────────────────────

console.log('\nanswerValue: null inputs')

for (const slug of ['transfer-fee', 'daily-transactions', 'success-rate', 'automated-share']) {
  test(`${slug} → null when latest is null`, () => {
    assert.equal(answerValue(slug, null, null), null)
  })
}

test('usdc-supply → null when supply is null', () => {
  assert.equal(answerValue('usdc-supply', mainnetLatest.parsed, null), null)
})

// ── answerValue: null when 24h window has txs === 0 ──────────────────────────

console.log('\nanswerValue: txs === 0 guard')

function cloneLatestWithZeroTxs() {
  // Deep-clone the raw JSON via JSON round-trip and set windows['24h'].txs = 0
  const cloned = JSON.parse(JSON.stringify(mainnetLatest.raw)) as RawLatestJson
  const w24 = cloned.windows['24h']
  w24.txs = 0
  w24.failed = 0
  const parsed = parseLatest(cloned)
  if (!parsed) throw new Error('parseLatest returned null after clone')
  return parsed
}

const zeroTxsLatest = cloneLatestWithZeroTxs()

for (const slug of ['transfer-fee', 'daily-transactions', 'success-rate', 'automated-share']) {
  test(`${slug} → null when 24h txs === 0`, () => {
    assert.equal(answerValue(slug, zeroTxsLatest, null), null)
  })
}

// ── answerValue: automated-share null when auto is missing ───────────────────

console.log('\nanswerValue: automated-share edge cases')

test('automated-share → null when auto field is removed', () => {
  const cloned = JSON.parse(JSON.stringify(mainnetLatest.raw)) as RawLatestJson
  delete cloned.windows['24h'].auto
  // auto is optional in IndexedWindow, so parseLatest should still succeed
  const parsed = parseLatest(cloned)
  if (!parsed) {
    assert.fail('parseLatest returned null after removing optional auto field')
  }
  assert.equal(answerValue('automated-share', parsed, null), null)
})

// ── answerValue: mainnet hand-computed expectations ───────────────────────────

console.log('\nanswerValue: mainnet expected values')

test('transfer-fee matches hand-computed average', () => {
  // Hand-compute from typed raw JSON
  const w24: IndexedWindow = mainnetLatest.parsed.windows['24h']
  const expectedAvgFee = w24.fees / w24.txs  // 3346.5992 / 805924
  const expectedStr = `$${expectedAvgFee.toFixed(4)}`
  const result = answerValue('transfer-fee', mainnetLatest.parsed, null)
  assert.ok(result, 'result is null')
  assert.equal(result.value, expectedStr)
  assert.ok(result.detail.length > 0)
})

test('daily-transactions matches hand-computed txs', () => {
  const w24: IndexedWindow = mainnetLatest.parsed.windows['24h']
  const expectedStr = new Intl.NumberFormat('en-US').format(w24.txs)
  const result = answerValue('daily-transactions', mainnetLatest.parsed, null)
  assert.ok(result, 'result is null')
  assert.equal(result.value, expectedStr)
  assert.equal(result.detail, 'last 24 hours')
})

test('success-rate matches hand-computed rate', () => {
  const w24: IndexedWindow = mainnetLatest.parsed.windows['24h']
  const expectedRate = parseFloat(((1 - w24.failed / w24.txs) * 100).toFixed(2))
  const expectedStr = `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(expectedRate)}%`
  const result = answerValue('success-rate', mainnetLatest.parsed, null)
  assert.ok(result, 'result is null')
  assert.equal(result.value, expectedStr)
})

test('usdc-supply matches hand-computed supply', () => {
  const supply = mainnetSupply.parsed.tokens.usdc.supply
  const expectedStr = `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(supply / 1_000_000)}M`
  const result = answerValue('usdc-supply', null, mainnetSupply.parsed)
  assert.ok(result, 'result is null')
  assert.equal(result.value, expectedStr)
  assert.equal(result.detail, 'circulating USDC')
})

test('automated-share matches hand-computed share', () => {
  const w24: IndexedWindow = mainnetLatest.parsed.windows['24h']
  // auto is typed as unknown on IndexedWindow; use the parsed window's auto field safely
  const rawAuto = w24.auto
  if (!rawAuto || typeof rawAuto !== 'object') {
    assert.fail('auto field missing from parsed window')
    return
  }
  const autoField = rawAuto as AutoField
  const rawSeries = JSON.parse(readFileSync(join(SAMPLES_DIR, 'mainnet-latest.json'), 'utf8')).series as { txs: number }[]
  const n = (w24 as unknown as { autoCoverageHours: number }).autoCoverageHours
  const base = rawSeries.slice(-n).reduce((sum, p) => sum + p.txs, 0)
  const pct = (autoField.tx / base) * 100
  assert.ok(pct > 0 && pct < 100, `share out of range: ${pct}`)
  const expectedStr = `≈${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(pct)}%`
  const result = answerValue('automated-share', mainnetLatest.parsed, null)
  assert.ok(result, 'result is null')
  assert.equal(result.value, expectedStr)
})

// ── answerSeries: length and last point ───────────────────────────────────────

console.log('\nanswerSeries: length and last point')

test('transfer-fee series length <= 48', () => {
  const s = answerSeries('transfer-fee', mainnetLatest.parsed, null)
  assert.ok(s, 'series is null')
  assert.ok(s.points.length <= 48)
})

test('transfer-fee last point matches last series point in sample', () => {
  const series = mainnetLatest.parsed.series
  const lastRaw = series[series.length - 1]
  assert.ok(lastRaw, 'series is empty')
  const expectedValue = lastRaw.txs === 0 ? null : lastRaw.fees / lastRaw.txs
  const s = answerSeries('transfer-fee', mainnetLatest.parsed, null)
  assert.ok(s, 'series is null')
  const lastPoint = s.points[s.points.length - 1]
  assert.ok(lastPoint, 'no points')
  assert.equal(lastPoint.label, lastRaw.hour)
  if (expectedValue === null) {
    assert.equal(lastPoint.value, null)
  } else {
    const lv = lastPoint.value
    assert.ok(lv !== null)
    assert.ok(Math.abs(lv - expectedValue) < 1e-10)
  }
})

test('daily-transactions series length <= 48', () => {
  const s = answerSeries('daily-transactions', mainnetLatest.parsed, null)
  assert.ok(s, 'series is null')
  assert.ok(s.points.length <= 48)
})

test('daily-transactions last point matches last series point in sample', () => {
  const series = mainnetLatest.parsed.series
  const lastRaw = series[series.length - 1]
  assert.ok(lastRaw, 'series is empty')
  const s = answerSeries('daily-transactions', mainnetLatest.parsed, null)
  assert.ok(s, 'series is null')
  const lastPoint = s.points[s.points.length - 1]
  assert.ok(lastPoint)
  assert.equal(lastPoint.label, lastRaw.hour)
  assert.equal(lastPoint.value, lastRaw.txs)
})

test('success-rate series length <= 48', () => {
  const s = answerSeries('success-rate', mainnetLatest.parsed, null)
  assert.ok(s, 'series is null')
  assert.ok(s.points.length <= 48)
})

test('success-rate last point matches last series point in sample', () => {
  const series = mainnetLatest.parsed.series
  const lastRaw = series[series.length - 1]
  assert.ok(lastRaw, 'series is empty')
  const expectedValue = lastRaw.txs === 0
    ? null
    : parseFloat(((1 - lastRaw.failed / lastRaw.txs) * 100).toFixed(2))
  const s = answerSeries('success-rate', mainnetLatest.parsed, null)
  assert.ok(s, 'series is null')
  const lastPoint = s.points[s.points.length - 1]
  assert.ok(lastPoint)
  assert.equal(lastPoint.label, lastRaw.hour)
  assert.equal(lastPoint.value, expectedValue)
})

test('usdc-supply series length <= 48', () => {
  const s = answerSeries('usdc-supply', null, mainnetSupply.parsed)
  assert.ok(s, 'series is null')
  assert.ok(s.points.length <= 48)
})

test('usdc-supply last point matches last supply series point in sample', () => {
  const usdcSeries = mainnetSupply.parsed.tokens.usdc.series
  const lastRaw = usdcSeries[usdcSeries.length - 1]
  assert.ok(lastRaw, 'supply series is empty')
  const s = answerSeries('usdc-supply', null, mainnetSupply.parsed)
  assert.ok(s, 'series is null')
  const lastPoint = s.points[s.points.length - 1]
  assert.ok(lastPoint)
  assert.equal(lastPoint.label, lastRaw.hour)
  assert.equal(lastPoint.value, lastRaw.supply)
})

test('automated-share series is null (no hourly series)', () => {
  const s = answerSeries('automated-share', mainnetLatest.parsed, mainnetSupply.parsed)
  assert.equal(s, null)
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exit(1)
