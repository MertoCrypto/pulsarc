/**
 * Tests for src/lib/status.ts
 * Run: node --experimental-strip-types src/lib/status.test.ts
 */
import assert from 'node:assert/strict'
import { parseState, deriveStatus, timeAgo } from './status.ts'

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

const NOW = new Date('2026-10-11T12:00:00Z').getTime()

const makeState = (overrides?: Record<string, unknown>) => ({
  next: 1000,
  tip: 1100,
  network: 'testnet',
  chainId: 5042002,
  openHour: '2026-10-11T11',
  openHourStart: 950,
  skipped: [[500, 600]],
  updatedAt: new Date(NOW - 60_000).toISOString(),
  ...overrides,
})

console.log('\nparseState')

test('parses a normal state.json', () => {
  const s = parseState(makeState())
  assert.ok(s)
  assert.equal(s.next, 1000)
  assert.equal(s.tip, 1100)
  assert.equal(s.openHour, '2026-10-11T11')
  assert.deepEqual(s.skipped, [[500, 600]])
})

test('returns null for null', () => {
  assert.equal(parseState(null), null)
})

test('returns null for non-object', () => {
  assert.equal(parseState('oops'), null)
})

test('returns null when network is wrong', () => {
  assert.equal(parseState({ ...makeState(), network: 'arc' }), null)
})

test('returns null when next is missing', () => {
  const { next: _, ...rest } = makeState()
  assert.equal(parseState(rest), null)
})

test('missing skipped field → empty array', () => {
  const { skipped: _, ...rest } = makeState()
  const s = parseState(rest)
  assert.ok(s)
  assert.deepEqual(s.skipped, [])
})

test('missing openHour → null', () => {
  const s = parseState({ ...makeState(), openHour: undefined })
  assert.ok(s)
  assert.equal(s.openHour, null)
})

test('malformed skipped entries are dropped', () => {
  const s = parseState({ ...makeState(), skipped: [[500, 600], ['bad', 700], [800]] })
  assert.ok(s)
  assert.deepEqual(s.skipped, [[500, 600]])
})

console.log('\nderiveStatus')

test('normal: lag, coverage, skipped', () => {
  const s = parseState(makeState())!
  const d = deriveStatus(s, { coverageHours: 168 }, NOW)
  assert.equal(d.lastIndexedBlock, 999)
  assert.equal(d.lagBlocks, 101)
  assert.equal(d.isStale, false)
  assert.equal(d.coverage.find(c => c.window === '1h')?.source, 'indexer')
  assert.equal(d.coverage.find(c => c.window === '7d')?.source, 'indexer')
  assert.equal(d.skipped[0].count, 101) // 600 - 500 + 1
})

test('stale: updatedAt more than 3 hours ago', () => {
  const s = parseState({ ...makeState(), updatedAt: new Date(NOW - 4 * 3_600_000).toISOString() })!
  const d = deriveStatus(s, null, NOW)
  assert.equal(d.isStale, true)
})

test('lag 0 when next === tip + 1', () => {
  const s = parseState({ ...makeState(), next: 1101, tip: 1100 })!
  const d = deriveStatus(s, null, NOW)
  assert.equal(d.lagBlocks, 0)
})

test('coverageHours below 24 → 24h window uses arcscan', () => {
  const s = parseState(makeState())!
  const d = deriveStatus(s, { coverageHours: 20 }, NOW)
  assert.equal(d.coverage.find(c => c.window === '24h')?.source, 'arcscan')
  assert.equal(d.coverage.find(c => c.window === '1h')?.source, 'indexer')
})

test('null meta → all windows arcscan', () => {
  const s = parseState(makeState())!
  const d = deriveStatus(s, null, NOW)
  assert.ok(d.coverage.every(c => c.source === 'arcscan'))
})

test('missing skipped → empty skipped list', () => {
  const s = parseState({ ...makeState(), skipped: [] })!
  const d = deriveStatus(s, null, NOW)
  assert.deepEqual(d.skipped, [])
})

console.log('\ntimeAgo')

test('seconds', () => assert.equal(timeAgo(45_000), '45 seconds ago'))
test('minutes', () => assert.equal(timeAgo(5 * 60_000), '5 minutes ago'))
test('hours', () => assert.equal(timeAgo(3 * 3_600_000), '3 hours ago'))
test('singular minute', () => assert.equal(timeAgo(60_000), '1 minute ago'))

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exit(1)
