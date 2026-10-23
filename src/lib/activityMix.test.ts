/**
 * Tests for src/lib/activityMix.ts
 * Run: node --experimental-strip-types src/lib/activityMix.test.ts
 *
 * Fixture data is inlined (copied from the real samples) so this file
 * works regardless of whether context/samples/ is present.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import {
  coverageNote,
  automatedShare,
  smartAccountShare,
  paymentBuckets,
  bigTransfers,
  mintBurn,
  bridgeSummary,
  supplyChange,
  parseSupply,
  parseBridge,
  type ExtendedWindow,
  type SeriesPointMin,
  type SupplyJson,
  type BridgeJson,
} from './activityMix.ts'
import { parseLatest } from './networkHealth.ts'

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal valid window with all new optional fields set. */
const makeWindow = (overrides?: Partial<ExtendedWindow>): ExtendedWindow => ({
  hours: 24,
  txs: 1000,
  failed: 10,
  fees: 5.0,
  blocks: 5000,
  walletHours: 200,
  top: [],
  auto: { senders: 4, tx: 200 },
  autoCoverageHours: 1,
  aa: 10,
  aaTx: 10,
  buckets: [[80, 500], [15, 5000], [5, 60000]],
  bucketsCoverageHours: 1,
  mb: { usdc: [1000, 2000] },
  mbCoverageHours: 1,
  bridge: { out: [5, 3000, 6.0], in: [2], byDomain: { '0': [3, 1500], '6': [2, 1500] } },
  bridgeCoverageHours: 1,
  ...overrides,
})

/** Series with 24 points of 100 txs each = 2400 total; last 1 = 100. */
const makeSeries = (count: number, txsEach = 100): SeriesPointMin[] =>
  Array.from({ length: count }, (_, i) => ({
    hour: `2026-10-11T${String(i).padStart(2, '0')}`,
    txs: txsEach,
  }))

const minimalSupply: SupplyJson = {
  generatedAt: '2026-10-11T19:00:00Z',
  network: 'mainnet',
  tokens: {
    usdc: {
      supply: 100_000,
      series: [
        { hour: '2026-10-10T00', supply: 90_000, mint: 15_000, burn: 5_000 },
        { hour: '2026-10-11T00', supply: 100_000, mint: 20_000, burn: 10_000 },
      ],
    },
    eurc: {
      supply: 5_000,
      series: [{ hour: '2026-10-11T00', supply: 5_000 }],
    },
  },
}

const minimalBridge: BridgeJson = {
  generatedAt: '2026-10-11T19:00:00Z',
  network: 'mainnet',
  windows: {
    '1h': { out: [1, 100, 0.1], in: [0], byDomain: {} },
    '24h': { out: [5, 3000, 6.0], in: [2], byDomain: { '0': [3, 1500], '6': [2, 1500] } },
    '7d': { out: [10, 8000, 12.0], in: [4], byDomain: {} },
  },
  series: [
    { hour: '2026-10-10T00', outCount: 2, outUsdc: 1000, inCount: 1 },
    { hour: '2026-10-11T00', outCount: 3, outUsdc: 2000, inCount: 1 },
  ],
}

// ── coverageNote ──────────────────────────────────────────────────────────────
console.log('\ncoverageNote')

test('full coverage returns null', () => {
  assert.equal(coverageNote(24, 24), null)
})

test('partial coverage returns the note', () => {
  const note = coverageNote(1, 24)
  assert.ok(note !== null)
  assert.ok(note.includes('1'))
  assert.ok(note.includes('24'))
})

test('n === 0 returns null', () => {
  assert.equal(coverageNote(0, 24), null)
})

test('n > hours returns null (treated as full)', () => {
  assert.equal(coverageNote(25, 24), null)
})

// ── automatedShare ────────────────────────────────────────────────────────────
console.log('\nautomatedShare')

test('correct share with partial coverage (N=1 of 24)', () => {
  const series = makeSeries(24, 100) // last 1 point = 100 txs
  const win = makeWindow({ auto: { senders: 4, tx: 20 }, autoCoverageHours: 1 })
  const result = automatedShare(win, series)
  assert.ok(result !== null)
  assert.ok(Math.abs(result.share - 0.2) < 0.0001, `expected 0.2, got ${result.share}`)
  assert.equal(result.senders, 4)
  assert.equal(result.tx, 20)
  assert.ok(result.note !== null) // partial: 1 of 24
})

test('full coverage note is null (N === window.hours)', () => {
  const series = makeSeries(24, 100)
  const win = makeWindow({ auto: { senders: 4, tx: 200 }, autoCoverageHours: 24, hours: 24 })
  const result = automatedShare(win, series)
  assert.ok(result !== null)
  assert.equal(result.note, null)
})

test('missing auto field returns null', () => {
  const win = makeWindow({ auto: undefined })
  assert.equal(automatedShare(win, makeSeries(10)), null)
})

test('autoCoverageHours = 0 returns null', () => {
  const win = makeWindow({ autoCoverageHours: 0 })
  assert.equal(automatedShare(win, makeSeries(10)), null)
})

test('share math: 50 auto out of 100-tx-series-last-1', () => {
  const series = makeSeries(5, 100) // last 1 = 100
  const win = makeWindow({ auto: { senders: 2, tx: 50 }, autoCoverageHours: 1 })
  const result = automatedShare(win, series)
  assert.ok(result !== null)
  assert.ok(Math.abs(result.share - 0.5) < 0.0001)
})

// ── smartAccountShare ─────────────────────────────────────────────────────────
console.log('\nsmartAccountShare')

test('correct SA share', () => {
  const series = makeSeries(24, 100) // last 1 = 100
  const win = makeWindow({ aa: 36, aaTx: 36, autoCoverageHours: 1 })
  const result = smartAccountShare(win, series)
  assert.ok(result !== null)
  assert.ok(Math.abs(result.share - 0.36) < 0.0001)
  assert.equal(result.aa, 36)
})

test('missing aa returns null', () => {
  const win = makeWindow({ aa: undefined, aaTx: undefined })
  assert.equal(smartAccountShare(win, makeSeries(5)), null)
})

// ── paymentBuckets ────────────────────────────────────────────────────────────
console.log('\npaymentBuckets')

test('bucket shares sum to 1 (count)', () => {
  const win = makeWindow({ buckets: [[80, 500], [15, 5000], [5, 60000]] })
  const result = paymentBuckets(win)
  assert.ok(result !== null)
  const sum = result.buckets.reduce((s, b) => s + (b.countShare ?? 0), 0)
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `count shares sum = ${sum}`)
})

test('bucket shares sum to 1 (volume)', () => {
  const win = makeWindow({ buckets: [[80, 500], [15, 5000], [5, 60000]] })
  const result = paymentBuckets(win)
  assert.ok(result !== null)
  const sum = result.buckets.reduce((s, b) => s + (b.volumeShare ?? 0), 0)
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `volume shares sum = ${sum}`)
})

test('bucket labels are correct', () => {
  const win = makeWindow()
  const result = paymentBuckets(win)
  assert.ok(result !== null)
  assert.equal(result.buckets[0].label, '< $250')
  assert.equal(result.buckets[1].label, '$250 – $10k')
  assert.equal(result.buckets[2].label, '> $10k')
})

test('missing buckets returns null', () => {
  const win = makeWindow({ buckets: undefined })
  assert.equal(paymentBuckets(win), null)
})

test('coverageHours = 0 returns null', () => {
  const win = makeWindow({ bucketsCoverageHours: 0 })
  assert.equal(paymentBuckets(win), null)
})

test('note present when partial coverage', () => {
  const win = makeWindow({ bucketsCoverageHours: 1, hours: 24 })
  const result = paymentBuckets(win)
  assert.ok(result !== null)
  assert.ok(result.note !== null)
})

// ── bigTransfers ──────────────────────────────────────────────────────────────
console.log('\nbigTransfers')

const validTx = '0x' + 'a'.repeat(64)
const validAddr1 = '0x' + 'b'.repeat(40)
const validAddr2 = '0x' + 'c'.repeat(40)

test('sorted descending and limited', () => {
  const win = makeWindow({
    big: [
      { tx: validTx, amt: 5_000_000, from: validAddr1, to: validAddr2 },
      { tx: validTx, amt: 50_000_000, from: validAddr1, to: validAddr2 },
      { tx: validTx, amt: 10_000_000, from: validAddr1, to: validAddr2 },
    ],
  })
  const result = bigTransfers(win, 2)
  assert.ok(result !== null)
  assert.equal(result.length, 2)
  assert.equal(result[0].amt, 50_000_000)
  assert.equal(result[1].amt, 10_000_000)
})

test('missing big field returns null', () => {
  const win = makeWindow({ big: undefined })
  assert.equal(bigTransfers(win), null)
})

test('empty big array returns null', () => {
  const win = makeWindow({ big: [] })
  assert.equal(bigTransfers(win), null)
})

test('invalid address filtered out', () => {
  const win = makeWindow({
    big: [
      { tx: validTx, amt: 5_000_000, from: 'notanaddr', to: validAddr2 },
      { tx: validTx, amt: 7_000_000, from: validAddr1, to: validAddr2 },
    ],
  })
  const result = bigTransfers(win)
  assert.ok(result !== null)
  assert.equal(result.length, 1)
  assert.equal(result[0].amt, 7_000_000)
})

// ── mintBurn ──────────────────────────────────────────────────────────────────
console.log('\nmintBurn')

test('net = minted - burned', () => {
  const win = makeWindow({ mb: { usdc: [1000, 2500] }, mbCoverageHours: 1 })
  const result = mintBurn(win)
  assert.ok(result !== null)
  assert.equal(result.usdcMinted, 1000)
  assert.equal(result.usdcBurned, 2500)
  assert.equal(result.usdcNet, -1500)
})

test('eurc present', () => {
  const win = makeWindow({ mb: { usdc: [100, 200], eurc: [50, 30] }, mbCoverageHours: 1 })
  const result = mintBurn(win)
  assert.ok(result !== null)
  assert.equal(result.eurcMinted, 50)
  assert.equal(result.eurcBurned, 30)
  assert.equal(result.eurcNet, 20)
})

test('missing mb returns null', () => {
  const win = makeWindow({ mb: undefined })
  assert.equal(mintBurn(win), null)
})

test('mbCoverageHours = 0 returns null', () => {
  const win = makeWindow({ mbCoverageHours: 0 })
  assert.equal(mintBurn(win), null)
})

// ── bridgeSummary ─────────────────────────────────────────────────────────────
console.log('\nbridgeSummary')

test('top domains sorted by usdc descending', () => {
  const win = makeWindow({
    bridge: {
      out: [5, 3000, 6.0],
      in: [2],
      byDomain: {
        '0': [3, 1500],
        '6': [2, 1500],
        '3': [1, 500],
      },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  // top domains by usdc: domain 0 and 6 tied at 1500 each, then 3 at 500
  assert.ok(result.topDomains.length >= 2)
  assert.equal(result.topDomains[0].usdc, 1500)
})

test('top domains limited to 5', () => {
  const domains: Record<string, [number, number]> = {}
  for (let i = 0; i < 8; i++) domains[String(i)] = [1, 100 - i]
  const win = makeWindow({
    bridge: { out: [8, 800, 1.0], in: [0], byDomain: domains },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.topDomains.length, 5)
})

test('missing bridge returns null', () => {
  const win = makeWindow({ bridge: undefined })
  assert.equal(bridgeSummary(win), null)
})

test('bridgeCoverageHours = 0 returns null', () => {
  const win = makeWindow({ bridgeCoverageHours: 0 })
  assert.equal(bridgeSummary(win), null)
})

// Old shape (in.length === 1): inUsdc null, topSources [], netUsdc null, direction by counts
test('old shape: inUsdc null, netUsdc null, topSources empty, direction by counts', () => {
  const win = makeWindow({
    bridge: {
      out: [5, 3000, 6.0],
      in: [2],
      byDomain: { '0': [3, 1500], '6': [2, 1500] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.inUsdc, null)
  assert.equal(result.inFees, null)
  assert.equal(result.netUsdc, null)
  // direction: inCount(2) < outCount(5) → 'out'
  assert.equal(result.netDirection, 'out')
  assert.deepEqual(result.topSources, [])
  assert.equal(result.inAmountsPartial, false)
})

// New shape: exact sums
test('new shape: inUsdc and netUsdc computed correctly', () => {
  // out: [5, 3000, 6], in: [10, 8000, 5], byDomainIn: {6: [7, 6000], 0: [3, 2000]}
  // inUsdc = 8000, inFees = 5, netUsdc = 8000 - 3000 = 5000 (in)
  const win = makeWindow({
    bridge: {
      out: [5, 3000, 6.0],
      in: [10, 8000, 5],
      byDomain: { '0': [3, 1500], '6': [2, 1500] },
      byDomainIn: { '6': [7, 6000], '0': [3, 2000] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.inUsdc, 8000)
  assert.equal(result.inFees, 5)
  assert.equal(result.netUsdc, 5000)      // 8000 - 3000
  assert.equal(result.netDirection, 'in')
  assert.equal(result.topSources.length, 2)
  assert.equal(result.topSources[0].domainId, 6) // Base: 6000 > Ethereum: 2000
  assert.equal(result.topSources[0].usdc, 6000)
  assert.equal(result.topSources[1].domainId, 0)
  assert.equal(result.topSources[1].usdc, 2000)
})

// Net sign: outUsdc > inUsdc → negative → direction 'out'
test('new shape: net is negative when outUsdc > inUsdc', () => {
  // out: [5, 10000, 6], in: [3, 4000, 2]
  // netUsdc = 4000 - 10000 = -6000 → direction 'out'
  const win = makeWindow({
    bridge: {
      out: [5, 10000, 6.0],
      in: [3, 4000, 2],
      byDomain: {},
      byDomainIn: { '0': [3, 4000] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.netUsdc, -6000)
  assert.equal(result.netDirection, 'out')
})

// Net is zero → direction 'flat'
test('new shape: net zero → flat', () => {
  const win = makeWindow({
    bridge: {
      out: [3, 5000, 1],
      in: [3, 5000, 1],
      byDomain: {},
      byDomainIn: { '6': [3, 5000] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.netUsdc, 0)
  assert.equal(result.netDirection, 'flat')
})

// Mixed (in[0]=5, byDomainIn counts total 3) → inAmountsPartial true
test('inAmountsPartial: in count > byDomainIn count sum', () => {
  // in[0]=5, byDomainIn: {6:[3,3000]} → sum=3 < 5 → partial
  const win = makeWindow({
    bridge: {
      out: [2, 1000, 1],
      in: [5, 4000, 2],
      byDomain: {},
      byDomainIn: { '6': [3, 3000] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.inAmountsPartial, true)
})

// When counts match byDomainIn totals → NOT partial
test('inAmountsPartial false when counts match byDomainIn totals', () => {
  // in[0]=3, byDomainIn: {6:[2,2000], 0:[1,1000]} → sum=3 = in[0]
  const win = makeWindow({
    bridge: {
      out: [2, 1000, 1],
      in: [3, 3000, 1],
      byDomain: {},
      byDomainIn: { '6': [2, 2000], '0': [1, 1000] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.inAmountsPartial, false)
})

// '-1' (unknown source) always sorted last regardless of its USDC amount
test("'-1' unknown source always sorted last", () => {
  // domain -1: 50000 usdc, domain 6: 100, domain 0: 200
  // Expected order: domain 0 (200), domain 6 (100), domain -1 (50000 — last)
  const win = makeWindow({
    bridge: {
      out: [1, 100, 0],
      in: [3, 50300, 0],
      byDomain: {},
      byDomainIn: { '-1': [1, 50000], '6': [1, 100], '0': [1, 200] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.topSources.length, 3)
  assert.equal(result.topSources[result.topSources.length - 1].domainId, -1)
  assert.equal(result.topSources[result.topSources.length - 1].name, 'Unknown source')
})

// More than 5 sources → only top 5 returned (unknown last if present)
test('>5 sources → top 5, unknown last', () => {
  // 6 known sources + domain -1; after sort top 5 should be highest by usdc, -1 last
  const byDomainIn: Record<string, [number, number]> = {}
  for (let i = 0; i < 6; i++) {
    byDomainIn[String(i)] = [1, (6 - i) * 1000] // domain 0: 6000, domain 1: 5000, …, domain 5: 1000
  }
  byDomainIn['-1'] = [1, 99999] // huge but must be last
  const totalIn = 7
  const win = makeWindow({
    bridge: {
      out: [1, 100, 0],
      in: [totalIn, 120000, 0],
      byDomain: {},
      byDomainIn,
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.topSources.length, 5)
  // The last of the returned 5 must NOT be -1 (it would've been cut before reaching position 5
  // in a 7-entry list where only top 5 are kept; -1 would rank 7th if sorted last).
  // Actually with 7 entries sorted as: 0(6000),1(5000),2(4000),3(3000),4(2000),5(1000),-1(last)
  // top 5 = domains 0,1,2,3,4
  assert.equal(result.topSources[0].domainId, 0)
  assert.equal(result.topSources[0].usdc, 6000)
  assert.equal(result.topSources[4].domainId, 4)
  // -1 not in the result at all
  assert.equal(result.topSources.find(s => s.domainId === -1), undefined)
  // inCountWithAmounts counts ALL 7 byDomainIn entries (6 known + 1 unknown)
  assert.equal(result.inCountWithAmounts, 7)
})

// New-shape complete (in[0] === sum of byDomainIn counts) → net = in − out
test('complete new shape: net = inUsdc − outUsdc, netUsdc non-null', () => {
  // in[0]=5, byDomainIn counts sum to 5 → NOT partial
  // inUsdc=7000, outUsdc=4000 → netUsdc=3000, direction 'in'
  const win = makeWindow({
    bridge: {
      out: [3, 4000, 2],
      in: [5, 7000, 3],
      byDomain: {},
      byDomainIn: { '6': [3, 5000], '0': [2, 2000] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.inAmountsPartial, false)
  assert.equal(result.inCountWithAmounts, 5)
  assert.equal(result.netUsdc, 3000)   // 7000 - 4000
  assert.equal(result.netDirection, 'in')
})

// Partial → netUsdc null; direction uses count fallback
test('partial: netUsdc null, netDirection from counts', () => {
  // in[0]=10, byDomainIn sum=4 → partial
  // inUsdc=6000 (understated), outUsdc=2000 — net must be null (would show false surplus)
  // count: inCount(10) > outCount(3) → direction 'in' from counts
  const win = makeWindow({
    bridge: {
      out: [3, 2000, 1],
      in: [10, 6000, 2],
      byDomain: {},
      byDomainIn: { '6': [2, 4000], '0': [2, 2000] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.inAmountsPartial, true)
  assert.equal(result.netUsdc, null)
  assert.equal(result.netDirection, 'in')  // count fallback: 10 > 3
})

// Partial where count fallback says 'out' (inCount < outCount despite positive inUsdc)
test('partial: netUsdc null, count fallback gives out', () => {
  // in[0]=2, byDomainIn sum=1 → partial
  // inUsdc=9999 (understated), outUsdc=100 — must not use amounts → direction by counts
  // count: inCount(2) < outCount(5) → 'out'
  const win = makeWindow({
    bridge: {
      out: [5, 100, 0],
      in: [2, 9999, 0],
      byDomain: {},
      byDomainIn: { '6': [1, 9999] },
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.inAmountsPartial, true)
  assert.equal(result.netUsdc, null)
  assert.equal(result.netDirection, 'out')  // count fallback: 2 < 5
})

// All-old-hours-after-update: { in:[4,0,0], byDomainIn:{} } → inUsdc 0, partial true, netUsdc null
test('all-old-hours after indexer update: in[0]=4,in[1]=0,byDomainIn={} → inUsdc 0, partial, netUsdc null', () => {
  // The indexer initialises in as [0,0,0] and adds 0 for hours before new fields existed.
  // After the update every window has in.length===3 even when all hours are old.
  // in[0]=4 (4 arrivals counted), in[1]=0 (no usdc recorded — old hours), byDomainIn={}
  // → byDomainIn sum = 0 < inCount(4) → partial
  // → inUsdc = 0 (as-recorded, labelled partial)
  // → netUsdc must be null
  const win = makeWindow({
    bridge: {
      out: [2, 1500, 1],
      in: [4, 0, 0],
      byDomain: { '6': [2, 1500] },
      byDomainIn: {},
    },
    bridgeCoverageHours: 1,
  })
  const result = bridgeSummary(win)
  assert.ok(result !== null)
  assert.equal(result.inUsdc, 0)
  assert.equal(result.inAmountsPartial, true)
  assert.equal(result.netUsdc, null)
  assert.equal(result.inCountWithAmounts, 0)
})

// ── supplyChange ──────────────────────────────────────────────────────────────
console.log('\nsupplyChange')

test('single point: change = 0, minted/burned from point', () => {
  const s: SupplyJson = {
    generatedAt: '2026-10-11T19:00:00Z',
    network: 'mainnet',
    tokens: {
      usdc: { supply: 100_000, series: [{ hour: '2026-10-11T00', supply: 100_000, mint: 500, burn: 200 }] },
      eurc: { supply: 1_000, series: [] },
    },
  }
  const result = supplyChange(s, 'usdc', 24)
  assert.ok(result !== null)
  assert.equal(result.supply, 100_000)
  assert.equal(result.change, 0)
  assert.equal(result.minted, 500)
  assert.equal(result.burned, 200)
  assert.equal(result.pointsUsed, 1)
})

test('many points: change uses oldest in slice, minted/burned sum', () => {
  const result = supplyChange(minimalSupply, 'usdc', 24)
  assert.ok(result !== null)
  assert.equal(result.supply, 100_000)
  assert.equal(result.change, 10_000) // 100k - 90k
  assert.equal(result.minted, 35_000)  // 15k + 20k
  assert.equal(result.burned, 15_000)  // 5k + 10k
  assert.equal(result.pointsUsed, 2)
})

test('hours limits to last N points', () => {
  const result = supplyChange(minimalSupply, 'usdc', 1)
  assert.ok(result !== null)
  assert.equal(result.pointsUsed, 1)
  assert.equal(result.change, 0) // only one point, supply = supply
  assert.equal(result.minted, 20_000)
})

test('null supplyJson returns null', () => {
  assert.equal(supplyChange(null, 'usdc', 24), null)
})

test('missing token returns null', () => {
  // eurc has no series points
  const s: SupplyJson = {
    generatedAt: '2026-10-11T19:00:00Z',
    network: 'mainnet',
    tokens: {
      usdc: { supply: 100, series: [] },
      eurc: { supply: 0, series: [] },
    },
  }
  assert.equal(supplyChange(s, 'eurc', 24), null)
})

// ── parseSupply ───────────────────────────────────────────────────────────────
console.log('\nparseSupply')

test('parses valid supply JSON', () => {
  const raw = {
    generatedAt: '2026-10-11T19:50:56.684Z',
    network: 'mainnet',
    tokens: {
      usdc: { supply: 509735744.306943, series: [{ hour: '2026-10-11T19', supply: 509735744.306943, mint: 129232.73, burn: 503881.68 }] },
      eurc: { supply: 4915495.801729, series: [{ hour: '2026-10-11T19', supply: 4915495.801729 }] },
    },
  }
  const result = parseSupply(raw)
  assert.ok(result !== null)
  assert.equal(result.tokens.usdc.supply, 509735744.306943)
  assert.equal(result.tokens.usdc.series[0].mint, 129232.73)
  assert.equal(result.tokens.eurc.supply, 4915495.801729)
})

test('returns null for null', () => {
  assert.equal(parseSupply(null), null)
})

test('returns null for non-object', () => {
  assert.equal(parseSupply('hello'), null)
})

test('returns null for missing generatedAt', () => {
  assert.equal(parseSupply({ network: 'mainnet', tokens: { usdc: { supply: 1, series: [] }, eurc: { supply: 1, series: [] } } }), null)
})

test('returns null for missing tokens', () => {
  assert.equal(parseSupply({ generatedAt: '2026-10-11T19:00:00Z', network: 'mainnet' }), null)
})

// ── parseBridge ───────────────────────────────────────────────────────────────
console.log('\nparseBridge')

test('parses valid bridge JSON', () => {
  const result = parseBridge(minimalBridge)
  assert.ok(result !== null)
  assert.equal(result.windows['24h'].out[1], 3000)
  assert.equal(result.windows['24h'].in[0], 2)
  assert.equal(result.series.length, 2)
})

test('returns null for null', () => {
  assert.equal(parseBridge(null), null)
})

test('returns null for missing generatedAt', () => {
  assert.equal(parseBridge({ network: 'mainnet', windows: {}, series: [] }), null)
})

test('returns null for malformed window (bad out array)', () => {
  const bad = {
    ...minimalBridge,
    windows: {
      '1h': { out: [1, 'bad', 0], in: [0], byDomain: {} },
      '24h': minimalBridge.windows['24h'],
      '7d': minimalBridge.windows['7d'],
    },
  }
  assert.equal(parseBridge(bad), null)
})

test('byDomain entries with bad values are skipped gracefully', () => {
  const raw = {
    generatedAt: '2026-10-11T19:00:00Z',
    network: 'mainnet',
    windows: {
      '1h': { out: [0, 0, 0], in: [0], byDomain: {} },
      '24h': { out: [0, 0, 0], in: [0], byDomain: { '0': [1, 100], 'bad': ['x', 'y'] } },
      '7d': { out: [0, 0, 0], in: [0], byDomain: {} },
    },
    series: [],
  }
  const result = parseBridge(raw)
  assert.ok(result !== null)
  assert.ok('0' in result.windows['24h'].byDomain)
  assert.ok(!('bad' in result.windows['24h'].byDomain))
})

// ── parseLatest integration: new window fields survive the full parse path ────
console.log('\nparseLatest integration (activityMix end-to-end)')

/**
 * Load the real sample when available; fall back to a minimal inline fixture
 * that has the same shape (all new optional fields present on the 24h window).
 */
function loadLatestJson(): unknown {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const samplePath = join(__dirname, '../../context/samples/mainnet-latest.json')
    return JSON.parse(readFileSync(samplePath, 'utf8'))
  } catch {
    // Inline minimal fixture with the same shape as the real sample.
    return {
      network: 'mainnet',
      generatedAt: new Date().toISOString(),
      windows: {
        '1h': {
          hours: 1, blocks: 6004, txs: 29603, failed: 563, fees: 84.2939, walletHours: 2631, top: [],
          auto: { senders: 4, tx: 2217 }, autoCoverageHours: 1,
          aa: 36, aaTx: 36,
          buckets: [[518, 3067.96], [31, 53376.83], [2, 630151.67]], bucketsCoverageHours: 1,
          mb: { usdc: [129232.73, 503881.68] }, mbCoverageHours: 1,
          bridge: { out: [0, 0, 0], in: [2], byDomain: {} }, bridgeCoverageHours: 1,
        },
        '24h': {
          hours: 24, blocks: 169217, txs: 764090, failed: 9470, fees: 3221.0519, walletHours: 53693, top: [],
          auto: { senders: 4, tx: 2217 }, autoCoverageHours: 1,
          aa: 36, aaTx: 36,
          buckets: [[518, 3067.96], [31, 53376.83], [2, 630151.67]], bucketsCoverageHours: 1,
          mb: { usdc: [129232.73, 503881.68] }, mbCoverageHours: 1,
          bridge: { out: [0, 0, 0], in: [2], byDomain: {} }, bridgeCoverageHours: 1,
        },
        '7d': {
          hours: 168, blocks: 483761, txs: 2319093, failed: 32293, fees: 8526.7017, walletHours: 203526, top: [],
          auto: { senders: 4, tx: 2217 }, autoCoverageHours: 1,
          aa: 36, aaTx: 36,
          buckets: [[518, 3067.96], [31, 53376.83], [2, 630151.67]], bucketsCoverageHours: 1,
          mb: { usdc: [129232.73, 503881.68] }, mbCoverageHours: 1,
          bridge: { out: [0, 0, 0], in: [2], byDomain: {} }, bridgeCoverageHours: 1,
        },
      },
      series: [
        { hour: '2026-10-11T18', txs: 34120, failed: 576, fees: 100.921736, wallets: 2762, blocks: 7095 },
        { hour: '2026-10-11T19', txs: 29603, failed: 563, fees: 84.29391, wallets: 2631, blocks: 6004, aa: 36, aaTx: 36 },
      ],
    }
  }
}

const latestJson = loadLatestJson()

test('parseLatest parses successfully from the sample', () => {
  const snap = parseLatest(latestJson)
  assert.ok(snap !== null, 'parseLatest returned null — sample may be malformed')
})

test('windows["24h"] carries new optional fields after parseLatest', () => {
  const snap = parseLatest(latestJson)
  assert.ok(snap !== null)
  const w = snap.windows['24h'] as unknown as Record<string, unknown>
  assert.ok(w['auto'] !== undefined, 'auto missing from windows["24h"]')
  assert.ok(w['autoCoverageHours'] !== undefined, 'autoCoverageHours missing')
  assert.ok(w['buckets'] !== undefined, 'buckets missing')
  assert.ok(w['bucketsCoverageHours'] !== undefined, 'bucketsCoverageHours missing')
  assert.ok(w['bridge'] !== undefined, 'bridge missing')
  assert.ok(w['bridgeCoverageHours'] !== undefined, 'bridgeCoverageHours missing')
})

test('automatedShare returns non-null result from parseLatest windows["24h"]', () => {
  const snap = parseLatest(latestJson)
  assert.ok(snap !== null)
  const w24 = snap.windows['24h'] as unknown as ExtendedWindow
  const result = automatedShare(w24, snap.series)
  assert.ok(result !== null, 'automatedShare returned null — new fields were not passed through')
  assert.ok(result.senders > 0, `expected senders > 0, got ${result.senders}`)
  assert.ok(result.tx > 0, `expected tx > 0, got ${result.tx}`)
})

test('paymentBuckets returns non-null result from parseLatest windows["24h"]', () => {
  const snap = parseLatest(latestJson)
  assert.ok(snap !== null)
  const w24 = snap.windows['24h'] as unknown as ExtendedWindow
  const result = paymentBuckets(w24)
  assert.ok(result !== null, 'paymentBuckets returned null — buckets field was not passed through')
  assert.equal(result.buckets.length, 3)
})

test('bridgeSummary returns non-null result from parseLatest windows["24h"]', () => {
  const snap = parseLatest(latestJson)
  assert.ok(snap !== null)
  const w24 = snap.windows['24h'] as unknown as ExtendedWindow
  const result = bridgeSummary(w24)
  assert.ok(result !== null, 'bridgeSummary returned null — bridge field was not passed through')
})

test('last series point carries aa and aaTx from parseLatest', () => {
  const snap = parseLatest(latestJson)
  assert.ok(snap !== null)
  // The last series point in the sample has aa:36, aaTx:36
  const last = snap.series[snap.series.length - 1]
  assert.ok(last !== undefined)
  assert.equal(last.aa, 36, `expected series aa=36, got ${last.aa}`)
  assert.equal(last.aaTx, 36, `expected series aaTx=36, got ${last.aaTx}`)
})

// ── summary ───────────────────────────────────────────────────────────────────
console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exit(1)
