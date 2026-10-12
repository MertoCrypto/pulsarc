/**
 * Unit tests for passkeyStore.ts
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/passkeyStore.test.ts
 *
 * No external dependencies — uses Node's built-in assert/strict only.
 */

import assert from 'node:assert/strict'
import {
  loadStoredCredential,
  saveCredential,
  clearCredential,
  wasPasskeyActive,
  setActive,
  isPasskeySupported,
} from './passkeyStore.ts'

// ---------------------------------------------------------------------------
// Real storage key strings — peeked directly to verify byte-for-byte storage
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'pulsarc:passkey:credential'
const ACTIVE_KEY  = 'pulsarc:passkey:active'

// ---------------------------------------------------------------------------
// Fake localStorage backed by a Map, with per-method throw switches
// ---------------------------------------------------------------------------
interface FakeStorage {
  store: Map<string, string>
  throwOnGet: boolean
  throwOnSet: boolean
  throwOnRemove: boolean
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function makeFakeStorage(): FakeStorage {
  const store = new Map<string, string>()
  return {
    store,
    throwOnGet: false,
    throwOnSet: false,
    throwOnRemove: false,
    getItem(key: string): string | null {
      if (this.throwOnGet) throw new Error('getItem blocked')
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string): void {
      if (this.throwOnSet) throw new Error('setItem blocked')
      store.set(key, value)
    },
    removeItem(key: string): void {
      if (this.throwOnRemove) throw new Error('removeItem blocked')
      store.delete(key)
    },
  }
}

// ---------------------------------------------------------------------------
// Simple check helper + counters
// ---------------------------------------------------------------------------
let total = 0
let passed = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  try {
    assert.deepEqual(actual, expected)
    console.log(`  PASS  ${label}`)
    passed++
  } catch (err) {
    const e = err as { message: string }
    console.error(`  FAIL  ${label}`)
    console.error(`        ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// Test runner state — reset between tests
// ---------------------------------------------------------------------------
let fakeStorage: FakeStorage

function resetStorage(): void {
  fakeStorage = makeFakeStorage()
  // Install as globalThis.localStorage so passkeyStore.ts's bare `localStorage`
  // references resolve to our fake via the global scope.
  Object.assign(globalThis, { localStorage: fakeStorage })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\n=== passkeyStore tests ===\n')

// A representative credential object used throughout
type P256Like = { id: string; publicKey: `0x${string}`; raw: { id: string; type: string } }
const cred: P256Like = {
  id: 'abc123',
  publicKey: '0xdeadbeef' as `0x${string}`,
  raw: { id: 'abc123', type: 'public-key' },
}

// ── saveCredential / loadStoredCredential ───────────────────────────────────

console.log('--- save / load round-trip ---')
resetStorage()
saveCredential(cred as never)
check(
  'save then load round-trips a credential object (deep equal)',
  loadStoredCredential(),
  cred,
)

// ── load with nothing stored ────────────────────────────────────────────────

console.log('\n--- load with nothing stored ---')
resetStorage()
check(
  'load with nothing stored -> null',
  loadStoredCredential(),
  null,
)

// ── load with corrupt JSON ──────────────────────────────────────────────────

console.log('\n--- load with corrupt JSON ---')
resetStorage()
fakeStorage.store.set(STORAGE_KEY, '{not valid json!!}')
check(
  'load with corrupt JSON -> null (no throw)',
  loadStoredCredential(),
  null,
)

// ── load when getItem throws ────────────────────────────────────────────────

console.log('\n--- load when getItem throws ---')
resetStorage()
fakeStorage.throwOnGet = true
check(
  'load when getItem throws -> null',
  loadStoredCredential(),
  null,
)

// ── save when setItem throws ────────────────────────────────────────────────

console.log('\n--- save when setItem throws ---')
resetStorage()
fakeStorage.throwOnSet = true
total++
try {
  saveCredential(cred as never)
  console.log('  PASS  save when setItem throws -> does not throw')
  passed++
} catch {
  console.error('  FAIL  save when setItem throws -> does not throw')
}

// ── stored JSON is exactly JSON.stringify(cred) ─────────────────────────────

console.log('\n--- stored JSON shape ---')
resetStorage()
saveCredential(cred as never)
check(
  'saved JSON is exactly JSON.stringify(cred) under credential key',
  fakeStorage.store.get(STORAGE_KEY),
  JSON.stringify(cred),
)

// ── clearCredential ─────────────────────────────────────────────────────────

console.log('\n--- clearCredential ---')
resetStorage()
saveCredential(cred as never)
clearCredential()
check(
  'clear removes the credential key (load gives null afterwards)',
  loadStoredCredential(),
  null,
)

resetStorage()
fakeStorage.throwOnRemove = true
total++
try {
  clearCredential()
  console.log('  PASS  clearCredential does not throw when removeItem throws')
  passed++
} catch {
  console.error('  FAIL  clearCredential does not throw when removeItem throws')
}

// ── wasPasskeyActive defaults ───────────────────────────────────────────────

console.log('\n--- wasPasskeyActive ---')
resetStorage()
check(
  'wasPasskeyActive false by default (nothing stored)',
  wasPasskeyActive(),
  false,
)

// ── setActive(true) stores exactly '1' ─────────────────────────────────────

resetStorage()
setActive(true)
check(
  'setActive(true): wasPasskeyActive -> true',
  wasPasskeyActive(),
  true,
)
check(
  "setActive(true): stored value is exactly '1'",
  fakeStorage.store.get(ACTIVE_KEY),
  '1',
)

// ── setActive(false) removes key ────────────────────────────────────────────

resetStorage()
setActive(true)
setActive(false)
check(
  'setActive(false): wasPasskeyActive -> false',
  wasPasskeyActive(),
  false,
)
check(
  'setActive(false): key is removed from store',
  fakeStorage.store.has(ACTIVE_KEY),
  false,
)

// ── stored value '0' is not accepted as active ─────────────────────────────

resetStorage()
fakeStorage.store.set(ACTIVE_KEY, '0')
check(
  "wasPasskeyActive false when stored value is '0'",
  wasPasskeyActive(),
  false,
)

// ── stored value 'true' is not accepted as active ──────────────────────────

resetStorage()
fakeStorage.store.set(ACTIVE_KEY, 'true')
check(
  "wasPasskeyActive false when stored value is 'true'",
  wasPasskeyActive(),
  false,
)

// ── getItem throws → wasPasskeyActive false ─────────────────────────────────

resetStorage()
fakeStorage.throwOnGet = true
check(
  'wasPasskeyActive false when getItem throws',
  wasPasskeyActive(),
  false,
)

// ── setActive never throws when storage throws ──────────────────────────────

resetStorage()
fakeStorage.throwOnSet = true
fakeStorage.throwOnRemove = true
total++
try {
  setActive(true)
  setActive(false)
  console.log('  PASS  setActive never throws when storage throws')
  passed++
} catch {
  console.error('  FAIL  setActive never throws when storage throws')
}

// ── credential and active keys are independent ──────────────────────────────

console.log('\n--- key independence ---')

// clearCredential leaves active flag alone
resetStorage()
saveCredential(cred as never)
setActive(true)
clearCredential()
check(
  'clearCredential leaves the active flag alone',
  wasPasskeyActive(),
  true,
)
check(
  'clearCredential does remove the credential key (load gives null)',
  loadStoredCredential(),
  null,
)

// setActive(false) leaves credential alone
resetStorage()
saveCredential(cred as never)
setActive(true)
setActive(false)
check(
  'setActive(false) leaves the credential alone',
  loadStoredCredential(),
  cred,
)
check(
  'setActive(false) removes active key',
  fakeStorage.store.has(ACTIVE_KEY),
  false,
)

// ── documents current behaviour: no shape validation ───────────────────────

console.log('\n--- current behaviour: no shape validation ---')

resetStorage()
fakeStorage.store.set(STORAGE_KEY, '123')
check(
  'documents current behaviour: no shape validation — loadStoredCredential returns 123 as-is',
  loadStoredCredential(),
  123,
)

resetStorage()
fakeStorage.store.set(STORAGE_KEY, '"x"')
check(
  'documents current behaviour: no shape validation — loadStoredCredential returns "x" as-is',
  loadStoredCredential(),
  'x',
)

// ── isPasskeySupported ──────────────────────────────────────────────────────

console.log('\n--- isPasskeySupported ---')

// Install a base fake window so we can control it per sub-test
;(globalThis as Record<string, unknown>).window = undefined

{
  // window is undefined
  delete (globalThis as Record<string, unknown>).window
  check(
    'isPasskeySupported: false when window is undefined',
    isPasskeySupported(),
    false,
  )
}

{
  // window exists but PublicKeyCredential missing
  ;(globalThis as Record<string, unknown>).window = {}
  check(
    'isPasskeySupported: false when window.PublicKeyCredential is missing',
    isPasskeySupported(),
    false,
  )
}

{
  // PublicKeyCredential exists but isUserVerifyingPlatformAuthenticatorAvailable is not a function
  ;(globalThis as Record<string, unknown>).window = {
    PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: true },
  }
  check(
    'isPasskeySupported: false when isUserVerifyingPlatformAuthenticatorAvailable is not a function',
    isPasskeySupported(),
    false,
  )
}

{
  // PublicKeyCredential exists and isUserVerifyingPlatformAuthenticatorAvailable is a function
  ;(globalThis as Record<string, unknown>).window = {
    PublicKeyCredential: {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    },
  }
  check(
    'isPasskeySupported: true when isUserVerifyingPlatformAuthenticatorAvailable is a function',
    isPasskeySupported(),
    true,
  )
}

// ── Final summary ──────────────────────────────────────────────────────────

console.log(`\n=== ${passed}/${total} tests passed ===\n`)
if (passed < total) process.exit(1)
