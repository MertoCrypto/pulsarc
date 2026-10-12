/**
 * pageTotals.test.ts
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/pageTotals.test.ts
 */

import assert from 'node:assert/strict'
import { engagementTotals, walletTotals, sampledEvents } from './pageTotals.ts'
import type { AppSample, AnchorSample, ActivityEvent } from './appMetrics.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed: number = 0
let total: number = 0

function check<T>(label: string, actual: T, expected: T): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  PASS  ${label}`)
    passed++
  } catch (err) {
    const e = err as assert.AssertionError
    console.error(`  FAIL  ${label}`)
    console.error(`        actual:   ${JSON.stringify(actual)}`)
    console.error(`        expected: ${JSON.stringify(expected)}`)
    console.error(`        ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    ts: 1_000_000,
    wallets: ['0xw'],
    usd: 10,
    fee: 0.01,
    hash: '0xabc',
    ...overrides,
  }
}

function makeAnchor(events: ActivityEvent[], balance: number = 0, hasMore: boolean = false): AnchorSample {
  return {
    anchor: null as unknown as AnchorSample['anchor'],
    events,
    hasMore,
    balance,
  }
}

function makeSample(anchors: AnchorSample[], appId: string = 'app-1'): AppSample {
  return {
    appId,
    anchors,
    fetchedAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// engagementTotals
// ---------------------------------------------------------------------------

console.log('\nengagementTotals')

// empty array -> all zeros
check(
  'empty -> all 0',
  engagementTotals([]),
  { votes: 0, attestations: 0, boost: 0 },
)

// single entry
check(
  'single entry',
  engagementTotals([{ votes: 7, attestations: 13, boostUsdc: 3.5 }]),
  { votes: 7, attestations: 13, boost: 3.5 },
)

// sums votes independently (1+2+3 = 6; attestations 10+20+30 = 60; boost 0.5+1.5+2 = 4)
// Distinct numbers catch any field-mix-up
{
  const entries: readonly { votes: number; attestations: number; boostUsdc: number }[] = [
    { votes: 1, attestations: 10, boostUsdc: 0.5 },
    { votes: 2, attestations: 20, boostUsdc: 1.5 },
    { votes: 3, attestations: 30, boostUsdc: 2   },
  ]
  check('sums votes: 1+2+3 = 6',           engagementTotals(entries).votes,         6)
  check('sums attestations: 10+20+30 = 60', engagementTotals(entries).attestations,  60)
  check('sums boost: 0.5+1.5+2 = 4',        engagementTotals(entries).boost,         4)
}

// decimals add exactly for the given values
{
  const entries: readonly { votes: number; attestations: number; boostUsdc: number }[] = [
    { votes: 0, attestations: 0, boostUsdc: 0.1 },
    { votes: 0, attestations: 0, boostUsdc: 0.2 },
  ]
  // 0.1 + 0.2 in JS is 0.30000000000000004 — the function sums raw floats,
  // so we match what JS actually produces rather than asserting a rounded value.
  check(
    'decimals add as JS floats (0.1+0.2)',
    engagementTotals(entries).boost,
    0.1 + 0.2,
  )
}

// fields don't bleed into each other: votes != attestations != boost given distinct values
{
  const result: { votes: number; attestations: number; boost: number } = engagementTotals([
    { votes: 1, attestations: 10, boostUsdc: 0.5 },
    { votes: 2, attestations: 20, boostUsdc: 1.5 },
    { votes: 3, attestations: 30, boostUsdc: 2   },
  ])
  check('field isolation: votes !== attestations', result.votes === result.attestations, false)
  check('field isolation: votes !== boost',        result.votes === result.boost,        false)
  check('field isolation: attestations !== boost', result.attestations === result.boost, false)
}

// ---------------------------------------------------------------------------
// walletTotals
// ---------------------------------------------------------------------------

console.log('\nwalletTotals')

// empty -> all zeros
check(
  'empty -> all zeros',
  walletTotals([]),
  { totalBalance: 0, active24h: 0, txns24h: 0 },
)

// undefined entries are ignored everywhere
check(
  'all undefined -> all zeros',
  walletTotals([undefined, undefined, undefined]),
  { totalBalance: 0, active24h: 0, txns24h: 0 },
)

// totalBalance sums balance across loaded entries
{
  const snaps: readonly ({ balance: number; txns24h: number } | undefined)[] = [
    { balance: 100, txns24h: 0 },
    { balance: 250, txns24h: 0 },
    { balance: 50,  txns24h: 0 },
  ]
  check('totalBalance sums: 100+250+50 = 400', walletTotals(snaps).totalBalance, 400)
}

// txns24h sums txns24h across loaded entries
{
  const snaps: readonly ({ balance: number; txns24h: number } | undefined)[] = [
    { balance: 0, txns24h: 5 },
    { balance: 0, txns24h: 3 },
    { balance: 0, txns24h: 8 },
  ]
  check('txns24h sums: 5+3+8 = 16', walletTotals(snaps).txns24h, 16)
}

// active24h counts only wallets with txns24h > 0 (0 is NOT counted, 1 IS counted)
{
  const snaps: readonly ({ balance: number; txns24h: number } | undefined)[] = [
    { balance: 0, txns24h: 0 },   // not active
    { balance: 0, txns24h: 1 },   // active
    { balance: 0, txns24h: 0 },   // not active
    { balance: 0, txns24h: 10 },  // active
  ]
  check('active24h: txns24h=0 not counted', walletTotals(snaps).active24h, 2)
}

// mix of loaded and undefined
{
  const snaps: readonly ({ balance: number; txns24h: number } | undefined)[] = [
    { balance: 300, txns24h: 4 },
    undefined,
    { balance: 700, txns24h: 0 },
    undefined,
    { balance: 0,   txns24h: 2 },
  ]
  const result: { totalBalance: number; active24h: number; txns24h: number } = walletTotals(snaps)
  check('mix: totalBalance = 300+700+0 = 1000', result.totalBalance, 1000)
  check('mix: active24h = 2 (txns24h 4 and 2)',  result.active24h,   2)
  check('mix: txns24h = 4+0+2 = 6',              result.txns24h,     6)
}

// all loaded with zero activity -> active24h 0
{
  const snaps: readonly ({ balance: number; txns24h: number } | undefined)[] = [
    { balance: 100, txns24h: 0 },
    { balance: 200, txns24h: 0 },
  ]
  check('all zero activity -> active24h 0', walletTotals(snaps).active24h, 0)
}

// ---------------------------------------------------------------------------
// sampledEvents
// ---------------------------------------------------------------------------

console.log('\nsampledEvents')

// null -> 0
check('null -> 0',      sampledEvents(null),      0)
// undefined -> 0
check('undefined -> 0', sampledEvents(undefined), 0)

// sample with no anchors -> 0
check(
  'no anchors -> 0',
  sampledEvents(makeSample([])),
  0,
)

// one anchor with several events
{
  const sample: AppSample = makeSample([
    makeAnchor([makeEvent(), makeEvent(), makeEvent()]),
  ])
  check('one anchor, 3 events -> 3', sampledEvents(sample), 3)
}

// sums events across anchors: 3 + 0 + 2 = 5
{
  const sample: AppSample = makeSample([
    makeAnchor([makeEvent(), makeEvent(), makeEvent()]),
    makeAnchor([]),
    makeAnchor([makeEvent(), makeEvent()]),
  ])
  check('3+0+2 = 5 events across anchors', sampledEvents(sample), 5)
}

// single anchor, single event
{
  const sample: AppSample = makeSample([makeAnchor([makeEvent()])])
  check('single anchor, single event -> 1', sampledEvents(sample), 1)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed}/${total} tests passed.`)

if (passed < total) {
  process.exit(1)
}
