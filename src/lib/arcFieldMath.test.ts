/**
 * Unit tests for src/lib/arcFieldMath.ts
 * Run: npx tsx src/lib/arcFieldMath.test.ts
 * Only node:assert/strict — no test framework, no installs.
 */
import assert from 'node:assert/strict'
import { gauss, makeDust, DISC, ARMS, TWIST, TONES } from './arcFieldMath.ts'

// ─── Math.random mock helpers ─────────────────────────────────────────────────

const originalRandom = Math.random

/**
 * Install a deterministic Math.random that returns values from `seq` in order.
 * Each call pops the next value. Throws if the sequence is exhausted.
 * Returns a restore function.
 */
function mockRandom(seq: readonly number[]): () => void {
  const queue = [...seq]
  let i = 0
  Math.random = (): number => {
    if (i >= queue.length) {
      throw new Error(
        `Math.random called more times than expected (call #${i + 1}, sequence length ${queue.length})`,
      )
    }
    return queue[i++]
  }
  return () => {
    Math.random = originalRandom
  }
}

function restoreRandom(): void {
  Math.random = originalRandom
}

// ─── Test registry (same pattern as context_example.test.ts) ─────────────────

let passed = 0
const tests: Array<[string, () => Promise<void> | void]> = []

function test(name: string, fn: () => Promise<void> | void): void {
  tests.push([name, fn])
}

// ─── makeDust() — call-order reference ───────────────────────────────────────
//
// The exact sequence of Math.random() calls inside makeDust() is:
//
// call  0: inArm  (< 0.74 => true)
// call  1: r exponent  (pow(x, inArm?0.85:0.6) * (inArm?DISC:DISC*1.12) + 22)
// call  2: arm index  ((x * ARMS)|0)  — ALWAYS called regardless of inArm
//
// IF inArm:
//   call  3,4,5: gauss() [three randoms]
//   call  6: ring  (< 0.05)
// ELSE:
//   call  3: non-arm angle  (x * 2π)
//   call  4: ring  (< 0.05)
//
// call  N+0: size random
//             ring=true  => 3 + x*7
//             ring=false => 0.6 + x*2 + nearCore*0.6
//
// Tone selection: nearCore > 0.72 && random() < 0.7 ? TONES[4] : TONES[index]
//   NOTE: JS short-circuit evaluation — if nearCore <= 0.72 the random() call
//         for the nearCore threshold is SKIPPED entirely.
//
// call  N+1: toneCheck random  [only consumed when nearCore > 0.72]
//   IF nearCore > 0.72 AND toneCheck < 0.7 => TONES[4]; no further tone call
//   ELSE:
//     call  N+2 (or N+1 if nearCore <= 0.72): TONES index  ((x*TONES.length)|0)
//
// call  [M]:   alpha  (base + x*0.38)   base=0.62 inArm, 0.28 non-arm
// call  [M+1]: phase  (x * 2π)
//
// ── Choosing rRand for tests ──────────────────────────────────────────────────
//
// rRand=0.05 ensures nearCore > 0.72 for both branches, so toneCheck is always
// consumed and sequences stay predictable:
//   inArm:   r = 22 + 0.05^0.85 * 400  ≈ 51.8  → nearCore ≈ 0.87 > 0.72  ✓
//   non-arm: r = 22 + 0.05^0.60 * 448  ≈ 95.0  → nearCore ≈ 0.76 > 0.72  ✓
//
// Tests that explicitly need large r use rRand=0.9999 and account for the
// short-circuit (no toneCheck call consumed).

// ─── gauss() ─────────────────────────────────────────────────────────────────
//
// gauss() = (r0 + r1 + r2 - 1.5) / 1.5
//
// random=0,0,0  => (0+0+0-1.5)/1.5 = -1
// random=1,1,1  => (1+1+1-1.5)/1.5 =  1
// random=0.5,0.5,0.5 => (1.5-1.5)/1.5 = 0

test('gauss: random=0,0,0 gives exactly -1', () => {
  const restore = mockRandom([0, 0, 0])
  try {
    assert.equal(gauss(), -1)
  } finally {
    restore()
  }
})

test('gauss: random=1,1,1 gives exactly 1', () => {
  const restore = mockRandom([1, 1, 1])
  try {
    assert.equal(gauss(), 1)
  } finally {
    restore()
  }
})

test('gauss: random=0.5,0.5,0.5 gives exactly 0', () => {
  const restore = mockRandom([0.5, 0.5, 0.5])
  try {
    assert.equal(gauss(), 0)
  } finally {
    restore()
  }
})

test('gauss: result stays in [-1, 1] over 1000 real-random calls', () => {
  // real Math.random already restored between tests
  for (let i = 0; i < 1000; i++) {
    const v = gauss()
    assert.ok(v >= -1 && v <= 1, `gauss out of range at iteration ${i}: ${v}`)
  }
})

// ─── makeDust(): inArm branch ─────────────────────────────────────────────────

test('makeDust inArm: r is within [22, 22+DISC]', () => {
  // rRand=0.05 => r = 22 + 0.05^0.85 * 400 ≈ 51.8; nearCore ≈ 0.87 > 0.72
  // Sequence (inArm, no short-circuit on toneCheck):
  //   0.1   inArm=true
  //   0.05  r
  //   0     arm index
  //   0.5, 0.5, 0.5  gauss => 0
  //   0.5   ring=false
  //   0.5   size
  //   0.5   toneCheck (nearCore>0.72, 0.5<0.7 => TONES[4])
  //   0.5   alpha
  //   0.5   phase
  const restore = mockRandom([0.1, 0.05, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
  try {
    const d = makeDust()
    assert.ok(d.r >= 22, `r=${d.r} should be >= 22`)
    assert.ok(d.r <= 22 + DISC, `r=${d.r} should be <= ${22 + DISC}`)
  } finally {
    restore()
  }
})

test('makeDust inArm: alpha in [0.62, 1.0]', () => {
  // rRand=0.05 => nearCore > 0.72; toneCheck=0.5<0.7 => TONES[4] (no index call)
  // alpha call is at position 9
  for (const alphaRand of [0, 0.5, 1]) {
    const restore = mockRandom([
      0.1,              // inArm=true
      0.05,             // r  (nearCore ≈ 0.87)
      0,                // arm index
      0.5, 0.5, 0.5,   // gauss => 0
      0.5,              // ring=false
      0.5,              // size
      0.5,              // toneCheck: 0.5 < 0.7 => TONES[4]
      alphaRand,        // alpha
      0.5,              // phase
    ])
    try {
      const d = makeDust()
      assert.ok(d.alpha >= 0.62, `alpha=${d.alpha} should be >= 0.62`)
      assert.ok(d.alpha <= 1.0, `alpha=${d.alpha} should be <= 1.0`)
    } finally {
      restore()
    }
  }
})

test('makeDust inArm: arm angle uses ARMS spacing and TWIST*log(r/22)', () => {
  // arm index = 1 (armRand=0.999 => (0.999*2)|0 = 1), armBase = 1*(2π/2) = π
  // gauss()=0 => spread contribution = 0
  // a = π + TWIST * log(r/22)
  // rRand=0.05 => nearCore > 0.72; toneCheck=0.5<0.7 => TONES[4]
  const restore = mockRandom([
    0.1,              // inArm=true
    0.05,             // r  (nearCore ≈ 0.87)
    0.999,            // arm index => 1
    0.5, 0.5, 0.5,   // gauss => 0
    0.5,              // ring=false
    0.5,              // size
    0.5,              // toneCheck: TONES[4]
    0.5,              // alpha
    0.5,              // phase
  ])
  try {
    const d = makeDust()
    const expectedArmBase = 1 * ((Math.PI * 2) / ARMS)
    const expectedA = expectedArmBase + TWIST * Math.log(d.r / 22) + 0 // gauss=0
    assert.ok(
      Math.abs(d.a - expectedA) < 1e-10,
      `angle ${d.a} should equal ${expectedA}`,
    )
  } finally {
    restore()
  }
})

// ─── makeDust(): non-arm branch ───────────────────────────────────────────────

test('makeDust non-arm: r is within [22, 22 + DISC*1.12]', () => {
  // rRand=0.05 => r = 22 + 0.05^0.6 * 448 ≈ 95; nearCore ≈ 0.76 > 0.72
  // Sequence:
  //   0.74  inArm=false
  //   0.05  r
  //   0     arm (unused for angle)
  //   0.5   angle
  //   0.5   ring=false
  //   0.5   size
  //   0.5   toneCheck (nearCore>0.72, 0.5<0.7 => TONES[4])
  //   0.5   alpha
  //   0.5   phase
  const restore = mockRandom([0.74, 0.05, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
  try {
    const d = makeDust()
    assert.ok(d.r >= 22, `r=${d.r} should be >= 22`)
    assert.ok(d.r <= 22 + DISC * 1.12, `r=${d.r} should be <= ${22 + DISC * 1.12}`)
  } finally {
    restore()
  }
})

test('makeDust non-arm: angle in [0, 2π)', () => {
  // rRand=0.05 => nearCore ≈ 0.76 > 0.72; toneCheck consumed
  for (const angleRand of [0, 0.5, 0.9999]) {
    const restore = mockRandom([
      0.74,             // inArm=false
      0.05,             // r  (nearCore > 0.72)
      0,                // arm (unused)
      angleRand,        // angle = angleRand * 2π
      0.5,              // ring=false
      0.5,              // size
      0.5,              // toneCheck: TONES[4]
      0.5,              // alpha
      0.5,              // phase
    ])
    try {
      const d = makeDust()
      assert.ok(d.a >= 0, `a=${d.a} should be >= 0`)
      assert.ok(d.a < Math.PI * 2, `a=${d.a} should be < 2π`)
    } finally {
      restore()
    }
  }
})

test('makeDust non-arm: alpha in [0.28, 0.66]', () => {
  // rRand=0.05 => nearCore ≈ 0.76 > 0.72; toneCheck consumed
  for (const alphaRand of [0, 0.5, 1]) {
    const restore = mockRandom([
      0.74,             // inArm=false
      0.05,             // r  (nearCore > 0.72)
      0,                // arm
      0.5,              // angle
      0.5,              // ring=false
      0.5,              // size
      0.5,              // toneCheck: TONES[4]
      alphaRand,        // alpha
      0.5,              // phase
    ])
    try {
      const d = makeDust()
      assert.ok(d.alpha >= 0.28, `alpha=${d.alpha} should be >= 0.28`)
      assert.ok(d.alpha <= 0.66, `alpha=${d.alpha} should be <= 0.66`)
    } finally {
      restore()
    }
  }
})

// ─── makeDust(): ring flag ────────────────────────────────────────────────────

test('makeDust inArm: ring=true when ring-random < 0.05, size in [3, 10)', () => {
  // ring random = 0.04 => ring=true
  // size = 3 + sizeRand*7  (sizeRand=0 => 3, sizeRand=0.9999 => ~10)
  // rRand=0.05 => nearCore > 0.72; toneCheck consumed
  for (const sizeRand of [0, 0.5, 0.9999]) {
    const restore = mockRandom([
      0.1,              // inArm=true
      0.05,             // r
      0,                // arm index
      0.5, 0.5, 0.5,   // gauss
      0.04,             // ring=true
      sizeRand,         // size random
      0.5,              // toneCheck: TONES[4]
      0.5,              // alpha
      0.5,              // phase
    ])
    try {
      const d = makeDust()
      assert.equal(d.ring, true, 'ring should be true')
      assert.ok(d.size >= 3, `ring size ${d.size} should be >= 3`)
      assert.ok(d.size < 10, `ring size ${d.size} should be < 10`)
    } finally {
      restore()
    }
  }
})

test('makeDust non-arm: ring=true when ring-random < 0.05, size in [3, 10)', () => {
  // rRand=0.05 => nearCore > 0.72; toneCheck consumed
  for (const sizeRand of [0, 0.5, 0.9999]) {
    const restore = mockRandom([
      0.74,             // inArm=false
      0.05,             // r
      0,                // arm
      0.5,              // angle
      0.04,             // ring=true
      sizeRand,         // size
      0.5,              // toneCheck: TONES[4]
      0.5,              // alpha
      0.5,              // phase
    ])
    try {
      const d = makeDust()
      assert.equal(d.ring, true)
      assert.ok(d.size >= 3, `ring size ${d.size} >= 3`)
      assert.ok(d.size < 10, `ring size ${d.size} < 10`)
    } finally {
      restore()
    }
  }
})

test('makeDust: ring=false when ring-random >= 0.05', () => {
  // rRand=0.05 => nearCore > 0.72; toneCheck consumed
  const restore = mockRandom([
    0.1,              // inArm=true
    0.05,             // r
    0,                // arm index
    0.5, 0.5, 0.5,   // gauss
    0.05,             // ring=false (NOT < 0.05)
    0.5,              // size
    0.5,              // toneCheck: TONES[4]
    0.5,              // alpha
    0.5,              // phase
  ])
  try {
    const d = makeDust()
    assert.equal(d.ring, false)
  } finally {
    restore()
  }
})

// ─── makeDust(): non-ring size ────────────────────────────────────────────────

test('makeDust: non-ring size >= 0.6 (sizeRand=0, nearCore driven)', () => {
  // Use rRand=0.9999 so nearCore ≈ 0 and size = 0.6 + 0*2 + 0*0.6 = 0.6
  // nearCore ≈ 0 <= 0.72 => JS short-circuit: toneCheck random NOT consumed.
  // TONES index is the very next call after size.
  // toneIndexRand=0.2 => (0.2*5)|0=1 => TONES[1]
  const restore = mockRandom([
    0.1,              // inArm=true
    0.9999,           // r (large, nearCore ≈ 0)
    0,                // arm index
    0.5, 0.5, 0.5,   // gauss
    0.5,              // ring=false
    0,                // sizeRand=0 => minimum size
    // no toneCheck consumed (nearCore <= 0.72 => short-circuit)
    0.2,              // TONES index: (0.2*5)|0=1
    0.5,              // alpha
    0.5,              // phase
  ])
  try {
    const d = makeDust()
    assert.ok(!d.ring)
    assert.ok(d.size >= 0.6, `non-ring size ${d.size} should be >= 0.6`)
  } finally {
    restore()
  }
})

// ─── makeDust(): tone ─────────────────────────────────────────────────────────

test('makeDust: tone is always a member of TONES', () => {
  // Two cases: near-core (TONES[4]) and normal index
  const cases: Array<{ seq: number[]; label: string }> = [
    {
      // near-core path: rRand=0.05, nearCore≈0.87>0.72; toneCheck=0.5<0.7 => TONES[4]
      seq: [0.1, 0.05, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      label: 'near-core',
    },
    {
      // large r: nearCore<=0.72 => short-circuit; TONES index=(0.2*5)|0=1
      seq: [0.1, 0.9999, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.2, 0.5, 0.5],
      label: 'large-r',
    },
  ]
  for (const { seq, label } of cases) {
    const restore = mockRandom(seq)
    try {
      const d = makeDust()
      assert.ok(
        TONES.some(t => t === d.tone),
        `[${label}] tone should be a reference from TONES`,
      )
    } finally {
      restore()
    }
  }
})

test('makeDust: near-core white tone (TONES[4]) when nearCore>0.72 and toneRandom<0.7', () => {
  // rRand=0.05 => r ≈ 51.8, nearCore ≈ 0.87 > 0.72 ✓
  // toneCheck=0.5 < 0.7 => TONES[4] ✓
  const restore = mockRandom([
    0.1,              // inArm=true
    0.05,             // r => nearCore ≈ 0.87
    0,                // arm index
    0.5, 0.5, 0.5,   // gauss
    0.5,              // ring=false
    0.5,              // size
    0.5,              // toneCheck: 0.5 < 0.7 => TONES[4]
    0.5,              // alpha
    0.5,              // phase
  ])
  try {
    const d = makeDust()
    assert.equal(d.tone, TONES[4], 'near-core tone should be TONES[4]')
  } finally {
    restore()
  }
})

test('makeDust: TONES index path when nearCore>0.72 but toneRandom>=0.7', () => {
  // rRand=0.05 => nearCore ≈ 0.87 > 0.72; toneCheck=0.8>=0.7 => falls to index
  // tonesIndexRand=0.4 => (0.4*5)|0=2 => TONES[2]
  const restore = mockRandom([
    0.1,              // inArm=true
    0.05,             // r => nearCore ≈ 0.87
    0,                // arm index
    0.5, 0.5, 0.5,   // gauss
    0.5,              // ring=false
    0.5,              // size
    0.8,              // toneCheck: 0.8 >= 0.7 => index branch
    0.4,              // TONES index: (0.4*5)|0=2
    0.5,              // alpha
    0.5,              // phase
  ])
  try {
    const d = makeDust()
    assert.equal(d.tone, TONES[2], `tone should be TONES[2]`)
  } finally {
    restore()
  }
})

test('makeDust: TONES index path when nearCore<=0.72 (short-circuit, no toneCheck call)', () => {
  // rRand=0.9999 => r ≈ 422, nearCore ≈ 0; NOT > 0.72 => short-circuit.
  // The random() for toneCheck is NEVER called.
  // First random after size goes directly to TONES index.
  // tonesIndexRand=0.6 => (0.6*5)|0=3 => TONES[3]
  const restore = mockRandom([
    0.1,              // inArm=true
    0.9999,           // r large => nearCore ≈ 0 (short-circuit)
    0,                // arm index
    0.5, 0.5, 0.5,   // gauss
    0.5,              // ring=false
    0.5,              // size
    // no toneCheck call (nearCore <= 0.72)
    0.6,              // TONES index: (0.6*5)|0=3
    0.5,              // alpha
    0.5,              // phase
  ])
  try {
    const d = makeDust()
    assert.equal(d.tone, TONES[3])
  } finally {
    restore()
  }
})

// ─── makeDust(): phase ────────────────────────────────────────────────────────

test('makeDust: phase in [0, 2π)', () => {
  // rRand=0.05 => nearCore > 0.72; toneCheck consumed
  for (const phaseRand of [0, 0.5, 0.9999]) {
    const restore = mockRandom([
      0.1,              // inArm=true
      0.05,             // r
      0,                // arm index
      0.5, 0.5, 0.5,   // gauss
      0.5,              // ring=false
      0.5,              // size
      0.5,              // toneCheck: TONES[4]
      0.5,              // alpha
      phaseRand,        // phase
    ])
    try {
      const d = makeDust()
      assert.ok(d.phase >= 0, `phase=${d.phase} should be >= 0`)
      assert.ok(d.phase < Math.PI * 2, `phase=${d.phase} should be < 2π`)
    } finally {
      restore()
    }
  }
})

// ─── makeDust(): 1000 real-random calls — all fields finite ──────────────────

test('makeDust: 1000 real-random calls — all fields finite and within formula bounds', () => {
  // Uses real Math.random (restored between tests by runner).
  const TWO_PI = Math.PI * 2
  for (let i = 0; i < 1000; i++) {
    const d = makeDust()
    assert.ok(Number.isFinite(d.r),     `[${i}] r is not finite: ${d.r}`)
    assert.ok(Number.isFinite(d.a),     `[${i}] a is not finite: ${d.a}`)
    assert.ok(Number.isFinite(d.size),  `[${i}] size is not finite: ${d.size}`)
    assert.ok(Number.isFinite(d.alpha), `[${i}] alpha is not finite: ${d.alpha}`)
    assert.ok(Number.isFinite(d.phase), `[${i}] phase is not finite: ${d.phase}`)
    assert.ok(typeof d.ring === 'boolean', `[${i}] ring is not boolean`)
    assert.ok(TONES.some(t => t === d.tone), `[${i}] tone is not in TONES`)

    // r: minimum 22; maximum 22 + DISC*1.12 (non-arm extends furthest)
    assert.ok(d.r >= 22, `[${i}] r=${d.r} should be >= 22`)
    assert.ok(d.r <= 22 + DISC * 1.12, `[${i}] r=${d.r} should be <= ${22 + DISC * 1.12}`)

    // alpha: inArm => [0.62, 1.0]; non-arm => [0.28, 0.66]; union => [0.28, 1.0]
    // Exact upper bound: max(0.62, 0.28) + 1*0.38 = 1.0
    assert.ok(d.alpha >= 0.28, `[${i}] alpha=${d.alpha} should be >= 0.28`)
    assert.ok(d.alpha <= 1.0,  `[${i}] alpha=${d.alpha} should be <= 1.0`)

    // size: ring in [3, 10); non-ring >= 0.6
    if (d.ring) {
      assert.ok(d.size >= 3,  `[${i}] ring size ${d.size} should be >= 3`)
      assert.ok(d.size < 10,  `[${i}] ring size ${d.size} should be < 10`)
    } else {
      assert.ok(d.size >= 0.6, `[${i}] non-ring size ${d.size} should be >= 0.6`)
    }

    // phase in [0, 2π)
    assert.ok(d.phase >= 0,      `[${i}] phase=${d.phase} should be >= 0`)
    assert.ok(d.phase < TWO_PI,  `[${i}] phase=${d.phase} should be < 2π`)
  }
})

// ─── Exact-value tests (pin the formulas and thresholds) ──────────────────────

function near(actual: number, expected: number, msg: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: got ${actual}, expected ${expected}`)
}

test('makeDust: arm path at inArm=0.6 gives exact r, angle, size, alpha', () => {
  const restore = mockRandom([0.6, 0.5, 0, 1, 1, 1, 0.9, 0.5, 0.5, 0.5, 0.5])
  try {
    const d = makeDust()
    const r = 22 + Math.pow(0.5, 0.85) * DISC
    const spread = 0.2 + (r / DISC) * 0.26
    near(d.r, r, 'r')
    near(d.a, 0 + TWIST * Math.log(r / 22) + 1 * spread, 'angle')
    near(d.size, 0.6 + 0.5 * 2 + (1 - r / DISC) * 0.6, 'size')
    near(d.alpha, 0.62 + 0.5 * 0.38, 'alpha')
    assert.equal(d.ring, false)
  } finally {
    restore()
  }
})

test('makeDust: rRand=0 puts the dust exactly at the inner radius 22', () => {
  const restore = mockRandom([0.1, 0, 0, 0.5, 0.5, 0.5, 0.9, 0.5, 0.9, 0.5, 0.5, 0.5])
  try {
    assert.equal(makeDust().r, 22)
  } finally {
    restore()
  }
})

test('makeDust: nearCore just under 0.72 skips the white-tone roll', () => {
  const x = Math.pow(0.235, 1 / 0.85) // r = 22 + 0.235*DISC = 116, nearCore = 0.71
  const restore = mockRandom([0.1, x, 0, 0.5, 0.5, 0.5, 0.9, 0.5, 0.0, 0.5, 0.5])
  try {
    const d = makeDust()
    near(1 - d.r / DISC, 0.71, 'nearCore')
    assert.equal(d.tone, TONES[0])
  } finally {
    restore()
  }
})

test('makeDust: ring dust size is 3 + x*7', () => {
  const restore = mockRandom([0.1, 0.5, 0, 0.5, 0.5, 0.5, 0.01, 0.5, 0.5, 0.5, 0.5])
  try {
    const d = makeDust()
    assert.equal(d.ring, true)
    near(d.size, 3 + 0.5 * 7, 'ring size')
  } finally {
    restore()
  }
})

// ─── Ensure Math.random is the original function after all tests ──────────────

test('Math.random is the original function after all mock-based tests', () => {
  assert.equal(Math.random, originalRandom, 'Math.random was not restored')
})

// ─── Runner ───────────────────────────────────────────────────────────────────

for (const [name, fn] of tests) {
  // Always restore real Math.random before each test so a prior failure cannot
  // leave a mock in place and corrupt subsequent tests.
  restoreRandom()
  try {
    await fn()
    passed++
  } catch (err) {
    console.error(`FAIL: ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

// Final restore guard
restoreRandom()

console.log(`${passed}/${tests.length} tests passed`)
