// Unit tests for summarizeWalletApps (pure function, no network, no browser APIs).
// Run with:
//   node --experimental-strip-types --no-warnings src/lib/walletApps.test.ts

import assert from 'node:assert/strict'
import type { ArcApp } from '@/data/apps'
import { summarizeWalletApps, type Tx, type Transfer } from './walletApps.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0
let total = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  PASS  ${label}`)
    passed++
  } catch (err) {
    const e = err as assert.AssertionError
    console.error(`  FAIL  ${label}`)
    console.error(`        expected: ${JSON.stringify(e.expected)}`)
    console.error(`        actual:   ${JSON.stringify(e.actual)}`)
  }
}

/** Minimal fake ArcApp; only id and anchors are read by summarizeWalletApps. */
function fakeApp(id: string, anchors: { address: string; usd?: boolean }[]): ArcApp {
  return { id, anchors } as unknown as ArcApp
}

// Addresses used throughout — deliberately mixed-case to test normalisation.
const ME      = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01'
const ANCHOR1 = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB02'
const ANCHOR2 = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC03'
const OTHER   = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD04'

const TS1 = '2026-01-01T00:00:00.000Z'
const TS2 = '2026-06-15T12:00:00.000Z'
const TS3 = '2026-10-10T23:59:59.999Z'

// ---------------------------------------------------------------------------
// 1. Basic tx to anchor: txCount incremented, value/1e18 added to volumeOut.
// ---------------------------------------------------------------------------
console.log('\n--- 1. basic tx to anchor ---')
{
  const app = fakeApp('app1', [{ address: ANCHOR1, usd: false }])
  const txs: Tx[] = [
    { timestamp: TS1, from: { hash: ME }, to: { hash: ANCHOR1 }, value: '2500000000000000000' }, // 2.5
  ]
  const { topApps, scanned } = summarizeWalletApps(ME, [app], txs, [])
  check('txCount = 1',           topApps[0]?.txCount,    1)
  check('volumeOut = 2.5',       topApps[0]?.volumeOut,  2.5)
  check('volumeIn = 0',          topApps[0]?.volumeIn,   0)
  check('lastSeen = TS1',        topApps[0]?.lastSeen,   TS1)
  check('scanned = 1',           scanned,                1)
}

// ---------------------------------------------------------------------------
// 2. tx with to: null is ignored.
// ---------------------------------------------------------------------------
console.log('\n--- 2. tx with to: null ignored ---')
{
  const app = fakeApp('app2', [{ address: ANCHOR1 }])
  const txs: Tx[] = [
    { timestamp: TS1, from: { hash: ME }, to: null, value: '1000000000000000000' },
  ]
  const { topApps, scanned } = summarizeWalletApps(ME, [app], txs, [])
  check('topApps empty',  topApps.length, 0)
  check('scanned = 1',    scanned,        1)
}

// ---------------------------------------------------------------------------
// 3. tx to unknown address is ignored.
// ---------------------------------------------------------------------------
console.log('\n--- 3. tx to unknown address ignored ---')
{
  const app = fakeApp('app3', [{ address: ANCHOR1 }])
  const txs: Tx[] = [
    { timestamp: TS1, from: { hash: ME }, to: { hash: OTHER }, value: '1000000000000000000' },
  ]
  const { topApps, scanned } = summarizeWalletApps(ME, [app], txs, [])
  check('topApps empty', topApps.length, 0)
  check('scanned = 1',   scanned,        1)
}

// ---------------------------------------------------------------------------
// 4. Case-insensitive matching: anchor address, tx.to, and ME (from).
//    Anchor stored upper-case, tx.to lower-case, ME lower-case.
// ---------------------------------------------------------------------------
console.log('\n--- 4. case-insensitive address matching ---')
{
  const ANCHOR_UPPER = ANCHOR1.toUpperCase()
  const TO_LOWER     = ANCHOR1.toLowerCase()
  const ME_LOWER     = ME.toLowerCase()
  const app = fakeApp('app4', [{ address: ANCHOR_UPPER, usd: true }])
  // tx: to is lower-case of anchor
  const txs: Tx[] = [
    { timestamp: TS1, from: { hash: ME_LOWER }, to: { hash: TO_LOWER }, value: '1000000000000000000' }, // 1.0
  ]
  // transfer: token address is mixed-case, from is ME (lower)
  const transfers: Transfer[] = [
    {
      timestamp: TS2,
      token: { address_hash: ANCHOR_UPPER },
      from: { hash: ME_LOWER },
      to: { hash: OTHER },
      total: { value: '2000000', decimals: '6' }, // 2.0
    },
  ]
  const { topApps } = summarizeWalletApps(ME, [app], txs, transfers)
  check('txCount = 2',       topApps[0]?.txCount,    2)
  check('volumeOut = 3.0',   topApps[0]?.volumeOut,  3.0)  // 1.0 from tx + 2.0 from transfer
  check('volumeIn = 0',      topApps[0]?.volumeIn,   0)
  check('lastSeen = TS2',    topApps[0]?.lastSeen,   TS2)
}

// ---------------------------------------------------------------------------
// 5. Transfer of a USD anchor token: from==ME → volumeOut; else → volumeIn.
//    Uses total.value and total.decimals (6 decimals → value/1e6).
// ---------------------------------------------------------------------------
console.log('\n--- 5. USD transfer volumeOut vs volumeIn ---')
{
  const app = fakeApp('app5', [{ address: ANCHOR1, usd: true }])
  const transfers: Transfer[] = [
    {
      timestamp: TS1,
      token: { address_hash: ANCHOR1 },
      from: { hash: ME },
      to: { hash: OTHER },
      total: { value: '1000000', decimals: '6' }, // 1.0 → volumeOut
    },
    {
      timestamp: TS2,
      token: { address_hash: ANCHOR1 },
      from: { hash: OTHER },
      to: { hash: ME },
      total: { value: '500000', decimals: '6' }, // 0.5 → volumeIn
    },
  ]
  const { topApps } = summarizeWalletApps(ME, [app], [], transfers)
  check('txCount = 2',      topApps[0]?.txCount,   2)
  check('volumeOut = 1.0',  topApps[0]?.volumeOut, 1.0)
  check('volumeIn = 0.5',   topApps[0]?.volumeIn,  0.5)
}

// ---------------------------------------------------------------------------
// 6. decimals null → defaults to 18; decimals undefined → defaults to 18.
// ---------------------------------------------------------------------------
console.log('\n--- 6. decimals null/undefined default to 18 ---')
{
  const app = fakeApp('app6', [{ address: ANCHOR1, usd: true }])
  // decimals: null
  const t1: Transfer = {
    timestamp: TS1,
    token: { address_hash: ANCHOR1 },
    from: { hash: OTHER },
    to: { hash: ME },
    total: { value: '1000000000000000000', decimals: null }, // 1.0 with 18 dec
  }
  // decimals: undefined (key absent from total)
  const t2: Transfer = {
    timestamp: TS2,
    token: { address_hash: ANCHOR1 },
    from: { hash: OTHER },
    to: { hash: ME },
    total: { value: '2000000000000000000' }, // 2.0 with 18 dec
  }
  const { topApps } = summarizeWalletApps(ME, [app], [], [t1, t2])
  check('volumeIn = 3.0', topApps[0]?.volumeIn, 3.0)
}

// ---------------------------------------------------------------------------
// 7. Transfer of a NON-USD anchor: counts txCount but adds no volume.
// ---------------------------------------------------------------------------
console.log('\n--- 7. non-usd anchor: txCount but no volume ---')
{
  const app = fakeApp('app7', [{ address: ANCHOR1, usd: false }])
  const transfers: Transfer[] = [
    {
      timestamp: TS1,
      token: { address_hash: ANCHOR1 },
      from: { hash: ME },
      to: { hash: OTHER },
      total: { value: '1000000', decimals: '6' },
    },
  ]
  const { topApps } = summarizeWalletApps(ME, [app], [], transfers)
  check('txCount = 1',     topApps[0]?.txCount,   1)
  check('volumeOut = 0',   topApps[0]?.volumeOut, 0)
  check('volumeIn = 0',    topApps[0]?.volumeIn,  0)
}

// ---------------------------------------------------------------------------
// 8. Missing `total` (undefined/null) adds 0 volume.
// ---------------------------------------------------------------------------
console.log('\n--- 8. missing total adds 0 volume ---')
{
  const app = fakeApp('app8', [{ address: ANCHOR1, usd: true }])
  const t1: Transfer = {
    timestamp: TS1,
    token: { address_hash: ANCHOR1 },
    from: { hash: ME },
    to: { hash: OTHER },
    total: undefined,
  }
  const t2: Transfer = {
    timestamp: TS2,
    token: { address_hash: ANCHOR1 },
    from: { hash: ME },
    to: { hash: OTHER },
    total: null,
  }
  const { topApps } = summarizeWalletApps(ME, [app], [], [t1, t2])
  check('txCount = 2',    topApps[0]?.txCount,   2)
  check('volumeOut = 0',  topApps[0]?.volumeOut, 0)
}

// ---------------------------------------------------------------------------
// 9. lastSeen is max timestamp regardless of input order.
// ---------------------------------------------------------------------------
console.log('\n--- 9. lastSeen = max timestamp ---')
{
  const app = fakeApp('app9', [{ address: ANCHOR1, usd: false }])
  // Deliver TS3 (latest) first, then TS1, then TS2.
  const txs: Tx[] = [
    { timestamp: TS3, from: { hash: ME }, to: { hash: ANCHOR1 }, value: '0' },
    { timestamp: TS1, from: { hash: ME }, to: { hash: ANCHOR1 }, value: '0' },
    { timestamp: TS2, from: { hash: ME }, to: { hash: ANCHOR1 }, value: '0' },
  ]
  const { topApps } = summarizeWalletApps(ME, [app], txs, [])
  check('lastSeen = TS3', topApps[0]?.lastSeen, TS3)
}

// ---------------------------------------------------------------------------
// 10. Sorting by txCount descending.
// ---------------------------------------------------------------------------
console.log('\n--- 10. sort by txCount descending ---')
{
  const appA = fakeApp('appA', [{ address: ANCHOR1 }])
  const appB = fakeApp('appB', [{ address: ANCHOR2 }])
  // appA gets 1 tx, appB gets 3 txs.
  const txs: Tx[] = [
    { timestamp: TS1, from: { hash: ME }, to: { hash: ANCHOR1 }, value: '0' },
    { timestamp: TS1, from: { hash: ME }, to: { hash: ANCHOR2 }, value: '0' },
    { timestamp: TS2, from: { hash: ME }, to: { hash: ANCHOR2 }, value: '0' },
    { timestamp: TS3, from: { hash: ME }, to: { hash: ANCHOR2 }, value: '0' },
  ]
  const { topApps } = summarizeWalletApps(ME, [appA, appB], txs, [])
  check('first is appB (3 txs)',   topApps[0]?.app.id,    'appB')
  check('second is appA (1 tx)',   topApps[1]?.app.id,    'appA')
  check('appB txCount = 3',        topApps[0]?.txCount,   3)
  check('appA txCount = 1',        topApps[1]?.txCount,   1)
}

// ---------------------------------------------------------------------------
// 11. Slice to top 10 when 12 apps match.
// ---------------------------------------------------------------------------
console.log('\n--- 11. slice to top 10 ---')
{
  // Build 12 apps each with a unique anchor; give app index i → (i+1) txs.
  const apps: ArcApp[] = []
  const txs: Tx[] = []
  const anchors: string[] = []
  for (let i = 0; i < 12; i++) {
    const addr = `0x${'0'.repeat(39)}${(i + 1).toString(16).padStart(1, '0')}` as string
    anchors.push(addr)
    apps.push(fakeApp(`bulk${i}`, [{ address: addr }]))
    for (let j = 0; j <= i; j++) {
      txs.push({ timestamp: TS1, from: { hash: ME }, to: { hash: addr }, value: '0' })
    }
  }
  const { topApps, scanned } = summarizeWalletApps(ME, apps, txs, [])
  check('topApps.length = 10',     topApps.length,                10)
  check('scanned = txs.length',    scanned,                       txs.length)
  // The highest-ranked app is bulk11 with 12 txs.
  check('first is bulk11',         topApps[0]?.app.id,            'bulk11')
  check('first txCount = 12',      topApps[0]?.txCount,           12)
}

// ---------------------------------------------------------------------------
// 12. scanned = txs.length + transfers.length even when nothing matches.
// ---------------------------------------------------------------------------
console.log('\n--- 12. scanned counts all inputs even without matches ---')
{
  const app = fakeApp('app12', [{ address: ANCHOR1 }])
  const txs: Tx[] = [
    { timestamp: TS1, from: { hash: ME }, to: { hash: OTHER }, value: '0' },
    { timestamp: TS2, from: { hash: ME }, to: null,            value: '0' },
  ]
  const transfers: Transfer[] = [
    {
      timestamp: TS3,
      token: { address_hash: OTHER },
      from: { hash: ME },
      to: { hash: ANCHOR1 },
      total: { value: '0', decimals: '6' },
    },
  ]
  const { topApps, scanned } = summarizeWalletApps(ME, [app], txs, transfers)
  check('topApps empty',  topApps.length, 0)
  check('scanned = 3',    scanned,        3)
}

// ---------------------------------------------------------------------------
// 13. Empty inputs → empty topApps, scanned = 0.
// ---------------------------------------------------------------------------
console.log('\n--- 13. empty inputs ---')
{
  const { topApps, scanned } = summarizeWalletApps(ME, [], [], [])
  check('topApps empty', topApps.length, 0)
  check('scanned = 0',   scanned,        0)
}

// ---------------------------------------------------------------------------
// 14. Two anchors of the same app merge into one row.
// ---------------------------------------------------------------------------
console.log('\n--- 14. two anchors same app → one row ---')
{
  const app = fakeApp('app14', [
    { address: ANCHOR1, usd: true },
    { address: ANCHOR2, usd: true },
  ])
  const txs: Tx[] = [
    { timestamp: TS1, from: { hash: ME }, to: { hash: ANCHOR1 }, value: '1000000000000000000' }, // 1.0
    { timestamp: TS2, from: { hash: ME }, to: { hash: ANCHOR2 }, value: '2000000000000000000' }, // 2.0
  ]
  const transfers: Transfer[] = [
    {
      timestamp: TS3,
      token: { address_hash: ANCHOR1 },
      from: { hash: OTHER },
      to: { hash: ME },
      total: { value: '500000', decimals: '6' }, // 0.5 volumeIn
    },
    {
      timestamp: TS1,
      token: { address_hash: ANCHOR2 },
      from: { hash: ME },
      to: { hash: OTHER },
      total: { value: '250000', decimals: '6' }, // 0.25 volumeOut
    },
  ]
  const { topApps } = summarizeWalletApps(ME, [app], txs, transfers)
  check('single row',                 topApps.length,             1)
  check('app id correct',             topApps[0]?.app.id,         'app14')
  // 2 txs + 2 transfers = 4
  check('txCount = 4',                topApps[0]?.txCount,        4)
  // volumeOut: 1.0 + 2.0 (native txs, not usd) + 0.25 (transfer from me) = 3.25
  check('volumeOut = 3.25',           topApps[0]?.volumeOut,      3.25)
  check('volumeIn = 0.5',             topApps[0]?.volumeIn,       0.5)
  check('lastSeen = TS3 (max)',       topApps[0]?.lastSeen,       TS3)
}

// ---------------------------------------------------------------------------
// 15. tx value of 0 adds 0 to volumeOut (edge case).
// ---------------------------------------------------------------------------
console.log('\n--- 15. tx value 0 ---')
{
  const app = fakeApp('app15', [{ address: ANCHOR1 }])
  const txs: Tx[] = [
    { timestamp: TS1, from: { hash: ME }, to: { hash: ANCHOR1 }, value: '0' },
  ]
  const { topApps } = summarizeWalletApps(ME, [app], txs, [])
  check('txCount = 1',    topApps[0]?.txCount,   1)
  check('volumeOut = 0',  topApps[0]?.volumeOut, 0)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`)
console.log(`Result: ${passed}/${total} passed${passed < total ? ` — ${total - passed} FAILED` : ''}`)
if (passed < total) process.exit(1)
