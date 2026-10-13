/**
 * Tests for src/lib/walletTiers.ts
 * Run: node --experimental-strip-types --no-warnings src/lib/walletTiers.test.ts
 *
 * Uses node:assert/strict only — no test framework.
 * Import style mirrors walletMilestones.test.ts.
 */

import assert from 'node:assert/strict'
import type { WalletRecord } from './walletIndex.ts'
import { buildTiers, reachedTiers, INDEXER_CAP } from './walletTiers.ts'

// ── Helpers ────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0

function test(name: string, fn: () => void): void {
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

/** Minimal WalletRecord without ext. */
function makeRec(ext?: WalletRecord['ext']): WalletRecord {
  const base: WalletRecord = {
    f: 0, l: 0, d: '1', t: 0, x: 0, e: 0, o: 0, i: 0, a: '0', bo: 0, bi: 0,
  }
  if (ext !== undefined) base.ext = ext
  return base
}

/** Build an array of `n` distinct 8-hex-char strings. */
function prefixes(n: number): string[] {
  return Array.from({ length: n }, (_, i) => i.toString(16).padStart(8, '0'))
}

// ── No ext → empty result ─────────────────────────────────────────────────────

console.log('\next absent')

test('no ext field → buildTiers returns []', () => {
  assert.deepEqual(buildTiers(makeRec()), [])
})

test('no ext field → reachedTiers returns []', () => {
  assert.deepEqual(reachedTiers(makeRec()), [])
})

test('ext=undefined explicitly → []', () => {
  assert.deepEqual(buildTiers(makeRec(undefined)), [])
})

// ── Empty ext object → all tiers present but not reached ─────────────────────

console.log('\nempty ext {}')

test('ext={} → 12 tier objects returned', () => {
  const tiers = buildTiers(makeRec({}))
  assert.equal(tiers.length, 12)
})

test('ext={} → no tier reached', () => {
  const tiers = buildTiers(makeRec({}))
  assert.ok(tiers.every(t => !t.reached), 'no tier should be reached on empty ext')
})

test('ext={} → all atCap false', () => {
  const tiers = buildTiers(makeRec({}))
  assert.ok(tiers.every(t => !t.atCap), 'atCap should be false on empty ext')
})

// ── Deploy tiers ──────────────────────────────────────────────────────────────

console.log('\nDeploy tiers (dp)')

function dp(n: number) { return buildTiers(makeRec({ dp: n })) }
function findTier(tiers: ReturnType<typeof buildTiers>, id: string) {
  const t = tiers.find(t => t.id === id)
  assert.ok(t !== undefined, `tier ${id} not found`)
  return t
}

test('dp=0 → deploy-1 not reached', () => {
  assert.equal(findTier(dp(0), 'deploy-1').reached, false)
})

test('dp=0 → deploy-1 value=0', () => {
  assert.equal(findTier(dp(0), 'deploy-1').value, 0)
})

test('dp=1 (threshold) → deploy-1 reached', () => {
  assert.equal(findTier(dp(1), 'deploy-1').reached, true)
})

test('dp=1 → deploy-5 not reached', () => {
  assert.equal(findTier(dp(1), 'deploy-5').reached, false)
})

test('dp=4 → deploy-5 not reached', () => {
  assert.equal(findTier(dp(4), 'deploy-5').reached, false)
})

test('dp=5 (threshold) → deploy-5 reached', () => {
  assert.equal(findTier(dp(5), 'deploy-5').reached, true)
})

test('dp=19 → deploy-20 not reached', () => {
  assert.equal(findTier(dp(19), 'deploy-20').reached, false)
})

test('dp=20 (threshold) → deploy-20 reached', () => {
  assert.equal(findTier(dp(20), 'deploy-20').reached, true)
})

test('dp=21 → deploy-20 reached (above threshold)', () => {
  assert.equal(findTier(dp(21), 'deploy-20').reached, true)
})

test('deploy tiers: atCap always false (dp is a plain integer)', () => {
  const tiers = buildTiers(makeRec({ dp: 100 }))
  for (const t of tiers.filter(t => t.group === 'deploy')) {
    assert.equal(t.atCap, false, `deploy tier ${t.id} should never have atCap`)
  }
})

// ── Token diversity tiers (ut) ────────────────────────────────────────────────

console.log('\nToken diversity tiers (ut)')

function ut(n: number) { return buildTiers(makeRec({ ut: prefixes(n) })) }

test('ut length=2 → token-div-3 not reached', () => {
  assert.equal(findTier(ut(2), 'token-div-3').reached, false)
})

test('ut length=3 (threshold) → token-div-3 reached', () => {
  assert.equal(findTier(ut(3), 'token-div-3').reached, true)
})

test('ut length=9 → token-div-10 not reached', () => {
  assert.equal(findTier(ut(9), 'token-div-10').reached, false)
})

test('ut length=10 (threshold) → token-div-10 reached', () => {
  assert.equal(findTier(ut(10), 'token-div-10').reached, true)
})

test('ut length=29 → token-div-30 not reached', () => {
  assert.equal(findTier(ut(29), 'token-div-30').reached, false)
})

test('ut length=30 (threshold) → token-div-30 reached', () => {
  assert.equal(findTier(ut(30), 'token-div-30').reached, true)
})

test('ut at cap (64) → atCap true on all token-diversity tiers', () => {
  const tiers = buildTiers(makeRec({ ut: prefixes(INDEXER_CAP) }))
  for (const t of tiers.filter(t => t.group === 'token-diversity')) {
    assert.equal(t.atCap, true, `token tier ${t.id} should have atCap=true at cap`)
  }
})

test('ut length=63 (below cap) → atCap false', () => {
  const tiers = buildTiers(makeRec({ ut: prefixes(63) }))
  for (const t of tiers.filter(t => t.group === 'token-diversity')) {
    assert.equal(t.atCap, false, `token tier ${t.id} should have atCap=false below cap`)
  }
})

// ── NFT diversity tiers (un) ──────────────────────────────────────────────────

console.log('\nNFT diversity tiers (un)')

function un(n: number) { return buildTiers(makeRec({ un: prefixes(n) })) }

test('un length=0 → nft-div-1 not reached', () => {
  assert.equal(findTier(un(0), 'nft-div-1').reached, false)
})

test('un length=1 (threshold) → nft-div-1 reached', () => {
  assert.equal(findTier(un(1), 'nft-div-1').reached, true)
})

test('un length=4 → nft-div-5 not reached', () => {
  assert.equal(findTier(un(4), 'nft-div-5').reached, false)
})

test('un length=5 (threshold) → nft-div-5 reached', () => {
  assert.equal(findTier(un(5), 'nft-div-5').reached, true)
})

test('un length=19 → nft-div-20 not reached', () => {
  assert.equal(findTier(un(19), 'nft-div-20').reached, false)
})

test('un length=20 (threshold) → nft-div-20 reached', () => {
  assert.equal(findTier(un(20), 'nft-div-20').reached, true)
})

test('un at cap (64) → atCap true on nft-diversity tiers', () => {
  const tiers = buildTiers(makeRec({ un: prefixes(INDEXER_CAP) }))
  for (const t of tiers.filter(t => t.group === 'nft-diversity')) {
    assert.equal(t.atCap, true, `nft tier ${t.id} should have atCap=true at cap`)
  }
})

// ── Contract diversity tiers (uc) ─────────────────────────────────────────────

console.log('\nContract diversity tiers (uc)')

function uc(n: number) { return buildTiers(makeRec({ uc: prefixes(n) })) }

test('uc length=4 → contract-div-5 not reached', () => {
  assert.equal(findTier(uc(4), 'contract-div-5').reached, false)
})

test('uc length=5 (threshold) → contract-div-5 reached', () => {
  assert.equal(findTier(uc(5), 'contract-div-5').reached, true)
})

test('uc length=19 → contract-div-20 not reached', () => {
  assert.equal(findTier(uc(19), 'contract-div-20').reached, false)
})

test('uc length=20 (threshold) → contract-div-20 reached', () => {
  assert.equal(findTier(uc(20), 'contract-div-20').reached, true)
})

test('uc length=49 → contract-div-50 not reached', () => {
  assert.equal(findTier(uc(49), 'contract-div-50').reached, false)
})

test('uc length=50 (threshold) → contract-div-50 reached', () => {
  assert.equal(findTier(uc(50), 'contract-div-50').reached, true)
})

test('uc at cap (64) → atCap true on contract-diversity tiers', () => {
  const tiers = buildTiers(makeRec({ uc: prefixes(INDEXER_CAP) }))
  for (const t of tiers.filter(t => t.group === 'contract-diversity')) {
    assert.equal(t.atCap, true)
  }
})

test('uc length=63 → contract-div-50 reached AND atCap false', () => {
  const tiers = buildTiers(makeRec({ uc: prefixes(63) }))
  const t = findTier(tiers, 'contract-div-50')
  assert.equal(t.reached, true)
  assert.equal(t.atCap, false)
})

// ── Cap boundary: exactly 64 vs 63 ────────────────────────────────────────────

console.log('\nCap boundary')

test('INDEXER_CAP constant is 64', () => {
  assert.equal(INDEXER_CAP, 64)
})

test('length=64 → atCap true', () => {
  const tiers = buildTiers(makeRec({ ut: prefixes(64) }))
  assert.ok(tiers.filter(t => t.group === 'token-diversity').every(t => t.atCap))
})

test('length=65 → atCap true (above cap)', () => {
  // buildTiers itself does not enforce a ceiling; atCap triggers when length >= INDEXER_CAP
  const tiers = buildTiers(makeRec({ ut: prefixes(65) }))
  assert.ok(tiers.filter(t => t.group === 'token-diversity').every(t => t.atCap))
})

// ── Corrupt / bad input ────────────────────────────────────────────────────────

console.log('\nCorrupt / bad input (silently treated as 0)')

test('dp=-1 (negative) → deploy-1 not reached, value=0', () => {
  const tiers = buildTiers(makeRec({ dp: -1 }))
  const t = findTier(tiers, 'deploy-1')
  assert.equal(t.reached, false)
  assert.equal(t.value, 0)
})

test('dp=NaN → deploy-1 not reached, value=0', () => {
  const tiers = buildTiers(makeRec({ dp: NaN }))
  const t = findTier(tiers, 'deploy-1')
  assert.equal(t.reached, false)
  assert.equal(t.value, 0)
})

test('dp=Infinity → deploy-1 not reached, value=0', () => {
  const tiers = buildTiers(makeRec({ dp: Infinity }))
  const t = findTier(tiers, 'deploy-1')
  assert.equal(t.reached, false)
  assert.equal(t.value, 0)
})

test('dp="5" (string) → value=0', () => {
  // TypeScript would flag this, but we guard at runtime too
  const tiers = buildTiers(makeRec({ dp: '5' as unknown as number }))
  assert.equal(findTier(tiers, 'deploy-1').value, 0)
})

test('ut=null → token-div-3 value=0', () => {
  const tiers = buildTiers(makeRec({ ut: null as unknown as string[] }))
  assert.equal(findTier(tiers, 'token-div-3').value, 0)
})

test('ut="oops" (string, not array) → value=0', () => {
  const tiers = buildTiers(makeRec({ ut: 'oops' as unknown as string[] }))
  assert.equal(findTier(tiers, 'token-div-3').value, 0)
})

test('ut=42 (number, not array) → value=0', () => {
  const tiers = buildTiers(makeRec({ ut: 42 as unknown as string[] }))
  assert.equal(findTier(tiers, 'token-div-3').value, 0)
})

test('un=[] (empty array) → nft-div-1 not reached', () => {
  const tiers = buildTiers(makeRec({ un: [] }))
  assert.equal(findTier(tiers, 'nft-div-1').reached, false)
})

test('dp=1.9 (float) → floored to 1 → deploy-1 reached', () => {
  const tiers = buildTiers(makeRec({ dp: 1.9 }))
  assert.equal(findTier(tiers, 'deploy-1').reached, true)
  assert.equal(findTier(tiers, 'deploy-1').value, 1)
})

test('dp=0.9 (float < 1) → floored to 0 → deploy-1 not reached', () => {
  const tiers = buildTiers(makeRec({ dp: 0.9 }))
  assert.equal(findTier(tiers, 'deploy-1').reached, false)
  assert.equal(findTier(tiers, 'deploy-1').value, 0)
})

// ── Tier ids and structure ─────────────────────────────────────────────────────

console.log('\nTier structure')

test('12 tiers total (3 deploy + 3 token + 3 nft + 3 contract)', () => {
  const tiers = buildTiers(makeRec({}))
  assert.equal(tiers.length, 12)
})

test('all expected tier ids present', () => {
  const tiers = buildTiers(makeRec({}))
  const ids = tiers.map(t => t.id)
  const expected = [
    'deploy-1', 'deploy-5', 'deploy-20',
    'token-div-3', 'token-div-10', 'token-div-30',
    'nft-div-1', 'nft-div-5', 'nft-div-20',
    'contract-div-5', 'contract-div-20', 'contract-div-50',
  ]
  for (const id of expected) {
    assert.ok(ids.includes(id), `missing tier id: ${id}`)
  }
})

test('each tier has a non-empty label and description', () => {
  const tiers = buildTiers(makeRec({}))
  for (const t of tiers) {
    assert.ok(t.label.length > 0, `empty label on ${t.id}`)
    assert.ok(t.description.length > 0, `empty description on ${t.id}`)
  }
})

test('thresholds match spec: deploy [1,5,20], token [3,10,30], nft [1,5,20], contract [5,20,50]', () => {
  const tiers = buildTiers(makeRec({}))
  const th = (id: string) => tiers.find(t => t.id === id)!.threshold
  assert.equal(th('deploy-1'), 1)
  assert.equal(th('deploy-5'), 5)
  assert.equal(th('deploy-20'), 20)
  assert.equal(th('token-div-3'), 3)
  assert.equal(th('token-div-10'), 10)
  assert.equal(th('token-div-30'), 30)
  assert.equal(th('nft-div-1'), 1)
  assert.equal(th('nft-div-5'), 5)
  assert.equal(th('nft-div-20'), 20)
  assert.equal(th('contract-div-5'), 5)
  assert.equal(th('contract-div-20'), 20)
  assert.equal(th('contract-div-50'), 50)
})

// ── reachedTiers helper ────────────────────────────────────────────────────────

console.log('\nreachedTiers')

test('reachedTiers: ext absent → []', () => {
  assert.deepEqual(reachedTiers(makeRec()), [])
})

test('reachedTiers: dp=5 → deploy-1 and deploy-5 in result', () => {
  const reached = reachedTiers(makeRec({ dp: 5 }))
  const ids = reached.map(t => t.id)
  assert.ok(ids.includes('deploy-1'), 'deploy-1 should be reached')
  assert.ok(ids.includes('deploy-5'), 'deploy-5 should be reached')
  assert.ok(!ids.includes('deploy-20'), 'deploy-20 should NOT be reached')
})

test('reachedTiers: every returned tier has reached=true', () => {
  const reached = reachedTiers(makeRec({ dp: 20, ut: prefixes(10), un: prefixes(1), uc: prefixes(5) }))
  assert.ok(reached.every(t => t.reached), 'all returned tiers must have reached=true')
})

test('reachedTiers: full ext at cap → all 12 tiers reached', () => {
  const reached = reachedTiers(makeRec({ dp: 20, ut: prefixes(64), un: prefixes(64), uc: prefixes(64) }))
  assert.equal(reached.length, 12)
})

// ── Mixed fields ───────────────────────────────────────────────────────────────

console.log('\nMixed fields')

test('atCap on ut does not affect un or uc tiers', () => {
  const tiers = buildTiers(makeRec({ ut: prefixes(64) }))
  for (const t of tiers.filter(t => t.group !== 'token-diversity')) {
    assert.equal(t.atCap, false, `group ${t.group} tier ${t.id} should not have atCap from ut`)
  }
})

test('all four groups coexist without interference', () => {
  const tiers = buildTiers(makeRec({ dp: 1, ut: prefixes(3), un: prefixes(5), uc: prefixes(5) }))
  assert.equal(tiers.filter(t => t.group === 'deploy' && t.reached).length, 1) // deploy-1 only
  assert.equal(tiers.filter(t => t.group === 'token-diversity' && t.reached).length, 1) // token-div-3 only
  assert.equal(tiers.filter(t => t.group === 'nft-diversity' && t.reached).length, 2) // nft-div-1, nft-div-5
  assert.equal(tiers.filter(t => t.group === 'contract-diversity' && t.reached).length, 1) // contract-div-5 only
})

test('numeric strings in dp are not coerced (treated as 0)', () => {
  const tiers = buildTiers(makeRec({ dp: '5' as unknown as number }))
  assert.equal(tiers.filter(t => t.group === 'deploy' && t.reached).length, 0)
})

test('ext null returns empty (not a crash)', () => {
  const rec = makeRec()
  ;(rec as unknown as { ext: unknown }).ext = null
  assert.deepEqual(buildTiers(rec), [])
})

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
