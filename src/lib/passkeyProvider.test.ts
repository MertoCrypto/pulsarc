/**
 * Unit tests for wrapProvider (src/lib/passkeyProvider.ts).
 * Run: node --experimental-strip-types --no-warnings src/lib/passkeyProvider.test.ts
 * Only node:assert/strict — no test framework, no installs.
 */
import assert from 'node:assert/strict'
import { wrapProvider } from './passkeyProvider.ts'

// ─── Fake builders ────────────────────────────────────────────────────────────

type Call = { method: string; params?: unknown[]; jsonrpc?: string; id?: number }

interface SdkExtra {
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
  off?: (event: string, listener: (...args: unknown[]) => void) => void
}

function makeSdkProvider(
  returnValue: unknown = { result: 'sdk-result', jsonrpc: '2.0', id: 1 },
  extras: SdkExtra = {},
) {
  const calls: Call[] = []
  const provider = {
    calls,
    async request(args: { method: string; params?: unknown[]; jsonrpc?: string; id?: number }) {
      calls.push({ method: args.method, params: args.params, jsonrpc: args.jsonrpc, id: args.id })
      if (returnValue instanceof Error) throw returnValue
      return returnValue
    },
    ...extras,
  }
  return provider as typeof provider & SdkExtra
}

function makePlainClient(returnValue: unknown = 'plain-result') {
  const calls: { method: string; params?: unknown[] }[] = []
  const client = {
    calls,
    async request(args: { method: string; params?: unknown[] }) {
      calls.push({ method: args.method, params: args.params })
      if (returnValue instanceof Error) throw returnValue
      return returnValue
    },
  }
  return client
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function noop() {}

// ─── Tests ────────────────────────────────────────────────────────────────────

let passed = 0
const tests: Array<[string, () => Promise<void> | void]> = []

function test(name: string, fn: () => Promise<void> | void) {
  tests.push([name, fn])
}

// ── Public-read methods route to plainClient, never to sdk ───────────────────

const publicReadMethods = [
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getTransactionCount',
  'eth_call',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_getLogs',
  'eth_getFilterLogs',
]

for (const method of publicReadMethods) {
  test(`public-read: ${method} routes to plainClient with exact args`, async () => {
    const sdk = makeSdkProvider()
    const plain = makePlainClient('read-result')
    const wp = wrapProvider(sdk as never, plain as never)
    const params = ['0xabc', 'latest'] as unknown[]
    const result = await wp.request({ method, params })
    assert.equal(result, 'read-result')
    assert.equal(plain.calls.length, 1)
    assert.deepEqual(plain.calls[0], { method, params })
    assert.equal(sdk.calls.length, 0, `sdk must NOT be called for ${method}`)
  })
}

for (const method of publicReadMethods) {
  test(`public-read: ${method} passes params undefined through`, async () => {
    const sdk = makeSdkProvider()
    const plain = makePlainClient('r')
    const wp = wrapProvider(sdk as never, plain as never)
    await wp.request({ method })
    assert.deepEqual(plain.calls[0], { method, params: undefined })
    assert.equal(sdk.calls.length, 0)
  })
}

// ── eth_gasPrice / eth_maxPriorityFeePerGas return '0x0', touch nobody ────────

for (const method of ['eth_gasPrice', 'eth_maxPriorityFeePerGas']) {
  test(`${method} returns '0x0' and touches nobody`, async () => {
    const sdk = makeSdkProvider()
    const plain = makePlainClient()
    const wp = wrapProvider(sdk as never, plain as never)
    const result = await wp.request({ method })
    assert.equal(result, '0x0')
    assert.equal(sdk.calls.length, 0)
    assert.equal(plain.calls.length, 0)
  })
}

// ── wallet_switchEthereumChain / wallet_addEthereumChain return null, touch nobody

for (const method of ['wallet_switchEthereumChain', 'wallet_addEthereumChain']) {
  test(`${method} returns null and touches nobody`, async () => {
    const sdk = makeSdkProvider()
    const plain = makePlainClient()
    const wp = wrapProvider(sdk as never, plain as never)
    const result = await wp.request({ method })
    assert.equal(result, null)
    assert.equal(sdk.calls.length, 0)
    assert.equal(plain.calls.length, 0)
  })
}

// ── Other methods route to sdk with jsonrpc '2.0' and incrementing id ─────────

test('sdk call: jsonrpc and id fields are set correctly', async () => {
  const sdk = makeSdkProvider({ result: 'accounts', jsonrpc: '2.0', id: 1 })
  const plain = makePlainClient()
  const wp = wrapProvider(sdk as never, plain as never)
  await wp.request({ method: 'eth_accounts' })
  assert.equal(sdk.calls.length, 1)
  assert.equal(sdk.calls[0]!.jsonrpc, '2.0')
  assert.equal(sdk.calls[0]!.id, 1)
  assert.equal(plain.calls.length, 0)
})

test('sdk call: id increments 1, 2, 3 across consecutive calls', async () => {
  const sdk = makeSdkProvider({ result: 'x', jsonrpc: '2.0', id: 1 })
  const plain = makePlainClient()
  const wp = wrapProvider(sdk as never, plain as never)
  await wp.request({ method: 'eth_accounts' })
  await wp.request({ method: 'eth_sendTransaction' })
  await wp.request({ method: 'personal_sign' })
  assert.equal(sdk.calls[0]!.id, 1)
  assert.equal(sdk.calls[1]!.id, 2)
  assert.equal(sdk.calls[2]!.id, 3)
})

test('sdk call: id counter is per wrapper instance, not shared', async () => {
  const sdk1 = makeSdkProvider({ result: 'x', jsonrpc: '2.0', id: 1 })
  const sdk2 = makeSdkProvider({ result: 'y', jsonrpc: '2.0', id: 1 })
  const plain = makePlainClient()
  const wp1 = wrapProvider(sdk1 as never, plain as never)
  const wp2 = wrapProvider(sdk2 as never, plain as never)
  await wp1.request({ method: 'eth_accounts' })
  await wp1.request({ method: 'eth_accounts' })
  await wp2.request({ method: 'eth_accounts' })
  assert.equal(sdk1.calls[0]!.id, 1)
  assert.equal(sdk1.calls[1]!.id, 2)
  assert.equal(sdk2.calls[0]!.id, 1, 'second wrapper starts fresh at 1')
})

test('sdk call: method and params forwarded exactly', async () => {
  const sdk = makeSdkProvider({ result: 'ok', jsonrpc: '2.0', id: 1 })
  const plain = makePlainClient()
  const wp = wrapProvider(sdk as never, plain as never)
  const params = ['0xdeadbeef', { value: '0x1' }] as unknown[]
  await wp.request({ method: 'eth_sendTransaction', params })
  assert.deepEqual(sdk.calls[0], { method: 'eth_sendTransaction', params, jsonrpc: '2.0', id: 1 })
})

test('sdk call: params undefined passed through', async () => {
  const sdk = makeSdkProvider({ result: 'ok', jsonrpc: '2.0', id: 1 })
  const plain = makePlainClient()
  const wp = wrapProvider(sdk as never, plain as never)
  await wp.request({ method: 'eth_accounts' })
  assert.deepEqual(sdk.calls[0], { method: 'eth_accounts', params: undefined, jsonrpc: '2.0', id: 1 })
})

// ── Envelope unwrapping ───────────────────────────────────────────────────────

test('envelope: {result: X} → X (string)', async () => {
  const sdk = makeSdkProvider({ result: 'the-value', jsonrpc: '2.0', id: 1 })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  const r = await wp.request({ method: 'eth_accounts' })
  assert.equal(r, 'the-value')
})

test('envelope: {result: 0} → 0 (falsy number)', async () => {
  const sdk = makeSdkProvider({ result: 0, jsonrpc: '2.0', id: 1 })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  const r = await wp.request({ method: 'eth_accounts' })
  assert.equal(r, 0)
})

test('envelope: {result: ""} → "" (falsy string)', async () => {
  const sdk = makeSdkProvider({ result: '', jsonrpc: '2.0', id: 1 })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  const r = await wp.request({ method: 'eth_accounts' })
  assert.equal(r, '')
})

test('envelope: {result: null} → null (result is null)', async () => {
  const sdk = makeSdkProvider({ result: null, jsonrpc: '2.0', id: 1 })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  const r = await wp.request({ method: 'eth_accounts' })
  assert.equal(r, null)
})

test('envelope: {result: false} → false (falsy bool)', async () => {
  const sdk = makeSdkProvider({ result: false, jsonrpc: '2.0', id: 1 })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  const r = await wp.request({ method: 'eth_accounts' })
  assert.equal(r, false)
})

test('envelope: non-object response returned as-is (string)', async () => {
  const sdk = makeSdkProvider('bare-string')
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  const r = await wp.request({ method: 'eth_accounts' })
  assert.equal(r, 'bare-string')
})

test('envelope: null response returned as-is', async () => {
  const sdk = makeSdkProvider(null)
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  const r = await wp.request({ method: 'eth_accounts' })
  assert.equal(r, null)
})

test('envelope: object without result key returned as-is', async () => {
  const obj = { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'oops' } }
  const sdk = makeSdkProvider(obj)
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  const r = await wp.request({ method: 'eth_accounts' })
  assert.deepEqual(r, obj)
})

// ── Error propagation ─────────────────────────────────────────────────────────

test('error: sdk rejection propagates', async () => {
  const err = new Error('sdk-error')
  const sdk = makeSdkProvider(err)
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  await assert.rejects(() => wp.request({ method: 'eth_accounts' }), err)
})

test('error: plainClient rejection propagates (public read)', async () => {
  const err = new Error('plain-error')
  const sdk = makeSdkProvider()
  const plain = makePlainClient(err)
  const wp = wrapProvider(sdk as never, plain as never)
  await assert.rejects(() => wp.request({ method: 'eth_getBalance', params: ['0x1', 'latest'] }), err)
})

// ── on / removeListener / off forwarding ─────────────────────────────────────

test('on: forwards when sdk has on function', () => {
  const onCalls: Array<[string, (...a: unknown[]) => void]> = []
  const sdk = makeSdkProvider(null, {
    on(event, listener) { onCalls.push([event, listener]) },
  })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  wp.on('accountsChanged', noop)
  assert.equal(onCalls.length, 1)
  assert.equal(onCalls[0]![0], 'accountsChanged')
  assert.equal(onCalls[0]![1], noop)
})

test('on: silently does nothing when sdk lacks on', () => {
  const sdk = makeSdkProvider(null, {})
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  assert.doesNotThrow(() => wp.on('accountsChanged', noop))
})

test('on: silently does nothing when sdk.on is not a function', () => {
  const sdk = makeSdkProvider(null, { on: 'not-a-function' as unknown as () => void })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  assert.doesNotThrow(() => wp.on('accountsChanged', noop))
})

test('removeListener: forwards when sdk has removeListener function', () => {
  const rlCalls: Array<[string, (...a: unknown[]) => void]> = []
  const sdk = makeSdkProvider(null, {
    removeListener(event, listener) { rlCalls.push([event, listener]) },
  })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  wp.removeListener('connect', noop)
  assert.equal(rlCalls.length, 1)
  assert.equal(rlCalls[0]![0], 'connect')
  assert.equal(rlCalls[0]![1], noop)
})

test('removeListener: silently does nothing when sdk lacks removeListener', () => {
  const sdk = makeSdkProvider(null, {})
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  assert.doesNotThrow(() => wp.removeListener('connect', noop))
})

test('removeListener: silently does nothing when sdk.removeListener is not a function', () => {
  const sdk = makeSdkProvider(null, { removeListener: 42 as unknown as () => void })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  assert.doesNotThrow(() => wp.removeListener('connect', noop))
})

test('off: forwards when sdk has off function', () => {
  const offCalls: Array<[string, (...a: unknown[]) => void]> = []
  const sdk = makeSdkProvider(null, {
    off(event, listener) { offCalls.push([event, listener]) },
  })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  wp.off('disconnect', noop)
  assert.equal(offCalls.length, 1)
  assert.equal(offCalls[0]![0], 'disconnect')
  assert.equal(offCalls[0]![1], noop)
})

test('off: silently does nothing when sdk lacks off', () => {
  const sdk = makeSdkProvider(null, {})
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  assert.doesNotThrow(() => wp.off('disconnect', noop))
})

test('off: silently does nothing when sdk.off is not a function', () => {
  const sdk = makeSdkProvider(null, { off: null as unknown as () => void })
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  assert.doesNotThrow(() => wp.off('disconnect', noop))
})

// ── All three event methods absent simultaneously ─────────────────────────────

test('event methods: all absent — all silently do nothing', () => {
  const sdk = makeSdkProvider(null, {})
  const wp = wrapProvider(sdk as never, makePlainClient() as never)
  assert.doesNotThrow(() => {
    wp.on('accountsChanged', noop)
    wp.removeListener('accountsChanged', noop)
    wp.off('accountsChanged', noop)
  })
})

// ─── Runner ───────────────────────────────────────────────────────────────────

for (const [name, fn] of tests) {
  try {
    await fn()
    passed++
  } catch (err) {
    console.error(`FAIL: ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

console.log(`${passed}/${tests.length} tests passed`)
