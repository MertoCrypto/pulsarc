/**
 * Tests for src/lib/llama.ts
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/llama.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import {
  parseChainSeries,
  latestAndChange,
  parseOverview,
  topProtocols,
  launchpads,
  venueShares,
  headlineMismatch,
  parseStablecoins,
  lastFullDay,
  toLocalLogo,
} from './llama.ts'

// ---------------------------------------------------------------------------
// Fixture loader
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const fixtureDir = join(__dirname, 'fixtures', 'llama')

function loadFixture(name: string): unknown {
  const p = join(fixtureDir, name)
  // If the file does not exist the test must fail — no try/catch
  const text = readFileSync(p, 'utf8')
  return JSON.parse(text)
}

let passed = 0

function test(name: string, fn: () => void): void {
  fn()
  passed++
  // console.log(`  PASS: ${name}`)
}

// ---------------------------------------------------------------------------
// Fixture tests
// ---------------------------------------------------------------------------

// --- chainTvl ---

const chainTvlFixture = loadFixture('chainTvl.json')
const chainSeries = parseChainSeries(chainTvlFixture)

test('chainTvl: parses non-zero points', () => {
  assert.ok(chainSeries.length > 0, 'expected non-empty series')
})

test('chainTvl: sorted ascending', () => {
  for (let i = 1; i < chainSeries.length; i++) {
    assert.ok(chainSeries[i].date >= chainSeries[i - 1].date, 'not sorted asc at index ' + i)
  }
})

test('chainTvl: latest = 633518579 at 1792713600', () => {
  const last = chainSeries[chainSeries.length - 1]
  assert.equal(last.date, 1792713600)
  assert.equal(last.usd, 633518579)
})

test('chainTvl: drops non-finite values', () => {
  const bad = parseChainSeries([{ date: 'NaN', tvl: 1 }, { date: 1, tvl: 'NaN' }, { date: 1, tvl: 1 }])
  // NaN dates and tvl are dropped
  for (const p of bad) {
    assert.ok(Number.isFinite(p.date), 'non-finite date survived')
    assert.ok(Number.isFinite(p.usd), 'non-finite usd survived')
  }
})

// latestAndChange on chainSeries
test('chainTvl: latestAndChange 1d returns finite change', () => {
  const result = latestAndChange(chainSeries, 1)
  assert.equal(result.latest, 633518579)
  assert.ok(result.prev > 0 || result.change === null)
})

// --- fees ---

const feesFixture = loadFixture('fees.json')
const feesOverview = parseOverview(feesFixture)

test('fees: total24h = 287974.21', () => {
  // Allow floating point tolerance
  assert.ok(Math.abs(feesOverview.total24h - 287974.21) < 0.01,
    `expected 287974.21 got ${feesOverview.total24h}`)
})

test('fees: chart is non-empty and sorted', () => {
  assert.ok(feesOverview.chart.length > 0)
  for (let i = 1; i < feesOverview.chart.length; i++) {
    assert.ok(feesOverview.chart[i].date >= feesOverview.chart[i - 1].date)
  }
})

test('fees: top protocol by total24h is Morpho Blue', () => {
  const top = topProtocols(feesOverview.protocols, 1, 'total24h')
  assert.ok(top.length > 0, 'expected at least 1 protocol')
  assert.equal(top[0].name, 'Morpho Blue',
    `expected Morpho Blue, got ${top[0].name}`)
})

test('fees: protocols have correct shape', () => {
  for (const p of feesOverview.protocols) {
    assert.equal(typeof p.name, 'string')
    assert.equal(typeof p.total24h, 'number')
    assert.ok(Number.isFinite(p.total24h))
  }
})

// D1: change_1d is already a percent — parseOverview must divide by 100
test('fees: overview change1d === 3.085 (308.5 / 100)', () => {
  // fees.json change_1d = 308.5
  assert.ok(Math.abs(feesOverview.change1d! - 3.085) < 1e-9,
    `expected change1d=3.085 (fraction), got ${feesOverview.change1d}`)
})

// dexs change1d test is placed after dexsOverview is initialized (below)

test('D1: Argus World per-protocol change1d === 0.0055 (0.55 / 100)', () => {
  // Argus World change_1d = 0.55 in the fixture → should become 0.0055
  const pads = launchpads(feesOverview.protocols)
  const argus = pads.find(p => p.name === 'Argus World')
  assert.ok(argus !== undefined, 'Argus World must be present in launchpads')
  assert.ok(Math.abs(argus.change1d! - 0.0055) < 1e-9,
    `expected Argus World change1d=0.0055, got ${argus.change1d}`)
})

// --- launchpads ---

test('fees: first launchpad is Argus World (by total24h desc)', () => {
  const pads = launchpads(feesOverview.protocols)
  assert.ok(pads.length > 0, 'expected at least one launchpad')
  const firstPad = pads[0]
  assert.ok(firstPad !== undefined, 'no launchpads found')
  assert.equal(firstPad.name, 'Argus World',
    `expected first launchpad "Argus World", got "${firstPad.name}"`)
})

test('fees: launchpads drops zero-activity rows', () => {
  const pads = launchpads(feesOverview.protocols)
  for (const p of pads) {
    assert.ok(!(p.total30d === 0 && p.total24h === 0),
      `launchpad ${p.name} has total30d=0 AND total24h=0`)
  }
})

// --- dexs ---

const dexsFixture = loadFixture('dexs.json')
const dexsOverview = parseOverview(dexsFixture)

test('dexs: total24h = 89210280.01', () => {
  assert.ok(Math.abs(dexsOverview.total24h - 89210280.01) < 0.01,
    `expected 89210280.01 got ${dexsOverview.total24h}`)
})

test('dexs: overview change1d === 4.7469 (474.69 / 100)', () => {
  // dexs.json change_1d = 474.69
  assert.ok(Math.abs(dexsOverview.change1d! - 4.7469) < 1e-9,
    `expected change1d=4.7469 (fraction), got ${dexsOverview.change1d}`)
})

test('dexs: venueShares computes correct sums', () => {
  // Pass the headline total24h from the overview as providerTotal
  const result = venueShares(dexsOverview.protocols, 6, dexsOverview.total24h)

  // Sum per-protocol rows manually: loop through protocols
  let manualSum = 0
  for (const p of dexsOverview.protocols) { manualSum += p.total24h }
  assert.ok(Math.abs(result.venuesSum - manualSum) < 1,
    `venuesSum mismatch: expected ~${manualSum} got ${result.venuesSum}`)

  // From spec: providerTotal = 89210280.01, venuesSum ≈ 16069939.82
  assert.ok(Math.abs(result.providerTotal - 89210280.01) < 1,
    `providerTotal mismatch: expected 89210280.01 got ${result.providerTotal}`)

  assert.ok(Math.abs(result.venuesSum - 16069939.82) < 1,
    `venuesSum expected ~16069939.82, got ${result.venuesSum}`)
})

test('dexs: headlineMismatch is true', () => {
  const result = venueShares(dexsOverview.protocols, 6, dexsOverview.total24h)
  const mismatch = headlineMismatch(result.providerTotal, result.venuesSum)
  assert.ok(mismatch, 'expected headlineMismatch to be true')
})

test('dexs: venueShares rows have share summing to ~1', () => {
  const result = venueShares(dexsOverview.protocols, 6, dexsOverview.total24h)
  const totalShare = result.rows.reduce((s, r) => s + r.share, 0)
  assert.ok(Math.abs(totalShare - 1) < 0.001,
    `shares should sum to ~1, got ${totalShare}`)
})

test('dexs: headlineMismatch false when equal', () => {
  assert.ok(!headlineMismatch(100, 100))
  assert.ok(!headlineMismatch(149, 100))
  assert.ok(headlineMismatch(151, 100))
})

// --- stablecoins ---

const stablesFixture = loadFixture('stablecoins.json')
const stablesResult = parseStablecoins(stablesFixture)

test('stablecoins: last peggedUSD = 820255423.42', () => {
  const series = stablesResult.series
  assert.ok(series.length > 0, 'expected non-empty series')
  const last = series[series.length - 1]
  assert.ok(Math.abs(last.usd - 820255423.42) < 0.01,
    `expected 820255423.42, got ${last.usd}`)
})

test('stablecoins: series sorted ascending', () => {
  const { series } = stablesResult
  for (let i = 1; i < series.length; i++) {
    assert.ok(series[i].date >= series[i - 1].date, 'not sorted asc')
  }
})

test('stablecoins: change7d is a valid LatestAndChange', () => {
  const c = stablesResult.change7d
  assert.ok(Number.isFinite(c.latest))
  assert.ok(Number.isFinite(c.prev) || c.prev === 0)
  assert.ok(c.change === null || Number.isFinite(c.change))
})

// ---------------------------------------------------------------------------
// Synthetic / edge-case tests
// ---------------------------------------------------------------------------

test('parseChainSeries: empty array returns []', () => {
  const r = parseChainSeries([])
  assert.deepEqual(r, [])
})

test('parseChainSeries: non-array returns []', () => {
  assert.deepEqual(parseChainSeries(null), [])
  assert.deepEqual(parseChainSeries({}), [])
})

test('latestAndChange: empty series returns nullish', () => {
  const r = latestAndChange([], 1)
  assert.equal(r.latest, 0)
  assert.equal(r.change, null)
})

test('latestAndChange: prev = 0 => change = null', () => {
  const series = [
    { date: 1000000, usd: 0 },
    { date: 1086400, usd: 100 },
  ]
  const r = latestAndChange(series, 1)
  assert.equal(r.latest, 100)
  assert.equal(r.prev, 0)
  assert.equal(r.change, null)
})

test('latestAndChange: correct positive change', () => {
  const series = [
    { date: 1000000, usd: 100 },
    { date: 1086400, usd: 150 },
  ]
  const r = latestAndChange(series, 1)
  assert.ok(Math.abs(r.change! - 0.5) < 0.001, `expected 0.5 got ${r.change}`)
})

test('latestAndChange: prev missing (no point near target) => null change', () => {
  const series = [
    { date: 1000000, usd: 100 },
    { date: 1999999, usd: 200 },  // latest; target is 1913599 — no point nearby
  ]
  const r = latestAndChange(series, 1)
  assert.equal(r.change, null)
})

test('topProtocols: ties broken by name asc', () => {
  const protos = [
    { name: 'B', displayName: 'B', category: 'Dexs', slug: 'b', logo: null, total24h: 100, total7d: 0, total30d: 0, totalAllTime: null, change1d: null },
    { name: 'A', displayName: 'A', category: 'Dexs', slug: 'a', logo: null, total24h: 100, total7d: 0, total30d: 0, totalAllTime: null, change1d: null },
    { name: 'C', displayName: 'C', category: 'Dexs', slug: 'c', logo: null, total24h: 50, total7d: 0, total30d: 0, totalAllTime: null, change1d: null },
  ]
  const top = topProtocols(protos, 3)
  assert.equal(top[0].name, 'A')  // tie broken by name asc
  assert.equal(top[1].name, 'B')
  assert.equal(top[2].name, 'C')
})

test('lastFullDay: strips today partial point', () => {
  const nowMs = new Date('2026-10-23T12:00:00Z').getTime()
  const todayUnix = new Date('2026-10-23T00:00:00Z').getTime() / 1000
  const yesterdayUnix = todayUnix - 86400
  const series = [
    { date: yesterdayUnix - 86400, usd: 10 },
    { date: yesterdayUnix, usd: 20 },
    { date: todayUnix, usd: 30 },
  ]
  const result = lastFullDay(series, nowMs)
  assert.equal(result.length, 2, 'should remove today partial point')
  assert.equal(result[result.length - 1].date, yesterdayUnix)
})

test('lastFullDay: keeps point when not today', () => {
  const nowMs = new Date('2026-10-23T12:00:00Z').getTime()
  const yesterdayUnix = new Date('2026-10-22T00:00:00Z').getTime() / 1000
  const series = [
    { date: yesterdayUnix - 86400, usd: 10 },
    { date: yesterdayUnix, usd: 20 },
  ]
  const result = lastFullDay(series, nowMs)
  assert.equal(result.length, 2, 'should keep all points when last is not today')
})

test('lastFullDay: empty series returns empty', () => {
  assert.deepEqual(lastFullDay([], Date.now()), [])
})

test('parseStablecoins: empty returns empty series', () => {
  const r = parseStablecoins([])
  assert.deepEqual(r.series, [])
  assert.equal(r.change7d.change, null)
})

test('parseOverview: null/undefined numbers become 0', () => {
  const r = parseOverview({ total24h: null, total7d: undefined, protocols: [] })
  assert.equal(r.total24h, 0)
  assert.equal(r.total7d, 0)
  assert.equal(r.change1d, null)
})

test('launchpads: empty when no launchpads', () => {
  const pads = launchpads([])
  assert.deepEqual(pads, [])
})

test('venueShares: single protocol gets share = 1', () => {
  const protos = [
    { name: 'Foo', displayName: 'Foo', category: 'Dexs', slug: 'foo', logo: null, total24h: 1000, total7d: 0, total30d: 0, totalAllTime: null, change1d: null },
  ]
  const r = venueShares(protos, 6)
  assert.equal(r.rows.length, 1)
  assert.ok(Math.abs(r.rows[0].share - 1) < 0.001)
})

// ---------------------------------------------------------------------------
// B1: launchpads — correct AND/OR filter
// ---------------------------------------------------------------------------

test('B1: launchpads keeps {24h:0, 30d:5} (30d > 0)', () => {
  const row = makeProto('Keep30d', 'Launchpad', 0, 5)
  const result = launchpads([row])
  assert.equal(result.length, 1, 'should keep row with total30d > 0 even if total24h=0')
})

test('B1: launchpads drops {24h:0, 30d:0}', () => {
  const row = makeProto('DropBoth', 'Launchpad', 0, 0)
  const result = launchpads([row])
  assert.equal(result.length, 0, 'should drop row where both total24h=0 AND total30d=0')
})

test('B1: launchpads keeps {24h:3, 30d:0} (24h > 0)', () => {
  const row = makeProto('Keep24h', 'Launchpad', 3, 0)
  const result = launchpads([row])
  assert.equal(result.length, 1, 'should keep row with total24h > 0 even if total30d=0')
})

test('B1: Wonk Fun (24h=0, 30d=19700.84) present in fixture', () => {
  const pads = launchpads(feesOverview.protocols)
  const wonk = pads.find(p => p.name === 'Wonk Fun')
  assert.ok(wonk !== undefined, 'Wonk Fun (24h=0, 30d>0) must be present in launchpads')
})

test('B1: ellipse.fun (both 0) absent from fixture launchpads', () => {
  const pads = launchpads(feesOverview.protocols)
  const ellipse = pads.find(p => p.name === 'ellipse.fun')
  assert.equal(ellipse, undefined, 'ellipse.fun (24h=0, 30d=0) must be absent from launchpads')
})

// ---------------------------------------------------------------------------
// B2: venueShares fallback when providerTotal <= 0
// ---------------------------------------------------------------------------

test('B2: venueShares falls back to venuesSum when providerTotal=0', () => {
  const protos = [makeProto('A', 'Dexs', 100, 100), makeProto('B', 'Dexs', 50, 50)]
  const r = venueShares(protos, 6, 0)
  assert.equal(r.providerTotal, 150, 'providerTotal=0 should fall back to venuesSum=150')
})

test('B2: venueShares falls back to venuesSum when providerTotal is negative', () => {
  const protos = [makeProto('A', 'Dexs', 200, 200)]
  const r = venueShares(protos, 6, -10)
  assert.equal(r.providerTotal, 200, 'negative providerTotal should fall back to venuesSum=200')
})

// ---------------------------------------------------------------------------
// B3: venueShares 'Other' row for exactly n-protocols-1 top entries
// ---------------------------------------------------------------------------

test('B3: venueShares with n = protocols.length-1 yields exactly 1 Other row', () => {
  const protos = [
    makeProto('A', 'Dexs', 300, 300),
    makeProto('B', 'Dexs', 200, 200),
    makeProto('C', 'Dexs', 100, 100),
  ]
  const n = protos.length - 1  // n=2; rest=[C]
  const r = venueShares(protos, n)
  const otherRows = r.rows.filter(row => row.name === 'Other')
  assert.equal(otherRows.length, 1, 'exactly one Other row when rest.length===1')
  assert.ok(Math.abs(otherRows[0].total24h - 100) < 0.001, `Other row total24h should be 100 (last venue C), got ${otherRows[0].total24h}`)
})

// ---------------------------------------------------------------------------
// B4: headlineMismatch boundary cases
// ---------------------------------------------------------------------------

test('B4: headlineMismatch(0, 0) → false (venuesSum=0 guard)', () => {
  assert.equal(headlineMismatch(0, 0), false)
})

test('B4: headlineMismatch(150, 100) → false (exactly 1.5× is NOT strictly greater)', () => {
  assert.equal(headlineMismatch(150, 100), false)
})

test('B4: headlineMismatch(150.01, 100) → true (strictly > 1.5×)', () => {
  assert.equal(headlineMismatch(150.01, 100), true)
})

test('B4: headlineMismatch(10, 0) → false (venuesSum=0 guard)', () => {
  assert.equal(headlineMismatch(10, 0), false)
})

// ---------------------------------------------------------------------------
// B5: parseOverview missing/NaN change_1d → null (not 0)
// ---------------------------------------------------------------------------

test('B5: parseOverview maps missing change_1d to null', () => {
  const r = parseOverview({ total24h: 100, protocols: [] })
  assert.equal(r.change1d, null, 'missing change_1d must map to null, not 0')
})

test('B5: parseOverview maps NaN change_1d to null', () => {
  const r = parseOverview({ change_1d: NaN, protocols: [] })
  assert.equal(r.change1d, null, 'NaN change_1d must map to null, not 0')
})

// ---------------------------------------------------------------------------
// B6: topProtocols returns exactly n entries (not n+1)
// ---------------------------------------------------------------------------

test('B6: topProtocols returns exactly n entries', () => {
  const n = 3
  const protos = [
    makeProto('A', 'Dexs', 500, 500),
    makeProto('B', 'Dexs', 400, 400),
    makeProto('C', 'Dexs', 300, 300),
    makeProto('D', 'Dexs', 200, 200),
    makeProto('E', 'Dexs', 100, 100),
  ]
  const top = topProtocols(protos, n)
  assert.equal(top.length, n, `topProtocols should return exactly ${n} entries, not ${top.length}`)
})

test('B6: topProtocols with n > list length returns whole list', () => {
  const protos = [makeProto('A', 'Dexs', 100, 100), makeProto('B', 'Dexs', 50, 50)]
  const top = topProtocols(protos, 10)
  assert.equal(top.length, 2, 'n larger than list should return the whole list')
})

// ---------------------------------------------------------------------------
// Part B: toLocalLogo
// ---------------------------------------------------------------------------

test('toLocalLogo: rewrites icons.llamao.fi URL to /llama-icons path', () => {
  const url = 'https://icons.llamao.fi/icons/protocols/uniswap'
  assert.equal(toLocalLogo(url), '/llama-icons/icons/protocols/uniswap')
})

test('toLocalLogo: null input → null', () => {
  assert.equal(toLocalLogo(null), null)
})

test('toLocalLogo: exact host match only — subdomain variant → null', () => {
  // icons.llamao.fi.evil.com is a different host
  assert.equal(toLocalLogo('https://icons.llamao.fi.evil.com/x'), null)
})

test('toLocalLogo: http:// (not https://) → null', () => {
  assert.equal(toLocalLogo('http://icons.llamao.fi/icons/protocols/foo'), null)
})

test('toLocalLogo: different hostname → null', () => {
  assert.equal(toLocalLogo('https://api.llama.fi/icons/protocols/foo'), null)
})

test('parseOverview: logos are rewritten to /llama-icons paths', () => {
  const raw = {
    total24h: 0, protocols: [{
      name: 'Test', slug: 'test', logo: 'https://icons.llamao.fi/icons/protocols/test',
    }],
  }
  const r = parseOverview(raw)
  assert.equal(r.protocols[0].logo, '/llama-icons/icons/protocols/test',
    'parseOverview must rewrite llamao.fi logo URLs via toLocalLogo')
})

// ---------------------------------------------------------------------------
// Helpers for synthetic tests
// ---------------------------------------------------------------------------

function makeProto(name: string, category: string, total24h: number, total30d: number): import('./llama.ts').OverviewProtocol {
  return { name, displayName: name, category, slug: name.toLowerCase(), logo: null, total24h, total7d: 0, total30d, totalAllTime: null, change1d: null }
}

// ---------------------------------------------------------------------------
// Final count
// ---------------------------------------------------------------------------

console.log(`llama: ${passed} tests passed`)
