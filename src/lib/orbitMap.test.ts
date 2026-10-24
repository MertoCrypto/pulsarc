// Run: node --experimental-strip-types src/lib/orbitMap.test.ts
import assert from 'node:assert/strict'
import {
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  FIELD_ROLL,
  FIELD_TILT,
  FLATTEN,
  PORT_COUNT_NARROW,
  PORT_RING_FACTOR,
  QualityGovernor,
  appPlanetSize,
  appRingRadii,
  canvasDpr,
  cctpPill,
  cometPath,
  ellipseExtent,
  ellipsePoint,
  flattenFor,
  galaxyFit,
  logRange,
  mulberry32,
  orbitLapSeconds,
  orbitOrder,
  orbitRadii,
  pillAmount,
  planetAngle,
  planetRadius,
  placeLabels,
  pointOnBezier,
  portAngles,
  projectPoint,
  rectsOverlap,
  ringSlot,
  ringSpeed,
  scatterNodes,
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

// ── projectPoint (same projection as the landing hero) ──────────────────────
assert.equal(FIELD_TILT, 0.42)
assert.equal(FIELD_ROLL, -0.3)
assert.equal(PORT_RING_FACTOR, 1.32)
assert.equal(PORT_COUNT_NARROW, 10)
// angle 0, no roll: straight right of the centre, depth 0.
const pp1 = projectPoint(100, 0, 0, 0, 1, 0.42, 0)
close(pp1.x, 100)
close(pp1.y, 0)
close(pp1.depth, 0)
// angle π/2, zoom 2, tilt 0.5, centre (10, 20): Y = 1 · 100 · 2 · 0.5 = 100 → below the centre, depth +1.
const pp2 = projectPoint(100, Math.PI / 2, 10, 20, 2, 0.5, 0)
close(pp2.x, 10)
close(pp2.y, 120)
close(pp2.depth, 1)
// the same point rolled by π/2: x = 10 − 100, y = 20.
const pp3 = projectPoint(100, Math.PI / 2, 10, 20, 2, 0.5, Math.PI / 2)
close(pp3.x, -90)
close(pp3.y, 20)
// the hero's roll of −0.3: x = 100 · cos 0.3, y = −100 · sin 0.3.
const pp4 = projectPoint(100, 0, 0, 0, 1, 0.42, -0.3)
close(pp4.x, 95.5336489, 1e-6)
close(pp4.y, -29.5520207, 1e-6)
close(projectPoint(100, -Math.PI / 2, 0, 0, 1, 0.42, 0).depth, -1)
assert.deepEqual(projectPoint(0, 1.234, 7, 9, 3, 0.42, -0.3).x, 7, 'radius 0 is the centre')

// ── portAngles ──────────────────────────────────────────────────────────────
const quarter = portAngles(4, 0)
assert.equal(quarter.length, 4)
quarter.forEach((a, i) => close(a, (i * Math.PI) / 2))
const third = portAngles(3, 1)
close(third[0], 1)
close(third[1], 1 + (2 * Math.PI) / 3)
close(third[2], 1 + (4 * Math.PI) / 3)
assert.deepEqual(portAngles(0, 0.5), [])
assert.equal(portAngles(31, 0).length, 31)

// ── ellipseExtent / galaxyFit ───────────────────────────────────────────────
assert.deepEqual(ellipseExtent(100, 0.5, 0), { halfW: 100, halfH: 50 })
const quarterTurn = ellipseExtent(100, 0.5, Math.PI / 2)
close(quarterTurn.halfW, 50)
close(quarterTurn.halfH, 100)
// roll π/4: sqrt(100² · ½ + 50² · ½) = sqrt(6250)
close(ellipseExtent(100, 0.5, Math.PI / 4).halfW, 79.05694150420949, 1e-9)
// the other-networks ellipse at 400 · 1.32 = 528, tilt 0.42, roll −0.3 is ≈ 508.6 px wide and ≈ 263.1 px high per unit zoom.
const ext = ellipseExtent(400 * PORT_RING_FACTOR, FIELD_TILT, FIELD_ROLL)
close(ext.halfW, 508.6, 0.1)
close(ext.halfH, 263.4, 0.5)
// width-limited: (1100 / 2 − 80) / halfW
close(galaxyFit(1100, 2000, true, 400), 470 / ext.halfW)
// height-limited: (700 / 2 − 100) / halfH
close(galaxyFit(3000, 700, true, 400), 250 / ext.halfH)
assert.equal(galaxyFit(300, 300, true, 400), 0.5, 'wide floor')
assert.equal(galaxyFit(5000, 5000, true, 400), 1.25, 'wide ceiling')
// phone: (375 / 2 − 24) / halfW ≈ 0.32, inside 0.28–0.6
close(galaxyFit(375, 620, false, 400), (375 / 2 - 24) / ext.halfW)
assert.equal(galaxyFit(200, 620, false, 400), 0.28, 'narrow floor')
assert.equal(galaxyFit(890, 620, false, 400), 0.6, 'narrow ceiling')

// ── appRingRadii / ringSpeed / ringSlot / appPlanetSize ─────────────────────
assert.deepEqual(appRingRadii(0, 400), [])
close(appRingRadii(1, 400)[0], 252)
const two = appRingRadii(2, 400)
close(two[0], 136)
close(two[1], 368)
const three = appRingRadii(3, 400)
close(three[0], 136)
close(three[1], 252)
close(three[2], 368)
const six = appRingRadii(6, 400)
for (let i = 1; i < six.length; i++) close(six[i] - six[i - 1], 232 / 5, 1e-9, 'equal steps')

close(ringSpeed(0), 0.0052)
close(ringSpeed(1), 0.0052 * 0.71)
close(ringSpeed(2), 0.00262132, 1e-9)
assert.ok(ringSpeed(0) > ringSpeed(1) && ringSpeed(1) > ringSpeed(2), 'inner rings are faster')

close(ringSlot(0, 4, 0), 0)
close(ringSlot(1, 4, 0), 0.25)
close(ringSlot(0, 4, 1), 0.137)
close(ringSlot(3, 4, 2), 0.024) // 0.75 + 0.274 = 1.024 → wraps to 0.024
close(ringSlot(0, 0, 3), 0.411)
for (let ring = 0; ring < 6; ring++) for (let i = 0; i < 5; i++) {
  const s = ringSlot(i, 5, ring)
  assert.ok(s >= 0 && s < 1)
}

assert.equal(appPlanetSize(0, 1000), 30)
assert.equal(appPlanetSize(-3, 1000), 30)
assert.equal(appPlanetSize(10, 0), 30)
assert.equal(appPlanetSize(1000, 1000), 56)
assert.equal(appPlanetSize(9000, 1000), 56, 'clamped at 56')
close(appPlanetSize(99, 9999), 43, 1e-9, 'ln(100)/ln(10000) = 0.5 → 30 + 13')
let lastSize = 30
for (const tx of [1, 3, 10, 40, 200, 999, 1000]) {
  const s = appPlanetSize(tx, 1000)
  assert.ok(s > lastSize && s <= 56, `monotonic at ${tx}`)
  lastSize = s
}

// ── pills ───────────────────────────────────────────────────────────────────
assert.equal(pillAmount(800), '$800')
assert.equal(pillAmount(5200), '$5.2K')
assert.equal(pillAmount(5000), '$5K')
assert.equal(pillAmount(1_250_000), '$1.3M')
assert.equal(pillAmount(3.456), '$3.46')
assert.equal(pillAmount(10), '$10')
assert.equal(pillAmount(0.004), '<$0.01')
assert.equal(pillAmount(0), '<$0.01')
assert.equal(pillAmount(999.6), '$1K', 'rounds up into the next unit instead of "$1000"')
assert.equal(pillAmount(2_000_000_000), '$2B')
assert.equal(cctpPill('in', 'Base', 5200), '$5.2K USDC · Base → Arc')
assert.equal(cctpPill('out', 'Solana', 800), '$800 USDC · Arc → Solana')
assert.equal(cctpPill('in', 'Base', null), null, 'no amount, no pill')

// ── logRange ─────────────────────────────────────────────────────────────────
// null → {head, head}
assert.deepEqual(logRange(null, 100), { from: 100, to: 100 }, 'null prev → head only')
// prev === head → empty-range sentinel {from: head+1, to: head}
assert.deepEqual(logRange(100, 100), { from: 101, to: 100 }, 'prev = head → empty sentinel')
// gap 20 → prev+1..head
assert.deepEqual(logRange(80, 100), { from: 81, to: 100 }, 'gap 20 → prev+1..head')
// gap 20000 (> cap 9000) → head−8999..head
assert.deepEqual(logRange(0, 20000), { from: 20000 - 8999, to: 20000 }, 'gap > cap → head−(cap−1)..head')

// ── scatterNodes ─────────────────────────────────────────────────────────────
const box1440 = { w: 1440, h: 820 }
const keepOut1440 = { cx: 720, cy: 410, rx: 200, ry: 84 } // representative keep-out

// Build 12 nodes with varied radii
const nodes12 = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, r: 16 + i * 2 }))
const placed12 = scatterNodes(nodes12, box1440, keepOut1440, 42)

// same input → same output (deterministic)
const placed12b = scatterNodes(nodes12, box1440, keepOut1440, 42)
for (const [id, pt] of placed12) {
  const pt2 = placed12b.get(id)
  assert.ok(pt2 !== undefined, `deterministic: ${id} placed in both runs`)
  assert.equal(pt2.x, pt.x, `deterministic x for ${id}`)
  assert.equal(pt2.y, pt.y, `deterministic y for ${id}`)
}

// No pair overlaps: distance ≥ r1 + r2 + gap
const placedArr = [...placed12.entries()]
for (let i = 0; i < placedArr.length; i++) {
  for (let j = i + 1; j < placedArr.length; j++) {
    const [id1, p1] = placedArr[i]
    const [id2, p2] = placedArr[j]
    const n1 = nodes12.find(n => n.id === id1)!
    const n2 = nodes12.find(n => n.id === id2)!
    const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
    assert.ok(dist >= n1.r + n2.r + 14, `no overlap: ${id1}↔${id2} dist=${dist.toFixed(1)}`)
  }
}

// None inside the keep-out ellipse
for (const [id, pt] of placed12) {
  const n = nodes12.find(n => n.id === id)!
  const ko_rx = keepOut1440.rx * 1.12
  const ko_ry = keepOut1440.ry * 1.25
  const dx = (pt.x - keepOut1440.cx) / ko_rx
  const dy = (pt.y - keepOut1440.cy) / ko_ry
  assert.ok(dx * dx + dy * dy >= 1, `${id} outside keep-out`)
  // All inside box with gutter
  assert.ok(pt.x - n.r >= 24, `${id} left gutter`)
  assert.ok(pt.x + n.r <= box1440.w - 24, `${id} right gutter`)
  assert.ok(pt.y - n.r >= 24, `${id} top gutter`)
  assert.ok(pt.y + n.r <= box1440.h - 24, `${id} bottom gutter`)
}

// At least 5 land left of cx and 5 right of cx
const leftOf = [...placed12.values()].filter(p => p.x < box1440.w / 2).length
const rightOf = [...placed12.values()].filter(p => p.x >= box1440.w / 2).length
assert.ok(leftOf >= 5, `at least 5 nodes left of centre (got ${leftOf})`)
assert.ok(rightOf >= 5, `at least 5 nodes right of centre (got ${rightOf})`)

// Impossible tiny box: omits nodes instead of overlapping
const tinyBox = { w: 40, h: 40 }
const tinyKO = { cx: 20, cy: 20, rx: 5, ry: 5 }
const tinyNodes = [{ id: 'a', r: 30 }, { id: 'b', r: 30 }]
const tinyPlaced = scatterNodes(tinyNodes, tinyBox, tinyKO, 1)
// Either 0 or 1 node placed; never 2 overlapping
assert.ok(tinyPlaced.size <= 1, `tiny box: at most 1 node placed (got ${tinyPlaced.size})`)

// ── scatterNodes: left/right-first placement with large keepOut ───────────────
// 12 nodes in 1440×820 with keepOut rx 350 → at least 10 placed in the left or right side bands,
// i.e. |x − cx| > rx (outside the horizontal keep-out band).
const box1440big = { w: 1440, h: 820 }
const keepOut1440big = { cx: 720, cy: 410, rx: 350, ry: 147 }
const nodes12big = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, r: 16 + i * 2 }))
const placed12big = scatterNodes(nodes12big, box1440big, keepOut1440big, 99)
const outsideBand = [...placed12big.values()].filter(p => Math.abs(p.x - keepOut1440big.cx) > keepOut1440big.rx).length
assert.ok(outsideBand >= 10, `at least 10 of 12 nodes outside the |x−cx|≤rx band (got ${outsideBand})`)

// ── canvasDpr ────────────────────────────────────────────────────────────────
// 800×600 at 1 → 1 (no reduction needed)
assert.equal(canvasDpr(800, 600, 1), 1, '800×600 @1 → 1')
// 375×620 at 3 → min(3,2)=2; 375*620*4=930000 < 2_400_000 → stays 2
assert.equal(canvasDpr(375, 620, 3), 2, '375×620 @3 → 2')
// 1440×820 at 2 → 2; 1440*820*4=4_723_200 > 2_400_000 → sqrt(2_400_000/(1440*820))≈1.418…
{
  const d = canvasDpr(1440, 820, 2)
  assert.ok(d >= 1.41 && d < 1.43, `1440×820 @2 → ~1.42 (got ${d})`)
}
// Never below 1
assert.ok(canvasDpr(9999, 9999, 1) >= 1, 'never below 1')
// Never above min(deviceDpr, 2)
assert.ok(canvasDpr(800, 600, 3) <= 2, 'never above 2')
assert.ok(canvasDpr(800, 600, 1.5) <= 1.5, 'never above deviceDpr when < 2')
// deviceDpr < 1 is not a real browser scenario; result is clamped to >= 1
assert.ok(canvasDpr(800, 600, 0.5) >= 1, 'deviceDpr < 1 → result still >= 1')
// Zero dimensions: never throws, returns >= 1
assert.ok(canvasDpr(0, 600, 2) >= 1, 'zero width → >=1')
assert.ok(canvasDpr(800, 0, 2) >= 1, 'zero height → >=1')

// ── QualityGovernor ──────────────────────────────────────────────────────────
{
  // stays at level 0 with 16 ms frames
  const g = new QualityGovernor(45, 90, 180)
  for (let i = 0; i < 200; i++) g.feed(16)
  assert.equal(g.getLevel(), 0, 'stays level 0 at 16 ms')
}
{
  // goes to level 1 after 45+ frames of 30 ms (avg > 24 ms, cooldown 90 frames)
  const g = new QualityGovernor(45, 90, 180)
  for (let i = 0; i < 91; i++) g.feed(30)
  assert.equal(g.getLevel(), 1, 'reaches level 1 after 91 frames of 30 ms')
}
{
  // goes to level 2 after further frames of 40 ms (avg > 32 ms)
  const g = new QualityGovernor(45, 90, 180)
  // Fill window + cooldown to reach level 1
  for (let i = 0; i < 91; i++) g.feed(30)
  assert.equal(g.getLevel(), 1)
  // Now push avg above 32 ms for another cooldown window
  for (let i = 0; i < 91; i++) g.feed(40)
  assert.equal(g.getLevel(), 2, 'reaches level 2 after frames of 40 ms')
}
{
  // recovers one level after 180 consecutive frames of 12 ms
  const g = new QualityGovernor(45, 90, 180)
  for (let i = 0; i < 91; i++) g.feed(30)
  assert.equal(g.getLevel(), 1)
  // Feed 180 fast frames — need at least 1 cooldown window + 180 fast frames
  for (let i = 0; i < 90 + 180; i++) g.feed(12)
  assert.equal(g.getLevel(), 0, 'recovers to level 0 after 180 fast frames')
}
{
  // No flapping: alternating 10/40 ms keeps level once raised
  const g = new QualityGovernor(45, 90, 180)
  // First raise to level 1
  for (let i = 0; i < 91; i++) g.feed(30)
  assert.equal(g.getLevel(), 1)
  // Alternate: average is ~25 ms — not enough to degrade to 2, and avg >= 17 so no recovery
  const levelsBefore = g.getLevel()
  for (let i = 0; i < 500; i++) g.feed(i % 2 === 0 ? 10 : 40)
  // avg ~25 ms: should stay at 1 (too high to recover, borderline to go to 2)
  // At minimum should not have dropped back to 0 (no false recovery)
  assert.ok(g.getLevel() >= levelsBefore, 'no false recovery on alternating 10/40 ms')
}

console.log('orbitMap.test.ts: all assertions passed')
