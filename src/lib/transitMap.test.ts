/**
 * Tests for src/lib/transitMap.ts
 *
 * Run with:
 *   node --experimental-strip-types src/lib/transitMap.test.ts
 *
 * No test framework — plain node:assert/strict.
 */

import assert from 'node:assert/strict'
import {
  stationRadius,
  trainCount,
  pointAlong,
  clampZoom,
  layoutTransitMap,
  buildTransitLayout,
  placeLabels,
  buildPolyline,
  contentBounds,
  boxesOverlap,
  labelBox,
  labelBoxK,
  labelOffsetK,
  labelSideOrder,
  subLabelBox,
  segmentHitsBox,
  SUB_LABEL_TEXT,
  type LayoutResult,
  type Station,
  type StationInput,
  type LabelBox,
} from './transitMap.ts'

let passed = 0
function test(label: string, fn: () => void): void {
  fn()
  passed++
  // Uncomment for verbose output:
  // console.log(`  ✓ ${label}`)
}

// ─── stationRadius ────────────────────────────────────────────────────────────

test('stationRadius: tx=0 → 4', () => {
  assert.equal(stationRadius(0, 100), 4)
})

test('stationRadius: maxTx=0 → 4', () => {
  assert.equal(stationRadius(50, 0), 4)
})

test('stationRadius: tx=maxTx → 11', () => {
  assert.equal(stationRadius(100, 100), 11)
})

test('stationRadius: tx=maxTx/4 → 7.5 (4 + 7*0.5)', () => {
  // sqrt(0.25) = 0.5  →  4 + 7*0.5 = 7.5
  const r = stationRadius(25, 100)
  assert.ok(Math.abs(r - 7.5) < 1e-9, `expected 7.5 got ${r}`)
})

test('stationRadius: minimum is 4', () => {
  assert.ok(stationRadius(1, 1e12) >= 4)
})

test('stationRadius: maximum is 11', () => {
  assert.ok(stationRadius(1e9, 1e9) <= 11)
})

test('stationRadius: monotone — higher tx → larger or equal radius', () => {
  const maxTx = 1000
  let prev = stationRadius(0, maxTx)
  for (const tx of [1, 10, 50, 100, 250, 500, 750, 1000]) {
    const r = stationRadius(tx, maxTx)
    assert.ok(r >= prev, `non-monotone at tx=${tx}: ${r} < ${prev}`)
    prev = r
  }
})

test('stationRadius: hollow marker (tx=0) → 4', () => {
  // Hollow stations always show as the minimum dot
  assert.equal(stationRadius(0, 500), 4)
})

// ─── trainCount ───────────────────────────────────────────────────────────────

test('trainCount: 0 transactions → 0', () => {
  // log10(0+1)=0, round(0)=0
  assert.equal(trainCount(0), 0)
})

test('trainCount: 9 transactions → 1', () => {
  // log10(9+1)=log10(10)=1, round(1)=1
  assert.equal(trainCount(9), 1)
})

test('trainCount: 10 transactions → 1', () => {
  // log10(10+1)≈1.041, round=1
  assert.equal(trainCount(10), 1)
})

test('trainCount: 99999 transactions → 5 → clamped to 4', () => {
  // log10(99999+1)=log10(100000)=5, round(5)=5, clamp → 4
  assert.equal(trainCount(99999), 4)
})

test('trainCount: 1e9 → clamped to 4', () => {
  // log10(1e9+1)≈9.00, round=9, clamp → 4
  assert.equal(trainCount(1e9), 4)
})

test('trainCount: negative → 0', () => {
  assert.equal(trainCount(-1), 0)
})

// ─── pointAlong ───────────────────────────────────────────────────────────────

// L-shaped polyline: (0,0) → (100,0) → (100,100)
// Total arc length = 200.
const L: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
]

test('pointAlong: t=0 → first point (0,0)', () => {
  const p = pointAlong(L, 0)
  assert.equal(p.x, 0)
  assert.equal(p.y, 0)
})

test('pointAlong: t=1 → last point (100,100)', () => {
  const p = pointAlong(L, 1)
  assert.equal(p.x, 100)
  assert.equal(p.y, 100)
})

test('pointAlong: t=0.5 → (100,0) midpoint of arc', () => {
  const p = pointAlong(L, 0.5)
  assert.ok(Math.abs(p.x - 100) < 1e-9, `x=${p.x}`)
  assert.ok(Math.abs(p.y - 0) < 1e-9, `y=${p.y}`)
})

test('pointAlong: t=0.25 → (50,0)', () => {
  const p = pointAlong(L, 0.25)
  assert.ok(Math.abs(p.x - 50) < 1e-9, `x=${p.x}`)
  assert.ok(Math.abs(p.y - 0) < 1e-9, `y=${p.y}`)
})

test('pointAlong: t=0.75 → (100,50)', () => {
  const p = pointAlong(L, 0.75)
  assert.ok(Math.abs(p.x - 100) < 1e-9, `x=${p.x}`)
  assert.ok(Math.abs(p.y - 50) < 1e-9, `y=${p.y}`)
})

test('pointAlong: t<0 → clamp to first point', () => {
  const p = pointAlong(L, -5)
  assert.equal(p.x, 0)
  assert.equal(p.y, 0)
})

test('pointAlong: t>1 → clamp to last point', () => {
  const p = pointAlong(L, 99)
  assert.equal(p.x, 100)
  assert.equal(p.y, 100)
})

test('pointAlong: empty array → {0,0}', () => {
  const p = pointAlong([], 0.5)
  assert.equal(p.x, 0)
  assert.equal(p.y, 0)
})

test('pointAlong: single point → that point', () => {
  const p = pointAlong([{ x: 7, y: 3 }], 0.5)
  assert.equal(p.x, 7)
  assert.equal(p.y, 3)
})

// ─── clampZoom ───────────────────────────────────────────────────────────────

test('clampZoom: within range passthrough', () => {
  assert.equal(clampZoom(1.5), 1.5)
})

test('clampZoom: below min → 0.6', () => {
  assert.equal(clampZoom(0), 0.6)
  assert.equal(clampZoom(-5), 0.6)
  assert.equal(clampZoom(0.1), 0.6)
})

test('clampZoom: above max → 3', () => {
  assert.equal(clampZoom(10), 3)
  assert.equal(clampZoom(3.1), 3)
})

test('clampZoom: exact boundaries', () => {
  assert.equal(clampZoom(0.6), 0.6)
  assert.equal(clampZoom(3), 3)
})

// ─── boxesOverlap ─────────────────────────────────────────────────────────────

test('boxesOverlap: clearly overlapping boxes', () => {
  const a: LabelBox = { x: 0, y: 0, w: 10, h: 10 }
  const b: LabelBox = { x: 5, y: 5, w: 10, h: 10 }
  assert.ok(boxesOverlap(a, b))
})

test('boxesOverlap: touching edges do NOT overlap', () => {
  const a: LabelBox = { x: 0, y: 0, w: 10, h: 10 }
  const b: LabelBox = { x: 10, y: 0, w: 10, h: 10 }
  assert.ok(!boxesOverlap(a, b))
})

test('boxesOverlap: completely separate', () => {
  const a: LabelBox = { x: 0, y: 0, w: 5, h: 5 }
  const b: LabelBox = { x: 20, y: 20, w: 5, h: 5 }
  assert.ok(!boxesOverlap(a, b))
})

test('boxesOverlap: one inside other', () => {
  const outer: LabelBox = { x: 0, y: 0, w: 100, h: 100 }
  const inner: LabelBox = { x: 20, y: 20, w: 10, h: 10 }
  assert.ok(boxesOverlap(outer, inner))
})

test('boxesOverlap: symmetric', () => {
  const a: LabelBox = { x: 0, y: 0, w: 10, h: 10 }
  const b: LabelBox = { x: 8, y: 8, w: 10, h: 10 }
  assert.ok(boxesOverlap(a, b))
  assert.ok(boxesOverlap(b, a))
})

// ─── labelBox ────────────────────────────────────────────────────────────────

test('labelBox: right side — x starts at station.x + 14', () => {
  const s = { x: 100, y: 50, name: 'Hi', labelSide: 'right' as const }
  const b = labelBox(s)
  // w = 6.2*2 + 8 = 20.4, h=14
  assert.ok(Math.abs(b.x - 114) < 1e-9, `x=${b.x}`)
  assert.ok(Math.abs(b.y - (50 - 7)) < 1e-9, `y=${b.y}`)
  assert.ok(Math.abs(b.w - (6.2 * 2 + 8)) < 1e-9, `w=${b.w}`)
  assert.equal(b.h, 14)
})

test('labelBox: left side — x ends at station.x - 14', () => {
  const s = { x: 100, y: 50, name: 'Hi', labelSide: 'left' as const }
  const b = labelBox(s)
  const w = 6.2 * 2 + 8
  assert.ok(Math.abs(b.x - (100 - 14 - w)) < 1e-9, `x=${b.x}`)
})

test('labelBox: above side — y top = station.y - 14 - 14', () => {
  const s = { x: 100, y: 50, name: 'Hi', labelSide: 'above' as const }
  const b = labelBox(s)
  assert.ok(Math.abs(b.y - (50 - 14 - 14)) < 1e-9, `y=${b.y}`)
  assert.equal(b.h, 14)
})

test('labelBox: below side — y top = station.y + 14', () => {
  const s = { x: 100, y: 50, name: 'Hi', labelSide: 'below' as const }
  const b = labelBox(s)
  assert.ok(Math.abs(b.y - 64) < 1e-9, `y=${b.y}`)
  assert.equal(b.h, 14)
})

// ─── layoutTransitMap — basic correctness ────────────────────────────────────

const SMALL_INPUT: { key: string; dashed?: boolean; stations: StationInput[] }[] = [
  {
    key: 'DeFi',
    stations: [
      { id: 'a', name: 'Alpha', line: 'DeFi', tx: 100, wallets: 10 },
      { id: 'b', name: 'Beta', line: 'DeFi', tx: 50, wallets: 5 },
      { id: 'c', name: 'Gamma', line: 'DeFi', tx: 0, wallets: 0 },
    ],
  },
  {
    key: 'RWA',
    stations: [
      { id: 'd', name: 'Delta', line: 'RWA', tx: 200, wallets: 20 },
    ],
  },
]

const SMALL_RESULT = layoutTransitMap(SMALL_INPUT, { width: 800, height: 500 })

test('layoutTransitMap: hub is approximately center', () => {
  assert.equal(SMALL_RESULT.hub.x, 400)
  assert.equal(SMALL_RESULT.hub.y, 250)
})

test('layoutTransitMap: correct number of lines', () => {
  assert.equal(SMALL_RESULT.lines.length, 2)
})

test('layoutTransitMap: stations sorted tx desc', () => {
  const defi = SMALL_RESULT.lines.find(l => l.key === 'DeFi')!
  assert.ok(defi.stations[0].tx >= defi.stations[1].tx)
  assert.ok(defi.stations[1].tx >= defi.stations[2].tx)
})

test('layoutTransitMap: tx=0 station is hollow', () => {
  const defi = SMALL_RESULT.lines.find(l => l.key === 'DeFi')!
  const zeroSt = defi.stations.find(s => s.tx === 0)!
  assert.equal(zeroSt.hollow, true)
})

test('layoutTransitMap: tx=0 station has radius 4', () => {
  const defi = SMALL_RESULT.lines.find(l => l.key === 'DeFi')!
  const zeroSt = defi.stations.find(s => s.tx === 0)!
  assert.equal(zeroSt.r, 4)
})

test('layoutTransitMap: dashed flag preserved', () => {
  const dashedInput = [
    { key: 'Portal', dashed: true, stations: [{ id: 'x', name: 'X', line: 'Portal', tx: 0, wallets: 0 }] },
  ]
  const r = layoutTransitMap(dashedInput, { width: 800, height: 500 })
  assert.equal(r.lines[0].dashed, true)
})

test('layoutTransitMap: non-dashed flag preserved', () => {
  assert.equal(SMALL_RESULT.lines[0].dashed, false)
})

test('layoutTransitMap: empty line omitted', () => {
  const withEmpty = [
    ...SMALL_INPUT,
    { key: 'Empty', stations: [] as StationInput[] },
  ]
  const r = layoutTransitMap(withEmpty, { width: 800, height: 500 })
  assert.equal(r.lines.length, 2)
  assert.ok(!r.lines.some(l => l.key === 'Empty'))
})

test('layoutTransitMap: deterministic (two runs deepEqual)', () => {
  const r1 = layoutTransitMap(SMALL_INPUT, { width: 800, height: 500 })
  const r2 = layoutTransitMap(SMALL_INPUT, { width: 800, height: 500 })
  assert.deepEqual(r1, r2)
})

test('layoutTransitMap: totalTx correct', () => {
  const defi = SMALL_RESULT.lines.find(l => l.key === 'DeFi')!
  assert.equal(defi.totalTx, 150)
})

// ─── All stations in bounds (crowded input) ───────────────────────────────────

function makeStations(lineKey: string, count: number, baseTx: number): StationInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${lineKey}-${i}`,
    name: `${lineKey} Station ${i}`,
    line: lineKey,
    tx: baseTx - i * 5,
    wallets: i,
  }))
}

const CROWDED_INPUT = [
  { key: 'Stablecoin', stations: makeStations('Stablecoin', 12, 1000) },
  { key: 'DeFi',       stations: makeStations('DeFi',       12, 800)  },
  { key: 'RWA',        stations: makeStations('RWA',        12, 600)  },
  { key: 'Payments',   stations: makeStations('Payments',   12, 400)  },
  { key: 'Agents',     stations: makeStations('Agents',     12, 200)  },
  { key: 'Infra',      stations: makeStations('Infra',      12, 100)  },
]

const CROWDED_RESULT = layoutTransitMap(CROWDED_INPUT, { width: 1200, height: 750 })

test('layoutTransitMap: all stations in bounds (6×12 crowded)', () => {
  for (const line of CROWDED_RESULT.lines) {
    for (const s of line.stations) {
      assert.ok(s.x >= 40 && s.x <= 1200 - 40, `${s.id} x=${s.x} out of bounds`)
      assert.ok(s.y >= 40 && s.y <= 750 - 40, `${s.id} y=${s.y} out of bounds`)
    }
  }
})

test('layoutTransitMap: hub in bounds for crowded input', () => {
  assert.ok(CROWDED_RESULT.hub.x >= 40 && CROWDED_RESULT.hub.x <= 1160)
  assert.ok(CROWDED_RESULT.hub.y >= 40 && CROWDED_RESULT.hub.y <= 710)
})

test('layoutTransitMap: all 6 lines present for crowded input', () => {
  assert.equal(CROWDED_RESULT.lines.length, 6)
})

test('layoutTransitMap: inter-line min distance ≥ 24 (crowded 6×12)', () => {
  type SP = { lineKey: string; x: number; y: number }
  const all: SP[] = []
  for (const line of CROWDED_RESULT.lines) {
    for (const s of line.stations) {
      all.push({ lineKey: line.key, x: s.x, y: s.y })
    }
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].lineKey === all[j].lineKey) continue
      const dist = Math.sqrt((all[i].x - all[j].x) ** 2 + (all[i].y - all[j].y) ** 2)
      assert.ok(dist >= 24, `stations ${all[i].lineKey} and ${all[j].lineKey} are ${dist.toFixed(1)} apart`)
    }
  }
})

test('layoutTransitMap: exact spacing test — straight line, 3 stations', () => {
  const input = [
    {
      key: 'TestLine',
      stations: [
        { id: 's1', name: 'S1', line: 'TestLine', tx: 300, wallets: 1 },
        { id: 's2', name: 'S2', line: 'TestLine', tx: 200, wallets: 1 },
        { id: 's3', name: 'S3', line: 'TestLine', tx: 100, wallets: 1 },
      ],
    },
  ]
  const r = layoutTransitMap(input, { width: 1600, height: 800, spacing: 64 })
  const line = r.lines[0]
  const [s1, s2, s3] = line.stations  // sorted by tx: 300, 200, 100

  const d12 = Math.sqrt((s2.x - s1.x) ** 2 + (s2.y - s1.y) ** 2)
  const d23 = Math.sqrt((s3.x - s2.x) ** 2 + (s3.y - s2.y) ** 2)
  assert.ok(Math.abs(d12 - 64) < 2, `d12=${d12.toFixed(2)} not ~64`)
  assert.ok(Math.abs(d23 - 64) < 2, `d23=${d23.toFixed(2)} not ~64`)
})

test('layoutTransitMap: stations ordered by tx desc then name asc', () => {
  const input = [
    {
      key: 'Ordering',
      stations: [
        { id: 'z', name: 'Zebra', line: 'Ordering', tx: 50, wallets: 0 },
        { id: 'a', name: 'Apple', line: 'Ordering', tx: 50, wallets: 0 },
        { id: 'm', name: 'Mango', line: 'Ordering', tx: 200, wallets: 0 },
      ],
    },
  ]
  const r = layoutTransitMap(input, { width: 800, height: 500 })
  const names = r.lines[0].stations.map(s => s.name)
  assert.equal(names[0], 'Mango')
  assert.equal(names[1], 'Apple')
  assert.equal(names[2], 'Zebra')
})

// ─── A1: stationRadius tx=0 must return 4 ────────────────────────────────────

test('A1: stationRadius(0, 100) === 4 (tx=0 always → minimum radius)', () => {
  assert.equal(stationRadius(0, 100), 4)
})

// ─── A2: stationRadius cap at 11 for tx well above maxTx ─────────────────────

test('A2: stationRadius(400, 100) === 11 (tx above maxTx caps at 11)', () => {
  // sqrt(400/100)=2 → 4+7*2=18, clamped to 11
  assert.equal(stationRadius(400, 100), 11)
})

// ─── A3: trainCount boundary at floor(log10(n+1)) values ─────────────────────

test('A3: trainCount(4) === 1 (log10(5)≈0.699, round→1)', () => {
  assert.equal(trainCount(4), 1)
})

test('A3: trainCount(2) === 0 (log10(3)≈0.477, round→0)', () => {
  assert.equal(trainCount(2), 0)
})

// ─── A4: pointAlong t=-0.5 returns FIRST point (no extrapolation) ────────────

test('A4: pointAlong(L, -0.5) deepEquals first point exactly', () => {
  const p = pointAlong(L, -0.5)
  assert.deepEqual(p, { x: 0, y: 0 })
})

// ─── A5: MIN_SPACING=36 enforced ─────────────────────────────────────────────

test('A5: 30-station line on wide canvas with spacing:36 — every consecutive pair ≥ 35.5 apart', () => {
  const bigLine = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, name: `S${i}`, line: 'L', tx: 100 - i, wallets: 1,
  }))
  const r = layoutTransitMap([{ key: 'L', stations: bigLine }], { width: 2500, height: 750, spacing: 36 })
  const sts = r.lines[0].stations
  for (let i = 1; i < sts.length; i++) {
    const d = Math.sqrt((sts[i].x - sts[i-1].x)**2 + (sts[i].y - sts[i-1].y)**2)
    assert.ok(d >= 36 - 0.5, `pair ${i-1}→${i}: distance ${d.toFixed(2)} < 35.5`)
  }
})

test('A5: layoutTransitMap({spacing:10}) clamps to MIN_SPACING — stations ≥ 35.5 apart', () => {
  const bigLine = Array.from({ length: 5 }, (_, i) => ({
    id: `s${i}`, name: `S${i}`, line: 'L', tx: 100 - i, wallets: 1,
  }))
  const r = layoutTransitMap([{ key: 'L', stations: bigLine }], { width: 800, height: 500, spacing: 10 })
  const sts = r.lines[0].stations
  for (let i = 1; i < sts.length; i++) {
    const d = Math.sqrt((sts[i].x - sts[i-1].x)**2 + (sts[i].y - sts[i-1].y)**2)
    assert.ok(d >= 36 - 0.5, `pair ${i-1}→${i}: distance ${d.toFixed(2)} < 35.5 with spacing:10`)
  }
})

// ─── A6: inter-line distance ≥ 24 ────────────────────────────────────────────

test('A6: inter-line min distance ≥ 24 (6×12 crowded, 1200×750)', () => {
  type SP = { lineKey: string; x: number; y: number }
  const all: SP[] = []
  for (const line of CROWDED_RESULT.lines) {
    for (const s of line.stations) {
      all.push({ lineKey: line.key, x: s.x, y: s.y })
    }
  }
  let failures = 0
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].lineKey === all[j].lineKey) continue
      const dist = Math.sqrt((all[i].x - all[j].x)**2 + (all[i].y - all[j].y)**2)
      if (dist < 24) {
        failures++
        console.error(`FAIL: ${all[i].lineKey} & ${all[j].lineKey} dist=${dist.toFixed(2)} < 24`)
      }
    }
  }
  assert.equal(failures, 0, `${failures} inter-line pairs closer than 24px`)
})

// ─── A7: bend vertex sits at floor(n/2) stations from hub ────────────────────

test('A7: bend vertex after floor(n/2) stations (3-point polyline, angle=270)', () => {
  const hx = 300, hy = 500
  const pts = buildPolyline(hx, hy, 270, 5, 100, 600, 1000)
  assert.equal(pts.length, 3, `expected 3-point polyline (bend), got ${pts.length} points`)
  const bv = pts[1]
  assert.ok(Math.abs(bv.x - 300) < 0.01, `bend x: expected 300, got ${bv.x}`)
  assert.ok(Math.abs(bv.y - 700) < 0.01, `bend y: expected 700, got ${bv.y}`)
})

// ─── contentBounds ────────────────────────────────────────────────────────────

test('contentBounds: hub included (hub.x - 36 - pad ≤ x)', () => {
  const input = [{
    key: 'Test',
    stations: [
      { id: 'a', name: 'Alpha', line: 'Test', tx: 100, wallets: 0 },
      { id: 'b', name: 'Beta',  line: 'Test', tx:  50, wallets: 0 },
    ],
  }]
  const layout = layoutTransitMap(input, { width: 800, height: 500 })
  const b = contentBounds(layout, 48)
  assert.ok(b.x <= 400 - 36 - 48, `bounds.x (${b.x}) should be ≤ hub.x - 36 - pad`)
  assert.ok(b.y <= 250 - 36 - 48, `bounds.y (${b.y}) should be ≤ hub.y - 36 - pad`)
  assert.ok(b.x + b.width  >= 400 + 36 + 48, `bounds right should cover hub right`)
  assert.ok(b.y + b.height >= 250 + 36 + 48, `bounds bottom should cover hub bottom`)
})

test('contentBounds: stations included in bounds', () => {
  const input = [{
    key: 'Test',
    stations: [
      { id: 'a', name: 'Alpha', line: 'Test', tx: 100, wallets: 0 },
      { id: 'b', name: 'Beta',  line: 'Test', tx:  50, wallets: 0 },
    ],
  }]
  const layout = layoutTransitMap(input, { width: 800, height: 500 })
  const b = contentBounds(layout, 0)
  for (const line of layout.lines) {
    for (const s of line.stations) {
      assert.ok(b.x <= s.x - s.r, `station ${s.id} left edge out of bounds: b.x=${b.x}, s.x-r=${s.x - s.r}`)
      assert.ok(b.x + b.width >= s.x + s.r, `station ${s.id} right edge out of bounds`)
      assert.ok(b.y <= s.y - s.r, `station ${s.id} top edge out of bounds`)
      assert.ok(b.y + b.height >= s.y + s.r, `station ${s.id} bottom edge out of bounds`)
    }
  }
})

test('contentBounds: pad 0 gives strictly smaller box than pad 48', () => {
  const input = [{
    key: 'Line',
    stations: [{ id: 'x', name: 'X', line: 'Line', tx: 10, wallets: 0 }],
  }]
  const layout = layoutTransitMap(input, { width: 800, height: 500 })
  const b0  = contentBounds(layout, 0)
  const b48 = contentBounds(layout, 48)
  assert.ok(b48.x < b0.x,          'pad=48 should extend left')
  assert.ok(b48.y < b0.y,          'pad=48 should extend up')
  assert.ok(b48.width  > b0.width,  'pad=48 should be wider')
  assert.ok(b48.height > b0.height, 'pad=48 should be taller')
})

test('contentBounds: label box height 14 (label-above pushes top boundary)', () => {
  const input = [{
    key: 'L',
    stations: [{ id: 's', name: 'X', line: 'L', tx: 10, wallets: 0 }],
  }]
  const layout = layoutTransitMap(input, { width: 800, height: 500, spacing: 64 })
  const s = layout.lines[0].stations[0]
  const b0 = contentBounds(layout, 0)
  assert.ok(b0.y <= s.y - s.r, `bounds top must include station circle top`)
  assert.ok(b0.y + b0.height >= s.y + s.r, `bounds bottom must include station circle bottom`)
  const circleOnlyHeight = (s.y + s.r) - Math.max(s.y - s.r, layout.hub.y - 36)
  assert.ok(b0.height > circleOnlyHeight, `label (h=14) must extend bounds beyond circle-only`)
})

test('contentBounds: label box width = 6.2*chars + 8 (right-side label extends right boundary)', () => {
  const s = { x: 100, y: 50, name: 'CircleGateway', labelSide: 'right' as const }
  const b = labelBox(s)
  const expectedW = 6.2 * 'CircleGateway'.length + 8
  assert.ok(Math.abs(b.w - expectedW) < 1e-9, `label w: expected ${expectedW}, got ${b.w}`)
  assert.equal(b.h, 14, `label h must be 14`)
  assert.ok(Math.abs(b.x - (100 + 14)) < 1e-9, `label x: expected ${100 + 14}, got ${b.x}`)
})

// ─── Adaptive spacing ─────────────────────────────────────────────────────────

test('adaptive spacing: 2-station 800×500 layout uses spacing ~83, not 64', () => {
  const input = [{
    key: 'L',
    stations: [
      { id: 's1', name: 'S1', line: 'L', tx: 100, wallets: 0 },
      { id: 's2', name: 'S2', line: 'L', tx:  50, wallets: 0 },
    ],
  }]
  const r = layoutTransitMap(input, { width: 800, height: 500 })
  const [s1, s2] = r.lines[0].stations
  const d = Math.sqrt((s2.x - s1.x) ** 2 + (s2.y - s1.y) ** 2)
  assert.ok(d > 70, `expected spacing ~83, got ${d.toFixed(1)}`)
  assert.ok(d <= 120, `spacing should not exceed 120, got ${d.toFixed(1)}`)
})

test('adaptive spacing: opts.spacing overrides adaptive (spacing=36 used)', () => {
  const input = [{
    key: 'L',
    stations: [
      { id: 's1', name: 'S1', line: 'L', tx: 100, wallets: 0 },
      { id: 's2', name: 'S2', line: 'L', tx:  50, wallets: 0 },
    ],
  }]
  const r = layoutTransitMap(input, { width: 800, height: 500, spacing: 36 })
  const [s1, s2] = r.lines[0].stations
  const d = Math.sqrt((s2.x - s1.x) ** 2 + (s2.y - s1.y) ** 2)
  assert.ok(Math.abs(d - 36) < 2, `expected spacing ~36, got ${d.toFixed(1)}`)
})

test('adaptive spacing: capped at 120 for very small layouts', () => {
  const input = [{
    key: 'L',
    stations: [{ id: 's1', name: 'S1', line: 'L', tx: 100, wallets: 0 }],
  }]
  const r = layoutTransitMap(input, { width: 800, height: 500 })
  const s = r.lines[0].stations[0]
  assert.ok(s.x >= 40 && s.x <= 760, 'station in bounds')
})

test('spacing cap 120: single-station line gets spacing exactly 120', () => {
  const input = [{
    key: 'L',
    stations: [{ id: 's1', name: 'S1', line: 'L', tx: 100, wallets: 0 }],
  }]
  const r = layoutTransitMap(input, { width: 800, height: 500 })
  const s = r.lines[0].stations[0]
  assert.ok(Math.abs(s.x - 580) < 2, `spacing not capped at 120: station x=${s.x.toFixed(1)}, expected ~580`)
  assert.ok(Math.abs(s.y - 250) < 2, `y=${s.y.toFixed(1)} should be ~250`)
})

// ─── M2: portal id prefix dedup ──────────────────────────────────────────────

test('M2: tracked station id does not start with "portal:"', () => {
  const trackedId = 'uniswap'
  const trackedStations = [{ id: trackedId, name: 'Uniswap', line: 'DeFi', tx: 26000, wallets: 100 }]
  const portalKeys = ['uniswap', 'aave']

  const trackedSet = new Set(trackedStations.map(s => s.id.toLowerCase()))
  const portalStations = portalKeys
    .filter(k => !trackedSet.has(k.toLowerCase()))
    .map(k => ({ id: `portal:${k}`, name: k, line: 'Portal', tx: 0, wallets: 0, hollow: true }))

  assert.ok(!trackedStations[0].id.startsWith('portal:'), 'tracked station must not have portal: prefix')
  assert.equal(portalStations.length, 1, 'only non-tracked portal apps make it through')
  assert.equal(portalStations[0].id, 'portal:aave')
})

// ─── 19-station mainnet-like layout ──────────────────────────────────────────
//
// Input lines (7 non-portal + 1 portal = 8 input lines):
//   Stablecoin: USDC(133600), EURC(13800)                          2 stations
//   DeFi:       Uniswap(26000), cirBTC(25800), WETH(18300)         3 stations
//   RWA:        USYC(0)                                            1 station
//   Payments:   StableFX(337), Arc Memo(18)                        2 stations
//   Agents:     ERC-8004 Identity(9)                               1 station
//   Infra:      Circle Gateway(804), Across(362), CCTP v2(154),
//               Multicall3From(98)                                  4 stations
//   Portal(dashed): Aave, Aerodrome, Hibachi, Maple, Morpho,
//               Stargate                                           6 stations
// Total: 13 tracked + 6 portal = 19 stations.
// Canvas: 1200×750.

const MAINNET_INPUT = [
  {
    key: 'Stablecoin',
    stations: [
      { id: 'usdc',   name: 'USDC',          line: 'Stablecoin', tx: 133600, wallets: 0 },
      { id: 'eurc',   name: 'EURC',          line: 'Stablecoin', tx: 13800,  wallets: 0 },
    ],
  },
  {
    key: 'DeFi',
    stations: [
      { id: 'uniswap', name: 'Uniswap',      line: 'DeFi',       tx: 26000,  wallets: 0 },
      { id: 'cirbtc',  name: 'cirBTC',        line: 'DeFi',       tx: 25800,  wallets: 0 },
      { id: 'weth',    name: 'WETH',          line: 'DeFi',       tx: 18300,  wallets: 0 },
    ],
  },
  {
    key: 'RWA',
    stations: [
      { id: 'usyc',    name: 'USYC',          line: 'RWA',        tx: 0,      wallets: 0 },
    ],
  },
  {
    key: 'Payments',
    stations: [
      { id: 'stablefx', name: 'StableFX',    line: 'Payments',   tx: 337,    wallets: 0 },
      { id: 'arcmemo',  name: 'Arc Memo',    line: 'Payments',   tx: 18,     wallets: 0 },
    ],
  },
  {
    key: 'Agents',
    stations: [
      { id: 'erc8004',  name: 'ERC-8004 Identity', line: 'Agents', tx: 9,   wallets: 0 },
    ],
  },
  {
    key: 'Infra',
    stations: [
      { id: 'cgateway', name: 'Circle Gateway', line: 'Infra',   tx: 804,    wallets: 0 },
      { id: 'across',   name: 'Across',        line: 'Infra',    tx: 362,    wallets: 0 },
      { id: 'cctpv2',   name: 'CCTP v2',       line: 'Infra',    tx: 154,    wallets: 0 },
      { id: 'mc3',      name: 'Multicall3From', line: 'Infra',   tx: 98,     wallets: 0 },
    ],
  },
  {
    key: 'Portal',
    dashed: true,
    stations: [
      { id: 'portal:aave',      name: 'Aave',       line: 'Portal', tx: 0, wallets: 0, hollow: true },
      { id: 'portal:aerodrome', name: 'Aerodrome',   line: 'Portal', tx: 0, wallets: 0, hollow: true },
      { id: 'portal:hibachi',   name: 'Hibachi',     line: 'Portal', tx: 0, wallets: 0, hollow: true },
      { id: 'portal:maple',     name: 'Maple',       line: 'Portal', tx: 0, wallets: 0, hollow: true },
      { id: 'portal:morpho',    name: 'Morpho',      line: 'Portal', tx: 0, wallets: 0, hollow: true },
      { id: 'portal:stargate',  name: 'Stargate',    line: 'Portal', tx: 0, wallets: 0, hollow: true },
    ],
  },
]

const MAINNET_OPTS = { width: 1200, height: 750 }
const MAINNET_RESULT = layoutTransitMap(MAINNET_INPUT, MAINNET_OPTS)

// Helper: collect visible label boxes with k-scaled dimensions (for overlap checks).
// Re-derived by hand here (NOT via the module): name box w = (6.2·chars + 8)·k, h = 14·k,
// centre-to-box offset = max(14·k, r + 3·k); optional labelAlign shifts the box along the
// cross axis. Sub-labels are NOT included (see allVisibleBoxesK).
function nameBoxK(s: Station, k: number): LabelBox {
  const w = (6.2 * s.name.length + 8) * k
  const h = 14 * k
  const off = Math.max(14 * k, s.r + 3 * k)
  const al = s.labelAlign
  const bx = al === 'start' ? s.x : al === 'end' ? s.x - w : s.x - w / 2
  const by = al === 'start' ? s.y : al === 'end' ? s.y - h : s.y - h / 2
  switch (s.labelSide) {
    case 'right': return { x: s.x + off, y: by, w, h }
    case 'left':  return { x: s.x - off - w, y: by, w, h }
    case 'above': return { x: bx, y: s.y - off - h, w, h }
    default:      return { x: bx, y: s.y + off, w, h }
  }
}

// Sub-label (portal): directly under the name box, w = (5.2·16 + 6)·k, h = 11·k, same anchor.
function subBoxK(s: Station, k: number): LabelBox {
  const nb = nameBoxK(s, k)
  const w = (5.2 * 16 + 6) * k
  const h = 11 * k
  const anchor = s.labelSide === 'right' ? 'start' : s.labelSide === 'left' ? 'end' : (s.labelAlign ?? 'middle')
  const x = anchor === 'start' ? nb.x : anchor === 'end' ? nb.x + nb.w - w : s.x - w / 2
  return { x, y: nb.y + nb.h, w, h }
}

function visibleBoxesK(
  result: ReturnType<typeof layoutTransitMap>,
  k: number,
): Array<{ id: string; box: LabelBox }> {
  const out: Array<{ id: string; box: LabelBox }> = []
  for (const line of result.lines) {
    for (const s of line.stations) {
      if (!s.labelHidden) out.push({ id: s.id, box: nameBoxK(s, k) })
    }
  }
  return out
}

/** Name boxes and visible sub-label boxes. */
function allVisibleBoxesK(
  result: ReturnType<typeof layoutTransitMap>,
  k: number,
): Array<{ id: string; box: LabelBox }> {
  const out = visibleBoxesK(result, k)
  for (const line of result.lines) {
    for (const s of line.stations) {
      if (!s.labelHidden && s.subLabelVisible) out.push({ id: `${s.id}#sub`, box: subBoxK(s, k) })
    }
  }
  return out
}

test('mainnet 19-station: no two visible label boxes overlap (k=1)', () => {
  const visibleBoxes = visibleBoxesK(MAINNET_RESULT, 1)
  for (let i = 0; i < visibleBoxes.length; i++) {
    for (let j = i + 1; j < visibleBoxes.length; j++) {
      const a = visibleBoxes[i]
      const b = visibleBoxes[j]
      assert.ok(
        !boxesOverlap(a.box, b.box),
        `labels overlap: ${a.id} ∩ ${b.id}`,
      )
    }
  }
})

test('mainnet 19-station: no visible label box overlaps hub collision zone (k=1, r=22)', () => {
  // Hub collision radius is 22 layout units (the outer ring radius).
  // At k=1, placeLabels keeps labels outside this boundary.
  const hub = MAINNET_RESULT.hub
  const hubR = 22
  const hubObs: LabelBox = { x: hub.x - hubR, y: hub.y - hubR, w: hubR * 2, h: hubR * 2 }
  for (const line of MAINNET_RESULT.lines) {
    for (const s of line.stations) {
      if (!s.labelHidden) {
        const lb = labelBox(s)
        assert.ok(
          !boxesOverlap(lb, hubObs),
          `label for ${s.id} overlaps hub collision zone: ${JSON.stringify(lb)}`,
        )
      }
    }
  }
})

test('mainnet 19-station: at most 2 labels hidden (k=1)', () => {
  let hiddenCount = 0
  for (const line of MAINNET_RESULT.lines) {
    for (const s of line.stations) {
      if (s.labelHidden) hiddenCount++
    }
  }
  assert.ok(hiddenCount <= 2, `${hiddenCount} labels hidden — expected at most 2`)
})

// ─── placeLabels: k=1 equals layoutTransitMap ────────────────────────────────
//
// buildTransitLayout returns the pre-placement geometry (preferred labelSides,
// all labelHidden=false).  placeLabels(geometry, 1) must deepEqual layoutTransitMap.

test('placeLabels(buildTransitLayout(…), 1) deepEquals layoutTransitMap', () => {
  const geometry = buildTransitLayout(MAINNET_INPUT, MAINNET_OPTS)
  const placed   = placeLabels(geometry, 1)
  const direct   = layoutTransitMap(MAINNET_INPUT, MAINNET_OPTS)
  assert.deepEqual(placed, direct)
})

// ─── placeLabels: k=2.3 — phone-width collision checks ───────────────────────
//
// At 375px display width and a ~860 layout-unit viewBox width,
// unitsPerPx ≈ 860/375 ≈ 2.3.  Every label box and the hub collision radius
// are scaled by k=2.3 for the placement pass.
//
// Assertions (using k-scaled box dimensions for the overlap checks):
//   1. No two visible k-scaled label boxes overlap each other.
//   2. No visible k-scaled label box overlaps the k-scaled hub circle (r = 22 * k).
//   3. Hidden count is reported (no upper bound enforced).
//   4. The busiest station on each non-portal line (first station, sorted tx-desc)
//      must be visible: USDC (Stablecoin), Uniswap (DeFi), StableFX (Payments),
//      Circle Gateway (Infra).  USYC (RWA, tx=0) and ERC-8004 Identity (Agents)
//      are single-station lines and also must be visible.
//      Aave (first Portal station) must also be visible.

const MAINNET_GEOMETRY = buildTransitLayout(MAINNET_INPUT, MAINNET_OPTS)
const PLACED_K23 = placeLabels(MAINNET_GEOMETRY, 2.3)

test('placeLabels k=2.3: no two visible k-scaled label boxes overlap', () => {
  const visibleBoxes = visibleBoxesK(PLACED_K23, 2.3)
  let failures = 0
  const msgs: string[] = []
  for (let i = 0; i < visibleBoxes.length; i++) {
    for (let j = i + 1; j < visibleBoxes.length; j++) {
      const a = visibleBoxes[i]
      const b = visibleBoxes[j]
      if (boxesOverlap(a.box, b.box)) {
        failures++
        msgs.push(`${a.id} ∩ ${b.id}`)
      }
    }
  }
  assert.equal(failures, 0, `${failures} overlapping label pairs at k=2.3:\n  ${msgs.join('\n  ')}`)
})

test('placeLabels k=2.3: no visible k-scaled label box overlaps k-scaled hub', () => {
  const k = 2.3
  const hub = PLACED_K23.hub
  // Hub collision radius = 22 * k (as defined in placeLabels)
  const hubR = 22 * k
  const hubObs: LabelBox = { x: hub.x - hubR, y: hub.y - hubR, w: hubR * 2, h: hubR * 2 }
  const visibleBoxes = visibleBoxesK(PLACED_K23, k)
  for (const { id, box } of visibleBoxes) {
    assert.ok(
      !boxesOverlap(box, hubObs),
      `label for ${id} overlaps k-scaled hub at k=${k}`,
    )
  }
})

test('placeLabels k=2.3: hidden count (informational)', () => {
  let hiddenCount = 0
  for (const line of PLACED_K23.lines) {
    for (const s of line.stations) {
      if (s.labelHidden) hiddenCount++
    }
  }
  // No hard upper bound — just report it so failures in other tests are easier to read
  console.log(`  placeLabels k=2.3: ${hiddenCount} label(s) hidden`)
  assert.ok(hiddenCount >= 0)
})

test('placeLabels k=2.3: busiest station on each line is visible', () => {
  // The first station on each line (sorted tx-desc) must keep its label visible.
  // Required visible: USDC, Uniswap, USYC, StableFX, ERC-8004 Identity, Circle Gateway, Aave
  const requiredVisible = [
    'usdc',       // Stablecoin line, tx=133600
    'uniswap',    // DeFi line, tx=26000
    'usyc',       // RWA line (single station)
    'stablefx',   // Payments line, tx=337
    'erc8004',    // Agents line (single station)
    'cgateway',   // Infra line, tx=804
    'portal:aave',// Portal line (first, all tx=0 sorted by name → Aave first)
  ]

  const hiddenIds = new Set<string>()
  for (const line of PLACED_K23.lines) {
    for (const s of line.stations) {
      if (s.labelHidden) hiddenIds.add(s.id)
    }
  }

  for (const id of requiredVisible) {
    assert.ok(
      !hiddenIds.has(id),
      `Station "${id}" must be visible at k=2.3 (is a line's first/busiest station)`,
    )
  }
})


// ─── segmentHitsBox ───────────────────────────────────────────────────────────
// Box B = x 10..20, y 10..20.

const B: LabelBox = { x: 10, y: 10, w: 10, h: 10 }
const P = (x: number, y: number) => ({ x, y })

test('segmentHitsBox: endpoint inside', () => {
  assert.equal(segmentHitsBox(P(15, 15), P(100, 100), B), true)
  assert.equal(segmentHitsBox(P(100, 100), P(15, 15), B), true)
})

test('segmentHitsBox: fully inside', () => {
  assert.equal(segmentHitsBox(P(12, 12), P(18, 18), B), true)
})

test('segmentHitsBox: crosses straight through (both endpoints outside)', () => {
  assert.equal(segmentHitsBox(P(0, 15), P(30, 15), B), true)
  assert.equal(segmentHitsBox(P(15, 0), P(15, 30), B), true)
  assert.equal(segmentHitsBox(P(30, 15), P(0, 15), B), true)
})

test('segmentHitsBox: diagonal through box, both endpoints outside', () => {
  // x + y = 25 passes through (12.5, 12.5) … (15, 10) … (10, 15)
  assert.equal(segmentHitsBox(P(0, 25), P(25, 0), B), true)
})

test('segmentHitsBox: diagonal miss although bounding boxes overlap', () => {
  // x + y = 15 < 20 (the box minimum is at corner (10,10)), bbox of segment is 0..15 × 0..15
  assert.equal(segmentHitsBox(P(0, 15), P(15, 0), B), false)
  assert.equal(segmentHitsBox(P(15, 0), P(0, 15), B), false)
})

test('segmentHitsBox: plain misses', () => {
  assert.equal(segmentHitsBox(P(0, 0), P(5, 5), B), false)
  assert.equal(segmentHitsBox(P(0, 5), P(30, 5), B), false)   // parallel, above
  assert.equal(segmentHitsBox(P(25, 0), P(25, 30), B), false) // parallel, right
  assert.equal(segmentHitsBox(P(0, 15), P(9.999, 15), B), false) // stops just short
})

test('segmentHitsBox: touching counts as a hit (closed rectangle)', () => {
  assert.equal(segmentHitsBox(P(0, 15), P(10, 15), B), true)     // endpoint on left edge
  assert.equal(segmentHitsBox(P(10, 0), P(10, 30), B), true)     // runs along the left edge
  assert.equal(segmentHitsBox(P(0, 20), P(20, 0), B), true)      // x+y=20 grazes corner (10,10)
  assert.equal(segmentHitsBox(P(20, 20), P(30, 30), B), true)    // endpoint on corner (20,20)
})

test('segmentHitsBox: degenerate zero-length segment', () => {
  assert.equal(segmentHitsBox(P(15, 15), P(15, 15), B), true)
  assert.equal(segmentHitsBox(P(0, 0), P(0, 0), B), false)
})

// ─── labelSideOrder ───────────────────────────────────────────────────────────

test('labelSideOrder: horizontal — above/below alternate, then along the line (outward first)', () => {
  assert.deepEqual(labelSideOrder(0, 0), ['above', 'below', 'right', 'left'])
  assert.deepEqual(labelSideOrder(0, 1), ['below', 'above', 'right', 'left'])
  assert.deepEqual(labelSideOrder(180, 0), ['above', 'below', 'left', 'right'])
  assert.deepEqual(labelSideOrder(180, 3), ['below', 'above', 'left', 'right'])
})

test('labelSideOrder: vertical — right then left', () => {
  assert.deepEqual(labelSideOrder(90, 0), ['right', 'left', 'above', 'below'])
  assert.deepEqual(labelSideOrder(270, 1), ['right', 'left', 'below', 'above'])
})

test('labelSideOrder: diagonals — perpendicular (horizontal-extent) sides first', () => {
  assert.deepEqual(labelSideOrder(45, 0), ['left', 'right', 'above', 'below'])
  assert.deepEqual(labelSideOrder(225, 1), ['right', 'left', 'below', 'above'])
  assert.deepEqual(labelSideOrder(135, 0), ['right', 'left', 'above', 'below'])
  assert.deepEqual(labelSideOrder(315, 1), ['left', 'right', 'below', 'above'])
})

test('labelSideOrder: angle normalisation', () => {
  assert.deepEqual(labelSideOrder(360, 0), labelSideOrder(0, 0))
  assert.deepEqual(labelSideOrder(-90, 0), labelSideOrder(270, 0))
})

// ─── label / sub-label geometry (hand-computed) ───────────────────────────────
// Station (100, 50), name 'Aave' (4 chars → name w = 6.2·4 + 8 = 32.8), r = 4.
// Sub-label: w = 5.2·16 + 6 = 89.2, h = 11, top edge = name box bottom.

const close = (a: number, b: number, msg: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`)
const boxIs = (b: LabelBox, x: number, y: number, w: number, h: number, msg: string) => {
  close(b.x, x, `${msg}.x`); close(b.y, y, `${msg}.y`); close(b.w, w, `${msg}.w`); close(b.h, h, `${msg}.h`)
}
const AAVE = { x: 100, y: 50, name: 'Aave', r: 4 }

test('SUB_LABEL_TEXT is 16 chars', () => {
  assert.equal(SUB_LABEL_TEXT, 'not measured yet')
  assert.equal(SUB_LABEL_TEXT.length, 16)
})

test('subLabelBox k=1: right → left-aligned with name box, directly below it', () => {
  boxIs(labelBoxK({ ...AAVE, labelSide: 'right' }, 1), 114, 43, 32.8, 14, 'name')
  boxIs(subLabelBox({ ...AAVE, labelSide: 'right' }, 1), 114, 57, 89.2, 11, 'sub')
})

test('subLabelBox k=1: left → right-aligned with name box', () => {
  // name x = 100 − 14 − 32.8 = 53.2; sub x = 53.2 + 32.8 − 89.2 = −3.2
  boxIs(subLabelBox({ ...AAVE, labelSide: 'left' }, 1), -3.2, 57, 89.2, 11, 'sub')
})

test('subLabelBox k=1: above / below → centred on the station', () => {
  // above: name y = 50 − 14 − 14 = 22, sub y = 36; below: name y = 64, sub y = 78
  boxIs(subLabelBox({ ...AAVE, labelSide: 'above' }, 1), 55.4, 36, 89.2, 11, 'above')
  boxIs(subLabelBox({ ...AAVE, labelSide: 'below' }, 1), 55.4, 78, 89.2, 11, 'below')
})

test('labelAlign shifts the cross axis; sub-label follows the anchor', () => {
  boxIs(labelBoxK({ ...AAVE, labelSide: 'right', labelAlign: 'start' }, 1), 114, 50, 32.8, 14, 'right/start')
  boxIs(labelBoxK({ ...AAVE, labelSide: 'right', labelAlign: 'end' }, 1), 114, 36, 32.8, 14, 'right/end')
  boxIs(labelBoxK({ ...AAVE, labelSide: 'below', labelAlign: 'start' }, 1), 100, 64, 32.8, 14, 'below/start')
  boxIs(subLabelBox({ ...AAVE, labelSide: 'below', labelAlign: 'start' }, 1), 100, 78, 89.2, 11, 'sub below/start')
  // end: name x = 100 − 32.8 = 67.2; sub x = 67.2 + 32.8 − 89.2 = 10.8
  boxIs(subLabelBox({ ...AAVE, labelSide: 'below', labelAlign: 'end' }, 1), 10.8, 78, 89.2, 11, 'sub below/end')
})

test('labelBoxK / subLabelBox scale with k (k=2, r=4 → offset 28)', () => {
  boxIs(labelBoxK({ ...AAVE, labelSide: 'right' }, 2), 128, 36, 65.6, 28, 'name k=2')
  boxIs(subLabelBox({ ...AAVE, labelSide: 'right' }, 2), 128, 64, 178.4, 22, 'sub k=2')
})

test('labelOffsetK: 14k, but never closer than r + 3k', () => {
  close(labelOffsetK(4, 1), 14, 'r=4,k=1')
  close(labelOffsetK(11, 1), 14, 'r=11,k=1 (11+3 = 14)')
  close(labelOffsetK(4, 2), 28, 'r=4,k=2')
  close(labelOffsetK(11, 0.5), 12.5, 'r=11,k=0.5 (11+1.5)')
})

test('labelBox (k=1) equals labelBoxK at k=1 for r ≤ 11', () => {
  for (const side of ['left', 'right', 'above', 'below'] as const) {
    assert.deepEqual(labelBox({ ...AAVE, labelSide: side }), labelBoxK({ ...AAVE, labelSide: side }, 1))
  }
})

// ─── Label placement avoids lines, circles, hub and other labels ─────────────

/** Minimum-distance test between a circle (centre c, radius r) and a closed box. */
function circleHitsBox(cx: number, cy: number, r: number, b: LabelBox): boolean {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w))
  const ny = Math.max(b.y, Math.min(cy, b.y + b.h))
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r
}

/** Independent check: sample every segment densely; any sample strictly inside the box is a hit. */
function sampledSegmentInside(a: { x: number; y: number }, b: { x: number; y: number }, box: LabelBox): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const steps = Math.max(1, Math.ceil(len / 0.25))
  const eps = 1e-6
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + t * (b.x - a.x)
    const y = a.y + t * (b.y - a.y)
    if (x > box.x + eps && x < box.x + box.w - eps && y > box.y + eps && y < box.y + box.h - eps) return true
  }
  return false
}

function assertPlacementClean(layout: LayoutResult, k: number, tag: string): number {
  const boxes = allVisibleBoxesK(layout, k)
  const hubR = 22 * k
  const hubBox: LabelBox = { x: layout.hub.x - hubR, y: layout.hub.y - hubR, w: hubR * 2, h: hubR * 2 }

  for (const { id, box } of boxes) {
    // lines (every line, own included)
    for (const line of layout.lines) {
      for (let i = 1; i < line.points.length; i++) {
        const a = line.points[i - 1], b = line.points[i]
        assert.ok(!segmentHitsBox(a, b, box), `${tag}: ${id} box hits ${line.key} segment ${i}`)
        assert.ok(!sampledSegmentInside(a, b, box), `${tag}: ${id} box contains points of ${line.key} segment ${i}`)
      }
      // station circles (every station, own included), drawn radius = max(r, 5k)
      for (const st of line.stations) {
        assert.ok(
          !circleHitsBox(st.x, st.y, Math.max(st.r, 5 * k), box),
          `${tag}: ${id} box hits circle of ${st.id}`,
        )
      }
    }
    assert.ok(!boxesOverlap(box, hubBox), `${tag}: ${id} box hits hub zone`)
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      assert.ok(!boxesOverlap(boxes[i].box, boxes[j].box), `${tag}: ${boxes[i].id} ∩ ${boxes[j].id}`)
    }
  }

  let hidden = 0
  for (const line of layout.lines) for (const st of line.stations) if (st.labelHidden) hidden++
  return hidden
}

const FIRST_IDS = ['usdc', 'uniswap', 'usyc', 'stablefx', 'erc8004', 'cgateway', 'portal:aave']

for (const height of [750, 680]) {
  const geom = buildTransitLayout(MAINNET_INPUT, { width: 1200, height })
  for (const k of [1, 1.7, 2.3]) {
    const tag = `mainnet 1200×${height} k=${k}`
    const placed = placeLabels(geom, k)

    test(`${tag}: no visible label (incl. sub-labels) touches a line, station circle, hub or other label`, () => {
      const hidden = assertPlacementClean(placed, k, tag)
      const hiddenIds = placed.lines.flatMap(l => l.stations).filter(s => s.labelHidden).map(s => s.name)
      const subIds = placed.lines.flatMap(l => l.stations).filter(s => s.id.startsWith('portal:') && !s.labelHidden && !s.subLabelVisible).map(s => s.name)
      console.log(`  ${tag}: ${hidden} name(s) hidden [${hiddenIds.join(', ')}]; sub-label omitted for [${subIds.join(', ')}]`)
    })

    test(`${tag}: first station of every line is visible`, () => {
      const first = new Set(placed.lines.map(l => l.stations[0].id))
      assert.deepEqual([...first].sort(), [...FIRST_IDS].sort())
      for (const line of placed.lines) {
        assert.equal(line.stations[0].labelHidden, false, `${line.stations[0].id} hidden`)
      }
    })
  }
}

test('placement k=1 (1200×750): horizontal lines alternate above/below between neighbours', () => {
  const r = layoutTransitMap(MAINNET_INPUT, MAINNET_OPTS)
  const sides = (key: string) => r.lines.find(l => l.key === key)!.stations.map(s => s.labelSide)
  assert.deepEqual(sides('DeFi'), ['above', 'below', 'above'])
  assert.deepEqual(sides('Infra'), ['above', 'below', 'above', 'below'])
})

test('placement k=1 (1200×750): every portal sub-label fits and sits right/left of the vertical line', () => {
  const r = layoutTransitMap(MAINNET_INPUT, MAINNET_OPTS)
  const portal = r.lines.find(l => l.key === 'Portal')!
  for (const s of portal.stations) {
    assert.equal(s.labelHidden, false, `${s.id} hidden`)
    assert.equal(s.subLabelVisible, true, `${s.id} sub-label missing`)
  }
  assert.equal(portal.stations[0].labelSide, 'right')   // vertical line: right first
  assert.equal(portal.stations[1].labelSide, 'right')
})

test('sub-label only on portal stations', () => {
  const r = placeLabels(MAINNET_GEOMETRY, 1.7)
  for (const line of r.lines) {
    for (const s of line.stations) {
      if (!s.id.startsWith('portal:')) assert.equal(s.subLabelVisible, false, `${s.id}`)
    }
  }
})

test('single horizontal line (k=1): labels above, below, above', () => {
  const r = layoutTransitMap(
    [{ key: 'L', stations: [
      { id: 'a', name: 'A', line: 'L', tx: 30, wallets: 0 },
      { id: 'b', name: 'B', line: 'L', tx: 20, wallets: 0 },
      { id: 'c', name: 'C', line: 'L', tx: 10, wallets: 0 },
    ] }],
    { width: 800, height: 500 },
  )
  assert.deepEqual(r.lines[0].stations.map(s => s.labelSide), ['above', 'below', 'above'])
  assert.ok(r.lines[0].stations.every(s => !s.labelHidden))
})

test('single dashed vertical line: names right of the line, sub-labels shown', () => {
  const r = layoutTransitMap(
    [{ key: 'Portal', dashed: true, stations: [
      { id: 'portal:a', name: 'Aave', line: 'Portal', tx: 0, wallets: 0, hollow: true },
      { id: 'portal:b', name: 'Beta', line: 'Portal', tx: 0, wallets: 0, hollow: true },
    ] }],
    { width: 1000, height: 900 },
  )
  assert.equal(r.lines[0].angle, 270)
  assert.deepEqual(r.lines[0].stations.map(s => s.labelSide), ['right', 'right'])
  assert.deepEqual(r.lines[0].stations.map(s => s.subLabelVisible), [true, true])
})

test('sub-label colliding → only the sub-label is omitted, the name stays', () => {
  // Portal station at (0,0), hub far away. A closed "cage" polyline x −20..60, y −30..30 of
  // another line surrounds it. Every label box starts 14 from the station, i.e. inside the
  // cage, so it either lies fully inside or straddles a wall. Name box 'right' (x 14..46.8,
  // y −7..7) fits inside; every sub-label (89.2 wide) is wider than the 80-wide cage, so none can.
  const station: Station = {
    id: 'portal:x', name: 'Aave', line: 'Portal', tx: 0, wallets: 0, hollow: true,
    x: 0, y: 0, r: 4, labelSide: 'right', labelHidden: false, subLabelVisible: false,
  }
  const make = (withCage: boolean): LayoutResult => ({
    hub: { x: 1000, y: 1000 },
    lines: [
      { key: 'Portal', angle: 270, points: [{ x: 0, y: 0 }], stations: [station], totalTx: 0, dashed: true },
      ...(withCage ? [{
        key: 'Cage', angle: 0, stations: [], totalTx: 0, dashed: false,
        points: [{ x: -20, y: -30 }, { x: 60, y: -30 }, { x: 60, y: 30 }, { x: -20, y: 30 }, { x: -20, y: -30 }],
      }] : []),
    ],
  })

  const free = placeLabels(make(false), 1).lines[0].stations[0]
  assert.equal(free.labelHidden, false)
  assert.equal(free.subLabelVisible, true)
  assert.equal(free.labelSide, 'right')

  const caged = placeLabels(make(true), 1).lines[0].stations[0]
  assert.equal(caged.labelHidden, false, 'name must stay')
  assert.equal(caged.subLabelVisible, false, 'sub-label must be omitted')
  assert.equal(caged.labelSide, 'right')
  assert.equal(caged.labelAlign, undefined)
})

test('placeLabels does not mutate its input (new fields included)', () => {
  const before = JSON.stringify(MAINNET_GEOMETRY)
  placeLabels(MAINNET_GEOMETRY, 1.7)
  assert.equal(JSON.stringify(MAINNET_GEOMETRY), before)
})

test('placeLabels is deterministic at k=1.7', () => {
  assert.deepEqual(placeLabels(MAINNET_GEOMETRY, 1.7), placeLabels(MAINNET_GEOMETRY, 1.7))
})

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`transitMap: ${passed} tests passed`)
