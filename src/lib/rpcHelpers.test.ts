/**
 * Unit tests for rpcHelpers.ts
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/rpcHelpers.test.ts
 *
 * Design constraints:
 *  - plain node:assert/strict, no test framework
 *  - withRetry sleeps 700 ms then 1400 ms… — at most 2 retry-sleeps total
 *  - inGroups pauseMs kept at 1–5 ms so the suite finishes in < 8 s
 */

import assert from 'node:assert/strict'
import {
  MAX_LOG_RANGE,
  blockWindows,
  isRateLimit,
  withRetry,
  inGroups,
  readCache,
  writeCache,
} from './rpcHelpers.ts'

// ---------------------------------------------------------------------------
// Tiny harness: every check() always returns a Promise so callers can await it.
// ---------------------------------------------------------------------------
let pass = 0
let total = 0
const failures: string[] = []

async function check(
  label: string,
  fnOrActual: unknown,
  expected?: unknown,
): Promise<void> {
  total++
  try {
    if (typeof fnOrActual === 'function' && arguments.length === 2) {
      await (fnOrActual as () => unknown | Promise<unknown>)()
    } else {
      assert.deepEqual(fnOrActual, expected)
    }
    console.log(`  ✓ ${label}`)
    pass++
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ✗ ${label}\n      ${msg}`)
    failures.push(label)
  }
}

// ---------------------------------------------------------------------------
// Fake sessionStorage — installed before any cache tests run
// ---------------------------------------------------------------------------
const fakeStore = new Map<string, string>()
const fakeSessionStorage = {
  getItem(key: string): string | null { return fakeStore.get(key) ?? null },
  setItem(key: string, value: string): void { fakeStore.set(key, value) },
  removeItem(key: string): void { fakeStore.delete(key) },
}
;(globalThis as unknown as { sessionStorage: typeof fakeSessionStorage }).sessionStorage =
  fakeSessionStorage

// ---------------------------------------------------------------------------
// Helper: make a rate-limit error
// ---------------------------------------------------------------------------
function rlErr(msg = 'rate limit exceeded'): Error { return new Error(msg) }

// ===========================================================================
// Run all tests, collecting promises
// ===========================================================================
const all: Promise<void>[] = []

// Overloaded dispatcher — uses a sentinel to distinguish the two forms
const SYNC_SENTINEL = Symbol('sync')
function t(label: string, fn: () => unknown | Promise<unknown>): void
function t(label: string, actual: unknown, expected: unknown): void
function t(label: string, fnOrActual: unknown, expected: unknown = SYNC_SENTINEL): void {
  if (expected === SYNC_SENTINEL) {
    // async / thunk form
    all.push(check(label, fnOrActual as () => unknown))
  } else {
    // sync value form
    all.push(check(label, fnOrActual, expected))
  }
}

// ---------------------------------------------------------------------------
// Helper: verify window coverage for blockWindows
// ---------------------------------------------------------------------------
function assertCoverage(from: bigint, to: bigint): void {
  const wins = blockWindows(from, to)
  for (const [lo, hi] of wins) {
    assert.ok(hi - lo + 1n <= BigInt(MAX_LOG_RANGE), `window too wide: [${lo},${hi}]`)
  }
  if (wins.length > 0) {
    assert.equal(wins[0][1], to, 'newest window hi !== to')
    assert.equal(wins[wins.length - 1][0], from, 'oldest window lo !== from')
    for (let i = 0; i < wins.length - 1; i++) {
      assert.equal(
        wins[i][0] - 1n,
        wins[i + 1][1],
        `gap or overlap between windows ${i} and ${i + 1}`,
      )
    }
  }
}

// ===========================================================================
// 1. MAX_LOG_RANGE
// ===========================================================================
console.log('\nMAX_LOG_RANGE')
t('value is 9000', MAX_LOG_RANGE, 9000)

// ===========================================================================
// 2. blockWindows
// ===========================================================================
console.log('\nblockWindows')

t('range shorter than one window — single [from,to]', () => {
  const r = blockWindows(100n, 500n)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], [100n, 500n])
})

t('from === to — one window [n,n]', () => {
  const r = blockWindows(42n, 42n)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], [42n, 42n])
})

t('exactly 9000 blocks (from=1,to=9000) — one window [1n,9000n]', () => {
  const r = blockWindows(1n, 9000n)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], [1n, 9000n])
})

t('9001 blocks — two windows, newest first, valid coverage', () => {
  // from=1, to=9001: 9001 block span
  // hi=9001, lo = 9001-8999 = 1002 (> from=1) → [1002,9001]
  // hi=1001, lo = 1001-8999 < 1 → lo=from=1  → [1,1001]
  const r = blockWindows(1n, 9001n)
  assert.equal(r.length, 2, `expected 2 windows, got ${r.length}`)
  assert.equal(r[0][1], 9001n, 'newest window hi should be 9001')
  assert.equal(r[1][0], 1n, 'oldest window lo should be 1')
  assert.equal(r[0][0] - 1n, r[1][1], 'windows should be contiguous')
  for (const [lo, hi] of r) {
    assert.ok(hi - lo + 1n <= BigInt(MAX_LOG_RANGE), `window too wide: [${lo},${hi}]`)
  }
})

t('18000 blocks exactly — two full windows, no overlap, no gap', () => {
  // from=1, to=18000
  // hi=18000, lo=18000-8999=9001 → [9001,18000]
  // hi=9000,  lo=9000-8999=1    → [1,9000]
  const r = blockWindows(1n, 18000n)
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], [9001n, 18000n])
  assert.deepEqual(r[1], [1n, 9000n])
  assert.equal(r[0][0] - 1n, r[1][1])
})

t('all window lengths <= MAX_LOG_RANGE (property, several ranges)', () => {
  const ranges: [bigint, bigint][] = [
    [1n, 1n], [1n, 9000n], [1n, 9001n], [1n, 27000n], [500n, 18500n],
  ]
  for (const [from, to] of ranges) {
    const wins = blockWindows(from, to)
    for (const [lo, hi] of wins) {
      assert.ok(hi - lo + 1n <= BigInt(MAX_LOG_RANGE), `range [${from},${to}] produced wide window [${lo},${hi}]`)
    }
  }
})

t('windows are contiguous and cover [from,to] exactly once (property)', () => {
  const ranges: [bigint, bigint][] = [
    [1n, 1n],
    [1n, 9000n],
    [1n, 9001n],
    [1n, 18000n],
    [1n, 27001n],
    [100n, 20000n],
  ]
  for (const [from, to] of ranges) {
    assertCoverage(from, to)
  }
})

t('from > to — returns []', () => {
  assert.deepEqual(blockWindows(100n, 50n), [])
})

t('works with bigint beyond 2**53', () => {
  const big = 2n ** 54n
  const r = blockWindows(big, big + 8999n)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], [big, big + 8999n])
  assertCoverage(big, big + 20000n)
})

// ===========================================================================
// 3. isRateLimit
// ===========================================================================
console.log('\nisRateLimit')

t('true for Error "rate limit exceeded"',           () => assert.ok(isRateLimit(new Error('rate limit exceeded'))))
t('true for Error "Rate Limit" (case-insensitive)', () => assert.ok(isRateLimit(new Error('Rate Limit hit'))))
t('true for Error containing "429"',                () => assert.ok(isRateLimit(new Error('HTTP 429 Too Many Requests'))))
t('true for Error containing "-32005"',             () => assert.ok(isRateLimit(new Error('RPC error -32005 occurred'))))
t('true for Error containing "Too Many Requests"',  () => assert.ok(isRateLimit(new Error('Too Many Requests from your IP'))))
t('true when only .details says rate limit',        () => {
  const e = Object.assign(new Error('something'), { details: 'rate limit exceeded' })
  assert.ok(isRateLimit(e))
})
t('true for a plain string containing "rate limit"', () => assert.ok(isRateLimit('rate limit exceeded')))
t('true for a plain string containing "429"',        () => assert.ok(isRateLimit('status 429')))
t('false for "execution reverted"',                  () => assert.ok(!isRateLimit(new Error('execution reverted'))))
t('false for undefined',                             () => assert.ok(!isRateLimit(undefined)))
t('false for null',                                  () => assert.ok(!isRateLimit(null)))
t('false for a number',                              () => assert.ok(!isRateLimit(42)))

// ===========================================================================
// 4. withRetry
// ===========================================================================
console.log('\nwithRetry')

t('returns value on first success without sleeping', async () => {
  let calls = 0
  const val = await withRetry(async () => { calls++; return 'ok' })
  assert.equal(val, 'ok')
  assert.equal(calls, 1)
})

t('non-rate-limit error thrown immediately after exactly 1 call', async () => {
  let calls = 0
  const boom = new Error('execution reverted')
  await assert.rejects(
    withRetry(async () => { calls++; throw boom }),
    (e: unknown) => e === boom,
  )
  assert.equal(calls, 1)
})

// Budget: 1 sleep of 700 ms
t('rate-limit then success — returns value, 2 calls total', async () => {
  let calls = 0
  const val = await withRetry(async () => {
    calls++
    if (calls === 1) throw rlErr()
    return 'recovered'
  })
  assert.equal(val, 'recovered')
  assert.equal(calls, 2)
})

// Budget: 1 sleep of 700 ms (tries=2 → attempt 1 rl→sleep, attempt 2 rl→attempt>=tries→throw)
t('rate-limit forever with tries=2 — rejects with original error after 2 calls', async () => {
  let calls = 0
  const original = rlErr('rate limit always')
  await assert.rejects(
    withRetry(async () => { calls++; throw original }, 2),
    (e: unknown) => e === original,
  )
  assert.equal(calls, 2)
})

// ===========================================================================
// 5. inGroups
// ===========================================================================
console.log('\ninGroups')

t('results keep input order', async () => {
  const items = [1, 2, 3, 4, 5]
  const res = await inGroups(items, 3, 2, async (x) => x * 10)
  assert.deepEqual(res, [10, 20, 30, 40, 50])
})

t('group size respected: size=2 over 5 items → max concurrency ≤ 2', async () => {
  let concurrent = 0
  let maxConcurrent = 0
  const items = [1, 2, 3, 4, 5]
  await inGroups(items, 2, 1, async (x) => {
    concurrent++
    maxConcurrent = Math.max(maxConcurrent, concurrent)
    await new Promise(r => setTimeout(r, 2))
    concurrent--
    return x
  })
  assert.ok(maxConcurrent <= 2, `max concurrent was ${maxConcurrent}, expected ≤ 2`)
})

t('empty input -> []', async () => {
  const res = await inGroups([] as number[], 3, 1, async (x) => x)
  assert.deepEqual(res, [])
})

t('size larger than input works', async () => {
  const res = await inGroups([7, 8], 100, 1, async (x) => x + 1)
  assert.deepEqual(res, [8, 9])
})

t('non-rate-limit error inside fn rejects the whole call', async () => {
  const boom = new Error('execution reverted')
  await assert.rejects(
    inGroups([1, 2, 3], 2, 1, async (x) => {
      if (x === 2) throw boom
      return x
    }),
    (e: unknown) => e === boom,
  )
})

// ===========================================================================
// 6. readCache / writeCache
// ===========================================================================
console.log('\nreadCache / writeCache')

fakeStore.clear()

t('write then read returns the value', () => {
  writeCache('k1', { hello: 'world' })
  const v = readCache<{ hello: string }>('k1', 60_000)
  assert.deepEqual(v, { hello: 'world' })
})

t('read of missing key -> null', () => {
  assert.equal(readCache('missing', 60_000), null)
})

t('entry older than maxAgeMs -> null', () => {
  const stale = JSON.stringify({ at: Date.now() - 10_000, value: 'stale' })
  fakeStore.set('stale-key', stale)
  assert.equal(readCache('stale-key', 1_000), null)
})

t('exactly at boundary (age == maxAgeMs) is still valid', () => {
  const now = 1_000_000
  const originalNow = Date.now
  ;(Date as { now: () => number }).now = () => now
  // age = now - (now - 500) = 500, maxAgeMs = 500 → 500 <= 500 → valid
  fakeStore.set('boundary-key', JSON.stringify({ at: now - 500, value: 'boundary' }))
  const v = readCache<string>('boundary-key', 500)
  ;(Date as { now: () => number }).now = originalNow
  assert.equal(v, 'boundary')
})

t('corrupt JSON in storage -> null (no throw)', () => {
  fakeStore.set('corrupt', '{ not valid json !!!')
  assert.equal(readCache('corrupt', 60_000), null)
})

t('setItem that throws (quota) -> writeCache does not throw', () => {
  const brokenStorage = {
    getItem: () => null,
    setItem: (): void => { throw new Error('QuotaExceededError') },
    removeItem: () => {},
  }
  ;(globalThis as unknown as { sessionStorage: typeof brokenStorage }).sessionStorage = brokenStorage
  assert.doesNotThrow(() => writeCache('k', 'v'))
  ;(globalThis as unknown as { sessionStorage: typeof fakeSessionStorage }).sessionStorage =
    fakeSessionStorage
})

t('getItem that throws -> readCache returns null', () => {
  const brokenStorage = {
    getItem: (): null => { throw new Error('SecurityError') },
    setItem: () => {},
    removeItem: () => {},
  }
  ;(globalThis as unknown as { sessionStorage: typeof brokenStorage }).sessionStorage = brokenStorage
  assert.equal(readCache('k', 60_000), null)
  ;(globalThis as unknown as { sessionStorage: typeof fakeSessionStorage }).sessionStorage =
    fakeSessionStorage
})

// ===========================================================================
// Await all and print summary
// ===========================================================================
await Promise.all(all)

// ===========================================================================
// Timing behaviour, with setTimeout stubbed so nothing really sleeps.
// Runs after everything else because it swaps the global timer.
// ===========================================================================
async function withFakeTimers(run: (delays: number[]) => Promise<void>): Promise<void> {
  const real = globalThis.setTimeout
  const delays: number[] = []
  globalThis.setTimeout = ((fn: () => void, ms?: number) => { delays.push(ms ?? 0); fn(); return 0 }) as unknown as typeof setTimeout
  try { await run(delays) } finally { globalThis.setTimeout = real }
}
const limited = () => new Error('rate limit exceeded')

await check('withRetry backoff doubles from 700 and caps at 6000', () => withFakeTimers(async delays => {
  let calls = 0
  const v = await withRetry(async () => { if (++calls < 7) throw limited(); return 'ok' }, 7)
  assert.equal(v, 'ok')
  assert.deepEqual(delays, [700, 1400, 2800, 5600, 6000, 6000])
}))

await check('inGroups retries a rate-limited item and still returns its value', () => withFakeTimers(async delays => {
  const seen: Record<string, number> = {}
  const out = await inGroups(['a', 'b'], 2, 5, async x => {
    seen[x] = (seen[x] ?? 0) + 1
    if (x === 'a' && seen[x] === 1) throw limited()
    return x.toUpperCase()
  })
  assert.deepEqual(out, ['A', 'B'])
  assert.equal(seen.a, 2)
  assert.deepEqual(delays, [700])
}))

await check('inGroups pauses between groups only, not after the last', () => withFakeTimers(async delays => {
  await inGroups([1, 2, 3, 4, 5], 2, 11, async x => x)
  assert.deepEqual(delays, [11, 11]) // 3 groups -> 2 pauses
}))

await check('inGroups with a single group never pauses', () => withFakeTimers(async delays => {
  await inGroups([1, 2], 5, 11, async x => x)
  assert.deepEqual(delays, [])
}))

console.log(`\n${'─'.repeat(50)}`)
if (failures.length === 0) {
  console.log(`All ${pass}/${total} tests passed.`)
} else {
  console.log(`${pass}/${total} passed.  FAILED (${failures.length}):`)
  for (const f of failures) console.log(`  • ${f}`)
  process.exit(1)
}
