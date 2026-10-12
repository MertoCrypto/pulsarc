/**
 * Unit tests for src/lib/migrateStorage.ts
 *
 * Run from the repo root:
 *   node --experimental-strip-types --no-warnings src/lib/migrateStorage.test.ts
 *
 * Each scenario installs a fresh fake globalThis.localStorage BEFORE importing
 * the module, then forces a re-run by appending a unique query string so Node's
 * ES-module cache treats every import as a distinct specifier.
 */

import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map-backed fake localStorage with keys in insertion order. */
function makeFakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial))

  const store = {
    get length() {
      return map.size
    },
    key(i: number): string | null {
      let n = 0
      for (const k of map.keys()) {
        if (n === i) return k
        n++
      }
      return null
    },
    getItem(k: string): string | null {
      return map.has(k) ? (map.get(k) as string) : null
    },
    setItem(k: string, v: string): void {
      map.set(k, v)
    },
    removeItem(k: string): void {
      map.delete(k)
    },
    clear(): void {
      map.clear()
    },
  }

  return store as unknown as Storage
}

/** Snapshot of all key→value pairs in the fake storage. */
function snapshot(ls: Storage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i) as string
    out[k] = ls.getItem(k) as string
  }
  return out
}

let assertions = 0
function check(description: string, fn: () => void) {
  fn()
  assertions++
  // assertion count is incremented once per check() call; individual assert
  // calls inside may throw, which propagates naturally.
}

// ---------------------------------------------------------------------------
// Scenario 1 — arclytics:a and arclytics:b move to pulsarc:a and pulsarc:b
// ---------------------------------------------------------------------------
{
  const ls = makeFakeStorage({
    'arclytics:a': 'val-a',
    'arclytics:b': 'val-b',
  })
  ;(globalThis as Record<string, unknown>).localStorage = ls

  await import('./migrateStorage.ts?case=1')

  const s = snapshot(ls)

  check('sc1 – pulsarc:a has the migrated value', () =>
    assert.equal(s['pulsarc:a'], 'val-a'),
  )
  check('sc1 – pulsarc:b has the migrated value', () =>
    assert.equal(s['pulsarc:b'], 'val-b'),
  )
  check('sc1 – arclytics:a is removed', () =>
    assert.equal(s['arclytics:a'], undefined),
  )
  check('sc1 – arclytics:b is removed', () =>
    assert.equal(s['arclytics:b'], undefined),
  )
  check('sc1 – exactly 2 keys remain', () =>
    assert.equal(Object.keys(s).length, 2),
  )
}

// ---------------------------------------------------------------------------
// Scenario 2 — existing pulsarc:a is NOT overwritten but arclytics:a is removed
// ---------------------------------------------------------------------------
{
  const ls = makeFakeStorage({
    'arclytics:a': 'new-val',
    'pulsarc:a': 'existing',
  })
  ;(globalThis as Record<string, unknown>).localStorage = ls

  await import('./migrateStorage.ts?case=2')

  const s = snapshot(ls)

  check('sc2 – pulsarc:a is unchanged (not overwritten)', () =>
    assert.equal(s['pulsarc:a'], 'existing'),
  )
  check('sc2 – arclytics:a is removed despite no overwrite', () =>
    assert.equal(s['arclytics:a'], undefined),
  )
  check('sc2 – exactly 1 key remains', () =>
    assert.equal(Object.keys(s).length, 1),
  )
}

// ---------------------------------------------------------------------------
// Scenario 3 — unrelated keys are untouched
// ---------------------------------------------------------------------------
{
  const ls = makeFakeStorage({
    'wagmi.store': 'wagmi-data',
    'pulsarc:x': 'already-there',
    xarclytics: 'not-a-match',
  })
  ;(globalThis as Record<string, unknown>).localStorage = ls

  await import('./migrateStorage.ts?case=3')

  const s = snapshot(ls)

  check('sc3 – wagmi.store untouched', () =>
    assert.equal(s['wagmi.store'], 'wagmi-data'),
  )
  check('sc3 – pulsarc:x untouched', () =>
    assert.equal(s['pulsarc:x'], 'already-there'),
  )
  check('sc3 – xarclytics untouched (does not start with "arclytics")', () =>
    assert.equal(s['xarclytics'], 'not-a-match'),
  )
  check('sc3 – exactly 3 keys remain', () =>
    assert.equal(Object.keys(s).length, 3),
  )
}

// ---------------------------------------------------------------------------
// Scenario 4 — old key with empty-string value IS migrated ('' is not null)
// ---------------------------------------------------------------------------
{
  const ls = makeFakeStorage({
    'arclytics:empty': '',
  })
  ;(globalThis as Record<string, unknown>).localStorage = ls

  await import('./migrateStorage.ts?case=4')

  const s = snapshot(ls)

  check('sc4 – pulsarc:empty exists with value ""', () =>
    assert.equal(s['pulsarc:empty'], ''),
  )
  check('sc4 – arclytics:empty is removed', () =>
    assert.equal(s['arclytics:empty'], undefined),
  )
  check('sc4 – exactly 1 key remains', () =>
    assert.equal(Object.keys(s).length, 1),
  )
}

// ---------------------------------------------------------------------------
// Scenario 5 — empty storage does nothing and does not throw
// ---------------------------------------------------------------------------
{
  const ls = makeFakeStorage({})
  ;(globalThis as Record<string, unknown>).localStorage = ls

  await import('./migrateStorage.ts?case=5')

  const s = snapshot(ls)

  check('sc5 – storage is still empty', () =>
    assert.equal(Object.keys(s).length, 0),
  )
}

// ---------------------------------------------------------------------------
// Scenario 6 — key() throws (storage blocked): import must not throw
// ---------------------------------------------------------------------------
{
  // Minimal fake that has length=1 but key() throws.
  const brokenStorage = {
    get length() { return 1 },
    key(_i: number): string | null { throw new Error('storage blocked') },
    getItem(_k: string): string | null { return null },
    setItem(_k: string, _v: string): void {},
    removeItem(_k: string): void {},
    clear(): void {},
  }
  ;(globalThis as Record<string, unknown>).localStorage =
    brokenStorage as unknown as Storage

  // The module's try/catch must swallow the error from key().
  let threw = false
  try {
    await import('./migrateStorage.ts?case=6')
  } catch {
    threw = true
  }

  check('sc6 – import does not throw when storage is blocked', () =>
    assert.equal(threw, false),
  )
}

// ---------------------------------------------------------------------------
// Scenario 7 — 'arclytics' exactly (no suffix) migrates to 'pulsarc'
// ---------------------------------------------------------------------------
{
  const ls = makeFakeStorage({
    arclytics: 'bare-val',
  })
  ;(globalThis as Record<string, unknown>).localStorage = ls

  await import('./migrateStorage.ts?case=7')

  const s = snapshot(ls)

  check('sc7 – "pulsarc" key exists with the value', () =>
    assert.equal(s['pulsarc'], 'bare-val'),
  )
  check('sc7 – "arclytics" key is removed', () =>
    assert.equal(s['arclytics'], undefined),
  )
  check('sc7 – exactly 1 key remains', () =>
    assert.equal(Object.keys(s).length, 1),
  )
}

// ---------------------------------------------------------------------------
// Cleanup — remove the fake from globalThis
// ---------------------------------------------------------------------------
delete (globalThis as Record<string, unknown>).localStorage

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nAll scenarios passed. ${assertions} assertion groups checked.`)
