// run: node --experimental-strip-types --no-warnings src/lib/arcscanCore.test.ts

import assert from 'node:assert/strict'
import { NotFoundError, buildUrl, requestJson, createSlot } from './arcscanCore.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (err) {
    console.error(`  FAIL  ${name}`)
    console.error(`        ${err instanceof Error ? err.message : String(err)}`)
    if (err instanceof Error && err.stack) {
      const lines = err.stack.split('\n').slice(1, 4)
      for (const l of lines) console.error(`       ${l.trim()}`)
    }
    failed++
  }
}

/** Build a minimal fake Response promise whose .finally() works (it's a real Promise). */
function fakeRes(status: number, body: unknown): Promise<Response> {
  const ok = status >= 200 && status < 300
  const resp = {
    status,
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response
  return Promise.resolve(resp)
}

/** Sleep stub: records requested ms, resolves immediately. */
function makeSleep(): { sleep: (ms: number) => Promise<void>; calls: number[] } {
  const calls: number[] = []
  const sleep = (ms: number): Promise<void> => {
    calls.push(ms)
    return Promise.resolve()
  }
  return { sleep, calls }
}

/** Type for a fake fetchFn compatible with RequestDeps.fetchFn */
type FakeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

// ---------------------------------------------------------------------------
// NotFoundError
// ---------------------------------------------------------------------------

console.log('\nNotFoundError')

await test('is instance of Error', () => {
  const e: NotFoundError = new NotFoundError()
  assert.ok(e instanceof Error)
})

await test('is instance of NotFoundError', () => {
  const e: NotFoundError = new NotFoundError()
  assert.ok(e instanceof NotFoundError)
})

await test('message is "Not found"', () => {
  const e: NotFoundError = new NotFoundError()
  assert.equal(e.message, 'Not found')
})

// ---------------------------------------------------------------------------
// buildUrl
// ---------------------------------------------------------------------------

console.log('\nbuildUrl')

await test('no params -> api+path with no query string', () => {
  const result: string = buildUrl('https://api.example.com', '/v2/tokens')
  assert.equal(result, 'https://api.example.com/v2/tokens')
})

await test('empty params object -> no ?', () => {
  const result: string = buildUrl('https://api.example.com', '/v2/tokens', {})
  assert.ok(!result.includes('?'), `expected no '?' but got: ${result}`)
})

await test('params appended as query string in insertion order', () => {
  const result: string = buildUrl('https://api.example.com', '/v2/items', { page: 2, limit: 50 })
  assert.equal(result, 'https://api.example.com/v2/items?page=2&limit=50')
})

await test('null value becomes literal string "null"', () => {
  const result: string = buildUrl('https://api.example.com', '/v2/items', { cursor: null })
  assert.ok(result.includes('cursor=null'), `got: ${result}`)
})

await test('undefined value becomes literal string "null"', () => {
  const params: Record<string, unknown> = { cursor: undefined }
  const result: string = buildUrl('https://api.example.com', '/v2/items', params)
  assert.ok(result.includes('cursor=null'), `got: ${result}`)
})

await test('numbers are stringified', () => {
  const result: string = buildUrl('https://api.example.com', '/v2/items', { n: 42 })
  assert.ok(result.includes('n=42'), `got: ${result}`)
})

await test('booleans are stringified', () => {
  const result: string = buildUrl('https://api.example.com', '/v2/items', { flag: true })
  assert.ok(result.includes('flag=true'), `got: ${result}`)
})

await test('space is encoded (URLSearchParams -> +)', () => {
  const result: string = buildUrl('https://api.example.com', '/v2/items', { q: 'hello world' })
  assert.ok(result.includes('q=hello+world'), `got: ${result}`)
})

await test('& in value is percent-encoded as %26', () => {
  const result: string = buildUrl('https://api.example.com', '/v2/items', { q: 'a&b' })
  assert.ok(result.includes('q=a%26b'), `got: ${result}`)
})

await test('path with leading slash joins as given', () => {
  const result: string = buildUrl('https://api.example.com', '/some/path')
  assert.ok(result.startsWith('https://api.example.com/some/path'), `got: ${result}`)
})

// ---------------------------------------------------------------------------
// requestJson
// ---------------------------------------------------------------------------

console.log('\nrequestJson')

await test('200 -> returns parsed json, fetch called once, no sleeps', async () => {
  const { sleep, calls } = makeSleep()
  let fetchCalls = 0
  const fetchFn: FakeFetch = (_input, _init) => {
    fetchCalls++
    return fakeRes(200, { value: 'ok' })
  }
  const result = await requestJson<{ value: string }>('http://x', 5000, 3, { fetchFn, sleep })
  assert.deepEqual(result, { value: 'ok' })
  assert.equal(fetchCalls, 1)
  assert.equal(calls.length, 0)
})

await test('200 -> passes an AbortSignal in the fetch options', async () => {
  let receivedSignal: AbortSignal | undefined
  const fetchFn: FakeFetch = (_input, opts) => {
    receivedSignal = opts?.signal as AbortSignal | undefined
    return fakeRes(200, {})
  }
  await requestJson('http://x', 5000, 1, { fetchFn, sleep: makeSleep().sleep })
  assert.ok(receivedSignal instanceof AbortSignal)
})

await test('404 -> throws NotFoundError immediately, 1 call, no sleep', async () => {
  const { sleep, calls } = makeSleep()
  let fetchCalls = 0
  const fetchFn: FakeFetch = () => {
    fetchCalls++
    return fakeRes(404, null)
  }
  await assert.rejects(
    () => requestJson('http://x', 5000, 4, { fetchFn, sleep }),
    (err: unknown) => err instanceof NotFoundError,
  )
  assert.equal(fetchCalls, 1)
  assert.equal(calls.length, 0)
})

await test('500 always -> retries 3x, sleeps [500,1000,1500], throws ArcScan 500', async () => {
  const { sleep, calls } = makeSleep()
  let fetchCalls = 0
  const fetchFn: FakeFetch = () => {
    fetchCalls++
    return fakeRes(500, null)
  }
  await assert.rejects(
    () => requestJson('http://x', 5000, 3, { fetchFn, sleep }),
    (err: unknown) => err instanceof Error && err.message === 'ArcScan 500',
  )
  assert.equal(fetchCalls, 3)
  assert.deepEqual(calls, [500, 1000, 1500])
})

await test('500 then 200 -> returns value, sleeps [500]', async () => {
  const { sleep, calls } = makeSleep()
  let fetchCalls = 0
  const fetchFn: FakeFetch = () => {
    fetchCalls++
    return fetchCalls === 1 ? fakeRes(500, null) : fakeRes(200, { ok: true })
  }
  const result = await requestJson<{ ok: boolean }>('http://x', 5000, 3, { fetchFn, sleep })
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [500])
})

await test('429 x2 then 200 -> returns value, sleeps [900,1800] (no extra 500ms)', async () => {
  const { sleep, calls } = makeSleep()
  let fetchCalls = 0
  const fetchFn: FakeFetch = () => {
    fetchCalls++
    if (fetchCalls <= 2) return fakeRes(429, null)
    return fakeRes(200, { result: 42 })
  }
  const result = await requestJson<{ result: number }>('http://x', 5000, 4, { fetchFn, sleep })
  assert.deepEqual(result, { result: 42 })
  assert.deepEqual(calls, [900, 1800])
})

await test('always 429 with attempts=2 -> sleeps [900,1800], throws "ArcScan request failed"', async () => {
  // 429 uses `continue`, so lastError is never set -> throws generic message
  const { sleep, calls } = makeSleep()
  const fetchFn: FakeFetch = () => fakeRes(429, null)
  await assert.rejects(
    () => requestJson('http://x', 5000, 2, { fetchFn, sleep }),
    (err: unknown) => err instanceof Error && err.message === 'ArcScan request failed',
  )
  assert.deepEqual(calls, [900, 1800])
})

await test('network error then success -> sleeps [500], returns value', async () => {
  const { sleep, calls } = makeSleep()
  let fetchCalls = 0
  const fetchFn: FakeFetch = () => {
    fetchCalls++
    if (fetchCalls === 1) return Promise.reject(new Error('network failure'))
    return fakeRes(200, { data: 'yes' })
  }
  const result = await requestJson<{ data: string }>('http://x', 5000, 3, { fetchFn, sleep })
  assert.deepEqual(result, { data: 'yes' })
  assert.deepEqual(calls, [500])
})

await test('always rejecting Error("boom") with attempts=2 -> throws same error, sleeps [500,1000]', async () => {
  const { sleep, calls } = makeSleep()
  const boom = new Error('boom')
  const fetchFn: FakeFetch = () => Promise.reject(boom)
  await assert.rejects(
    () => requestJson('http://x', 5000, 2, { fetchFn, sleep }),
    (err: unknown) => err === boom,
  )
  assert.deepEqual(calls, [500, 1000])
})

await test('always rejecting with non-Error string after all attempts -> throws Error("ArcScan request failed")', async () => {
  const { sleep } = makeSleep()
  // oxlint-disable-next-line typescript/prefer-promise-reject-errors
  const fetchFn: FakeFetch = () => Promise.reject('oops')
  await assert.rejects(
    () => requestJson('http://x', 5000, 2, { fetchFn, sleep }),
    (err: unknown) => err instanceof Error && err.message === 'ArcScan request failed',
  )
})

await test('attempts=1 and 500 -> 1 call, throws "ArcScan 500", 1 sleep of 500', async () => {
  // The catch block records lastError and sleeps 500*(0+1)=500 after the single failed attempt
  const { sleep, calls } = makeSleep()
  let fetchCalls = 0
  const fetchFn: FakeFetch = () => {
    fetchCalls++
    return fakeRes(500, null)
  }
  await assert.rejects(
    () => requestJson('http://x', 5000, 1, { fetchFn, sleep }),
    (err: unknown) => err instanceof Error && err.message === 'ArcScan 500',
  )
  assert.equal(fetchCalls, 1)
  assert.deepEqual(calls, [500])
})

await test('res.json() rejecting -> treated as failure, retried', async () => {
  const { sleep, calls } = makeSleep()
  let fetchCalls = 0
  const fetchFn: FakeFetch = () => {
    fetchCalls++
    const resp = {
      status: 200,
      ok: true,
      json: () => Promise.reject(new Error('parse error')),
    } as unknown as Response
    return Promise.resolve(resp)
  }
  await assert.rejects(
    () => requestJson('http://x', 5000, 2, { fetchFn, sleep }),
    (err: unknown) => err instanceof Error && err.message === 'parse error',
  )
  assert.equal(fetchCalls, 2)
  assert.deepEqual(calls, [500, 1000])
})

// ---------------------------------------------------------------------------
// createSlot
// ---------------------------------------------------------------------------

console.log('\ncreateSlot')

await test('max=2: up to 2 jobs run concurrently; all 5 results returned', async () => {
  const slot = createSlot(2)
  let maxObserved = 0
  let currentlyRunning = 0

  const resolvers: Array<() => void> = []
  const makeJob = (value: number): (() => Promise<number>) => () => {
    currentlyRunning++
    if (currentlyRunning > maxObserved) maxObserved = currentlyRunning
    return new Promise<number>(resolve => {
      resolvers.push(() => {
        currentlyRunning--
        resolve(value)
      })
    })
  }

  const promises: Array<Promise<number>> = []
  for (let i = 0; i < 5; i++) {
    promises.push(slot(makeJob(i), 1))
  }

  // Flush microtasks so slots fill up
  await Promise.resolve()
  await Promise.resolve()

  // Resolve all queued resolvers one by one
  while (resolvers.length > 0) {
    resolvers.shift()!()
    await Promise.resolve()
    await Promise.resolve()
  }

  const results: number[] = await Promise.all(promises)
  assert.deepEqual(results.sort((a, b) => a - b), [0, 1, 2, 3, 4])
  assert.equal(maxObserved, 2)
})

await test('max=1: jobs run strictly one at a time', async () => {
  const slot = createSlot(1)
  const order: number[] = []
  let active = 0
  let maxActive = 0

  const resolvers: Array<() => void> = []
  const makeJob = (id: number): (() => Promise<void>) => () => {
    active++
    if (active > maxActive) maxActive = active
    return new Promise<void>(resolve => {
      resolvers.push(() => {
        order.push(id)
        active--
        resolve()
      })
    })
  }

  const p0: Promise<void> = slot(makeJob(0), 1)
  const p1: Promise<void> = slot(makeJob(1), 1)
  const p2: Promise<void> = slot(makeJob(2), 1)

  await Promise.resolve()
  await Promise.resolve()

  while (resolvers.length > 0) {
    resolvers.shift()!()
    await Promise.resolve()
    await Promise.resolve()
  }

  await Promise.all([p0, p1, p2])
  assert.equal(maxActive, 1)
  assert.deepEqual(order, [0, 1, 2])
})

await test('priority ordering: lower priority number starts first', async () => {
  const slot = createSlot(1)
  const started: number[] = []

  let releaseFirst!: () => void
  const firstJobDone = new Promise<void>(r => { releaseFirst = r })

  // Start the blocker (priority 0) — it occupies the slot
  const blocker: Promise<void> = slot(() => firstJobDone, 0)

  // Let the blocker acquire the slot
  await Promise.resolve()
  await Promise.resolve()

  // Enqueue three jobs (slot is full) with different priorities
  const makeQueued = (id: number): (() => Promise<void>) => () => {
    started.push(id)
    return Promise.resolve()
  }

  const p5: Promise<void> = slot(makeQueued(5), 5)
  const p1: Promise<void> = slot(makeQueued(1), 1)
  const p3: Promise<void> = slot(makeQueued(3), 3)

  await Promise.resolve()

  // Release the blocker; remaining jobs run one by one
  releaseFirst()
  await blocker

  // Drain: each released job is a microtask
  for (let i = 0; i < 10; i++) await Promise.resolve()

  await Promise.all([p5, p1, p3])
  assert.deepEqual(started, [1, 3, 5])
})

await test('same-priority jobs keep arrival order', async () => {
  const slot = createSlot(1)
  const started: number[] = []

  let releaseFirst!: () => void
  const firstDone = new Promise<void>(r => { releaseFirst = r })
  const blocker: Promise<void> = slot(() => firstDone, 0)

  await Promise.resolve()
  await Promise.resolve()

  const makeQueued = (id: number): (() => Promise<void>) => () => {
    started.push(id)
    return Promise.resolve()
  }

  const pA: Promise<void> = slot(makeQueued(10), 2)
  const pB: Promise<void> = slot(makeQueued(20), 2)
  const pC: Promise<void> = slot(makeQueued(30), 2)

  await Promise.resolve()
  releaseFirst()
  await blocker

  for (let i = 0; i < 10; i++) await Promise.resolve()
  await Promise.all([pA, pB, pC])

  assert.deepEqual(started, [10, 20, 30])
})

await test('a throwing job frees the slot and rejection propagates to caller', async () => {
  const slot = createSlot(1)
  const bang = new Error('bang')

  let threwProperly = false
  try {
    await slot((): Promise<never> => Promise.reject(bang), 1)
  } catch (err) {
    threwProperly = err === bang
  }
  assert.ok(threwProperly, 'rejection should propagate to caller')

  // Slot should now be free — a subsequent job runs immediately
  const result: number = await slot((): Promise<number> => Promise.resolve(99), 1)
  assert.equal(result, 99)
})

await test('return value of run() is passed through', async () => {
  const slot = createSlot(2)
  const result: string = await slot((): Promise<string> => Promise.resolve('hello'), 1)
  assert.equal(result, 'hello')
})

// ---------------------------------------------------------------------------
// The abort timer must be cleared once the request is done (added after mutation checks)
// ---------------------------------------------------------------------------
await test('requestJson clears its abort timer after a successful response', async () => {
  let seen: AbortSignal | undefined
  const fetchFn = ((_url: string, init?: RequestInit) => {
    seen = init?.signal ?? undefined
    return fakeRes(200, { ok: true })
  }) as unknown as typeof fetch
  await requestJson('http://x', 20, 1, { fetchFn, sleep: makeSleep().sleep })
  await new Promise<void>(r => setTimeout(r, 60)) // well past the 20 ms timeout
  assert.equal(seen?.aborted, false)
})

await test('requestJson aborts a request that outlives its timeout', async () => {
  let seen: AbortSignal | undefined
  const fetchFn = ((_url: string, init?: RequestInit) => {
    seen = init?.signal ?? undefined
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })
  }) as unknown as typeof fetch
  await assert.rejects(() => requestJson('http://x', 20, 1, { fetchFn, sleep: makeSleep().sleep }), /aborted/)
  assert.equal(seen?.aborted, true)
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = passed + failed
console.log(`\n${'='.repeat(50)}`)
console.log(`Passed: ${passed} / ${total}`)
if (failed > 0) {
  console.log(`Failed: ${failed}`)
  process.exit(1)
}
console.log('All tests passed.')
