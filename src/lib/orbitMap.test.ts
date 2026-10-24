// Run: node --experimental-strip-types src/lib/orbitMap.test.ts
import assert from 'node:assert/strict'
import {
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  FLATTEN,
  cometPath,
  ellipsePoint,
  flattenFor,
  mulberry32,
  orbitLapSeconds,
  orbitOrder,
  orbitRadii,
  planetAngle,
  planetRadius,
  placeLabels,
  pointOnBezier,
  rectsOverlap,
  seedFromString,
} from './orbitMap.ts'

const close = (actual: number, expected: number, eps = 1e-9, msg?: string) =>
  assert.ok(Math.abs(actual - expected) <= eps, msg ?? `${actual} is not within ${eps} of ${expected}`)

// ── colours ─────────────────────────────────────────────────────────────────
assert.equal(Object.keys(CATEGORY_COLORS).length, 7)
assert.equal(CATEGORY_COLORS.Stablecoin, '#a9c4ea')
assert.equal(CATEGORY_COLORS.DeFi, '#5ee6a8')
assert.equal(new Set(Object.values(CATEGORY_COLORS)).size, 7, 'seven distinct hues')

// ── orbitOrder ──────────────────────────────────────────────────────────────
assert.deepEqual(
  orbitOrder({ Stablecoin: 5, DeFi: 90, RWA: 1, Payments: 40, Agents: 0, Infra: 12 }),
  ['DeFi', 'Payments', 'Infra', 'Stablecoin', 'RWA', 'Agents'],
)
assert.deepEqual(orbitOrder({}), [...CATEGORY_ORDER], 'all zero → CATEGORIES order')
assert.deepEqual(
  orbitOrder({ Infra: 7, RWA: 7, Stablecoin: 7, DeFi: 3 }),
  ['Stablecoin', 'RWA', 'Infra', 'DeFi', 'Payments', 'Agents'],
  'ties keep CATEGORIES order',
)

// ── orbitRadii ──────────────────────────────────────────────────────────────
// (7, 1200, 700): width cap 1200/2 − 16 = 584; height cap (700/2 − 16)/0.42 ≈ 795.2 → outer = 584.
// Inner 90, step (584 − 90)/6 = 82⅓.
const radii = orbitRadii(7, 1200, 700)
assert.equal(radii.length, 7)
assert.equal(radii[0], 90)
assert.equal(radii[6], 584)
close(radii[1], 172 + 1 / 3)
close(radii[3], 337)
close(radii[5], 501.6666666666667)
for (let i = 1; i < radii.length; i++) close(radii[i] - radii[i - 1], 494 / 6, 1e-9, 'equal steps')
const outer = radii[6]
assert.ok(outer <= 1200 / 2 - 16)
assert.ok(outer * FLATTEN <= 700 / 2 - 16)

// Height-limited: (7, 1200, 300) → (150 − 16)/0.42 = 319.047…, still ≤ 584.
const flat = orbitRadii(7, 1200, 300)
close(flat[6], 134 / 0.42)
assert.ok(flat[6] * FLATTEN <= 300 / 2 - 16 + 1e-9)
// Phone: 360 wide → 164 outer.
const phone = orbitRadii(7, 360, 520)
assert.equal(phone[0], 90)
assert.equal(phone[6], 164)
assert.deepEqual(orbitRadii(0, 1200, 700), [])
assert.deepEqual(orbitRadii(1, 1200, 700), [584])
assert.deepEqual(orbitRadii(2, 1200, 700, 100), [90, 500])

// ── planetRadius ────────────────────────────────────────────────────────────
assert.equal(planetRadius(0, 1000), 3)
assert.equal(planetRadius(-5, 1000), 3)
assert.equal(planetRadius(10, 0), 3)
assert.equal(planetRadius(1000, 1000), 10)
assert.equal(planetRadius(5000, 1000), 10, 'clamped at 10')
close(planetRadius(99, 9999), 6.5, 1e-9, 'ln(100)/ln(10000) = 0.5')
let prev = 3
for (const tx of [1, 3, 10, 40, 200, 999, 1000]) {
  const r = planetRadius(tx, 1000)
  assert.ok(r > prev && r >= 3 && r <= 10, `monotonic at ${tx}`)
  prev = r
}

// ── planetAngle / lap ───────────────────────────────────────────────────────
assert.equal(orbitLapSeconds(90), 90)
assert.equal(orbitLapSeconds(600), 240)
assert.equal(orbitLapSeconds(345), 165)
assert.equal(orbitLapSeconds(10), 90)
assert.equal(orbitLapSeconds(9999), 240)
assert.equal(planetAngle(0, 4, 0, 0, 90), 0)
close(planetAngle(1, 4, 0, 0, 90), Math.PI / 2)
close(planetAngle(2, 4, 0.5, 0, 90), Math.PI + 0.5)
close(planetAngle(0, 4, 0, 90, 90), 2 * Math.PI, 1e-12, 'one lap in 90 s on the inner orbit')
close(planetAngle(0, 4, 0, 165, 345), 2 * Math.PI, 1e-12, 'one lap in 165 s at rx = 345')
assert.ok(planetAngle(0, 1, 0, 60, 90) > planetAngle(0, 1, 0, 60, 500), 'inner orbits are faster')

// ── ellipsePoint ────────────────────────────────────────────────────────────
assert.deepEqual(ellipsePoint(100, 50, 40, 20, 0, 0), { x: 140, y: 50 })
const top = ellipsePoint(100, 50, 40, 20, 0, Math.PI / 2)
close(top.x, 100)
close(top.y, 70)
const left = ellipsePoint(100, 50, 40, 20, 0, Math.PI)
close(left.x, 60)
close(left.y, 50)
const rotated = ellipsePoint(0, 0, 10, 4, Math.PI / 2, 0)
close(rotated.x, 0)
close(rotated.y, 10)

// ── pointOnBezier ───────────────────────────────────────────────────────────
const p0 = { x: 0, y: 0 }
const c = { x: 50, y: 100 }
const p1 = { x: 100, y: 0 }
assert.deepEqual(pointOnBezier(p0, c, p1, 0), { x: 0, y: 0 })
assert.deepEqual(pointOnBezier(p0, c, p1, 0.5), { x: 50, y: 50 })
assert.deepEqual(pointOnBezier(p0, c, p1, 1), { x: 100, y: 0 })

// ── mulberry32 / seeds ──────────────────────────────────────────────────────
const a = mulberry32(42)
const b = mulberry32(42)
const seqA = Array.from({ length: 8 }, () => a())
const seqB = Array.from({ length: 8 }, () => b())
assert.deepEqual(seqA, seqB)
assert.ok(seqA.every(v => v >= 0 && v < 1))
assert.notDeepEqual(seqA, Array.from({ length: 8 }, ((r) => () => r())(mulberry32(43))))
assert.equal(new Set(seqA).size, 8)
assert.equal(seedFromString('a'), 0xe40c292c, 'FNV-1a of "a"')
assert.equal(seedFromString(''), 0x811c9dc5)

// ── cometPath ───────────────────────────────────────────────────────────────
const cp = cometPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 7)
assert.deepEqual(cp, cometPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 7), 'deterministic')
assert.equal(cp.x, 50)
assert.ok(Math.abs(cp.y) >= 22 && Math.abs(cp.y) < 42, 'bow is 22–42% of the chord')

// ── rectsOverlap ─────────────────────────────────────────────────────────────
// Touching edges do NOT overlap.
assert.equal(rectsOverlap(0, 0, 10, 10, 10, 0, 10, 10), false, 'touching right/left edge')
assert.equal(rectsOverlap(0, 0, 10, 10, 0, 10, 10, 10), false, 'touching bottom/top edge')
assert.equal(rectsOverlap(0, 0, 10, 10, 0, 0, 10, 10), true, 'same box overlaps itself')
assert.equal(rectsOverlap(0, 0, 10, 10, 5, 5, 10, 10), true, 'overlapping by 5×5')
assert.equal(rectsOverlap(0, 0, 10, 10, 11, 0, 10, 10), false, 'gap of 1 → no overlap')
assert.equal(rectsOverlap(0, 0, 1, 1, 2, 2, 1, 1), false, 'diagonal gap')
assert.equal(rectsOverlap(0, 0, 10, 10, 9, 9, 10, 10), true, '1×1 overlap at corner')

// ── placeLabels ───────────────────────────────────────────────────────────────
// Priority order: higher priority wins; lower priority blocked by it.
const itemA = { id: 'A', x: 0, y: 0, w: 10, h: 10, priority: 10 }
const itemB = { id: 'B', x: 5, y: 0, w: 10, h: 10, priority: 5 }  // overlaps A; lower priority
const itemC = { id: 'C', x: 50, y: 50, w: 10, h: 10, priority: 1 } // no conflict
assert.deepEqual([...placeLabels([itemA, itemB, itemC], [])].sort(), ['A', 'C'], 'A wins over B; C independent')

// Blocker prevents placement.
const blocker = { x: 0, y: 0, w: 20, h: 20 }
assert.deepEqual([...placeLabels([itemA], [blocker])], [], 'blocked by blocker')
assert.deepEqual([...placeLabels([itemC], [blocker])], ['C'], 'C not blocked')

// Deterministic: same input → same output.
assert.deepEqual(
  [...placeLabels([itemA, itemB, itemC], [])].sort(),
  [...placeLabels([itemC, itemB, itemA], [])].sort(),
  'deterministic regardless of input order',
)

// ── flattenFor ────────────────────────────────────────────────────────────────
assert.equal(flattenFor(1200, 700), 0.42, '1200×700 landscape → 0.42')
assert.equal(flattenFor(800, 600), 0.42, '800×600 landscape (square-ish) → 0.42')
assert.equal(flattenFor(500, 500), 0.42, 'square → 0.42')
// 375×560: ratio=1.4933…, 0.42+0.6*(1.4933-1)=0.716
close(flattenFor(375, 560), 0.42 + 0.6 * (560 / 375 - 1), 1e-9, '375×560 by hand')
// 300×900: ratio=3, 0.42+0.6*2=1.62 → clamped to 0.85
assert.equal(flattenFor(300, 900), 0.85, '300×900 → clamped to 0.85')
// 1000×1001: ratio=1.001, 0.42+0.6*0.001=0.4206 (slightly above floor).
close(flattenFor(1000, 1001), 0.42 + 0.6 * (1001 / 1000 - 1), 1e-12, '1000×1001 just above square')
// Cross-check: flattenFor always in [0.42, 0.85].
for (const [w, h] of [[360, 640], [320, 568], [414, 896], [768, 1024]]) {
  const f = flattenFor(w, h)
  assert.ok(f >= 0.42 && f <= 0.85, `flattenFor(${w},${h})=${f} in [0.42,0.85]`)
}

console.log('orbitMap.test.ts: all assertions passed')
