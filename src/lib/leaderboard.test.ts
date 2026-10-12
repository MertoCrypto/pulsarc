/**
 * Unit tests for leaderboard.ts
 *
 * Run:
 *   node --experimental-strip-types --no-warnings src/lib/leaderboard.test.ts
 */

import assert from 'node:assert/strict'
import type { ArcApp } from '@/data/apps'
import {
  buildLeaderboard,
  attestersToVerify,
  periodSince,
  inPeriod,
  PERIOD_S,
} from './leaderboard.ts'

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
let pass = 0
let total = 0
function check<T>(label: string, actual: T, expected: T): void {
  total++
  try {
    assert.deepEqual(actual, expected)
    console.log(`  PASS  ${label}`)
    pass++
  } catch (e: unknown) {
    const err = e as { message?: string }
    console.error(`  FAIL  ${label}`)
    console.error(`        ${err.message ?? String(e)}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const app = (id: string) => ({ id }) as unknown as ArcApp

// Fixed "now" for deterministic periodSince tests.
// nowMs = 1_000_000_000_000 => nowS = 1_000_000_000
const NOW_MS = 1_000_000_000_000

// ---------------------------------------------------------------------------
// PERIOD_S constant sanity
// ---------------------------------------------------------------------------
console.log('\n--- PERIOD_S ---')
check('weekly  = 604800s', PERIOD_S.weekly, 604_800)
check('monthly = 2592000s', PERIOD_S.monthly, 2_592_000)
check('alltime = Infinity', PERIOD_S.alltime, Infinity)

// ---------------------------------------------------------------------------
// periodSince
// ---------------------------------------------------------------------------
console.log('\n--- periodSince ---')
// weekly:  floor(NOW_MS/1000) - 604800 = 1_000_000_000 - 604_800 = 999_395_200
check('weekly since', periodSince('weekly', NOW_MS), 999_395_200)
// monthly: 1_000_000_000 - 2_592_000 = 997_408_000
check('monthly since', periodSince('monthly', NOW_MS), 997_408_000)
// alltime: 0 (Infinity period)
check('alltime since', periodSince('alltime', NOW_MS), 0)

// Edge: floor is used, not round
// nowMs = 1_500 => nowS = 1 (floor), weekly since = 1 - 604800 = -604799
check('floor used (not round)', periodSince('weekly', 1_500), 1 - 604_800)

// ---------------------------------------------------------------------------
// inPeriod
// ---------------------------------------------------------------------------
console.log('\n--- inPeriod ---')
const SINCE = 1000

check('no timestamp -> true',   inPeriod({}, SINCE), true)
check('empty timestamp -> true', inPeriod({ timestamp: '' }, SINCE), true)
check('timestamp == since -> true', inPeriod({ timestamp: '1000' }, SINCE), true)
check('timestamp > since -> true',  inPeriod({ timestamp: '2000' }, SINCE), true)
check('timestamp < since -> false', inPeriod({ timestamp: '999' }, SINCE), false)
check('timestamp = 0, since = 1 -> false', inPeriod({ timestamp: '0' }, SINCE), false)
check('since = 0 (alltime): any ts passes', inPeriod({ timestamp: '1' }, 0), true)
check('since = 0 (alltime): ts=0 passes', inPeriod({ timestamp: '0' }, 0), true)

// ---------------------------------------------------------------------------
// attestersToVerify
// ---------------------------------------------------------------------------
console.log('\n--- attestersToVerify ---')
const SINCE2 = 500

// Basic: lower-cases and returns in first-seen order
check(
  'lower-cases addresses',
  attestersToVerify([{ user: '0xAB', timestamp: '600' }], SINCE2),
  ['0xab'],
)

// Deduplication (mixed case same address)
check(
  'deduplicates same address different cases',
  attestersToVerify([
    { user: '0xAB', timestamp: '600' },
    { user: '0xab', timestamp: '700' },
    { user: '0xAb', timestamp: '800' },
  ], SINCE2),
  ['0xab'],
)

// Skips empty/missing user
check(
  'skips empty user',
  attestersToVerify([{ user: '', timestamp: '600' }], SINCE2),
  [],
)
check(
  'skips missing user',
  attestersToVerify([{ timestamp: '600' }], SINCE2),
  [],
)

// Skips rows outside period
check(
  'skips rows before since',
  attestersToVerify([
    { user: '0xAA', timestamp: '400' }, // before SINCE2=500 -> excluded
    { user: '0xBB', timestamp: '600' }, // included
  ], SINCE2),
  ['0xbb'],
)

// No timestamp -> included
check(
  'no timestamp row is included',
  attestersToVerify([{ user: '0xCC' }], SINCE2),
  ['0xcc'],
)

// Preserves first-seen order
check(
  'preserves first-seen order',
  attestersToVerify([
    { user: '0x01', timestamp: '600' },
    { user: '0x02', timestamp: '700' },
    { user: '0x03', timestamp: '800' },
  ], SINCE2),
  ['0x01', '0x02', '0x03'],
)

// Caps at 20 from 25 distinct addresses
{
  const rows = Array.from({ length: 25 }, (_, i) => ({
    user: `0x${String(i + 1).padStart(40, '0')}`,
    timestamp: '600',
  }))
  const result = attestersToVerify(rows, SINCE2)
  check('caps at 20', result.length, 20)
  check('first 20 in order', result[0], `0x${String(1).padStart(40, '0')}`)
  check('20th entry correct', result[19], `0x${String(20).padStart(40, '0')}`)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — score formula
// ---------------------------------------------------------------------------
console.log('\n--- buildLeaderboard score formula ---')

// Setup: one app, manual row data.
// scaled('2500000', 6) = '2500000'.padStart(7,'0') = '2500000'
//   whole = '2500000'.slice(0, 1) = '2'  (length=7, d=6, whole = s.slice(0, 7-6)='2')
//   frac  = '2500000'.slice(1)    = '500000'
//   => Number('2.500000') = 2.5
//
// votes=3, attestations=4 (2 verified + 2 unverified), boostUsdc=2.5
// score = 3*1 + 2*2 + (4-2)*0.5 + 2.5*10 = 3 + 4 + 1 + 25 = 33

{
  const appA = app('app-a')
  const hashA = '0xhasha'
  const byHash: Map<string, string> = new Map([[hashA, 'app-a']])

  const attesterVerified1 = '0xVerified1'
  const attesterVerified2 = '0xVerified2'
  const attesterUnverified = '0xUnverified'

  const usedBy: Map<string, ReadonlySet<string>> = new Map([
    [attesterVerified1.toLowerCase(), new Set(['app-a'])],
    [attesterVerified2.toLowerCase(), new Set(['app-a'])],
    // attesterUnverified not in usedBy -> not verified
  ])

  const votes = [
    { dappId: hashA, voter: '0xVoter1', timestamp: '1000' },
    { dappId: hashA, voter: '0xVoter2', timestamp: '1000' },
    { dappId: hashA, voter: '0xVoter3', timestamp: '1000' },
  ]
  const attests = [
    { dappId: hashA, user: attesterVerified1, timestamp: '1000' },
    { dappId: hashA, user: attesterVerified2, timestamp: '1000' },
    { dappId: hashA, user: attesterUnverified, timestamp: '1000' },
    { dappId: hashA, user: attesterUnverified, timestamp: '1000' }, // second from same -> still 2 total unverified contributions
  ]
  const boosts = [
    { dappId: hashA, booster: '0xBooster1', amount: '2500000', timestamp: '1000' },
  ]

  const { entries } = buildLeaderboard({
    apps: [appA],
    byHash,
    votes,
    attests,
    boosts,
    since: 0,
    usedBy,
  })

  const e = entries[0]
  check('score formula: votes', e.votes, 3)
  check('score formula: attestations total', e.attestations, 4)
  check('score formula: verifiedAttestations', e.verifiedAttestations, 2)
  check('score formula: boostUsdc', e.boostUsdc, 2.5)
  // score = 3 + 2*2 + (4-2)*0.5 + 2.5*10 = 3 + 4 + 1 + 25 = 33
  check('score formula: score = 33', e.score, 33)
  check('score formula: rank = 1', e.rank, 1)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — dappId case-insensitivity
// ---------------------------------------------------------------------------
console.log('\n--- dappId case-insensitivity ---')
{
  const appB = app('app-b')
  // byHash uses lower-cased key
  const byHash: Map<string, string> = new Map([['0xhashb', 'app-b']])

  // Row uses uppercase dappId
  const votes = [
    { dappId: '0xHASHB', voter: '0xVoterX', timestamp: '1000' },
  ]
  const { entries } = buildLeaderboard({
    apps: [appB],
    byHash,
    votes,
    attests: [],
    boosts: [],
    since: 0,
    usedBy: new Map(),
  })
  check('dappId uppercase matches lowercase key', entries[0].votes, 1)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — unknown dappId: person counted for votes, app unchanged
// ---------------------------------------------------------------------------
console.log('\n--- unknown dappId ---')
{
  const appC = app('app-c')
  const byHash: Map<string, string> = new Map([['0xhashc', 'app-c']])

  const votes = [
    { dappId: '0xunknown', voter: '0xVoterY', timestamp: '1000' }, // unknown dappId
  ]
  const { entries, topContributors } = buildLeaderboard({
    apps: [appC],
    byHash,
    votes,
    attests: [],
    boosts: [],
    since: 0,
    usedBy: new Map(),
  })
  check('unknown dappId: app-c votes unchanged', entries[0].votes, 0)
  // person still appears in topContributors (they voted, just no app matched)
  check('unknown dappId: voter still counted as person', topContributors.length, 1)
  check('unknown dappId: voter vote counted', topContributors[0].votes, 1)
  // appsInteracted = 0 because no known app was matched
  check('unknown dappId: appsInteracted = 0', topContributors[0].appsInteracted, 0)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — rows outside period are ignored everywhere
// ---------------------------------------------------------------------------
console.log('\n--- rows outside period ignored ---')
{
  const appD = app('app-d')
  const byHash: Map<string, string> = new Map([['0xhashd', 'app-d']])
  const SINCE = 1000

  const votes = [
    { dappId: '0xhashd', voter: '0xV1', timestamp: '999' }, // before since -> ignored
    { dappId: '0xhashd', voter: '0xV2', timestamp: '1000' }, // at since -> included
  ]
  const attests = [
    { dappId: '0xhashd', user: '0xA1', timestamp: '500' }, // before since -> ignored
  ]
  const boosts = [
    { dappId: '0xhashd', booster: '0xB1', amount: '1000000', timestamp: '100' }, // before since -> ignored
  ]
  const { entries } = buildLeaderboard({
    apps: [appD],
    byHash,
    votes,
    attests,
    boosts,
    since: SINCE,
    usedBy: new Map(),
  })
  check('out-of-period vote ignored', entries[0].votes, 1)         // only the ts=1000 one counts
  check('out-of-period attestation ignored', entries[0].attestations, 0)
  check('out-of-period boost ignored', entries[0].boostUsdc, 0)
  // score = 1 + 0 + 0 + 0 = 1
  check('out-of-period: score = 1', entries[0].score, 1)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — verified: attester not in usedBy -> not verified
// ---------------------------------------------------------------------------
console.log('\n--- verified: attester must have app in usedBy ---')
{
  const appE = app('app-e')
  const byHash: Map<string, string> = new Map([['0xhashe', 'app-e']])

  const attesterWrong = '0xwrong'
  const usedBy: Map<string, ReadonlySet<string>> = new Map([
    // attesterWrong used a DIFFERENT app, not app-e
    [attesterWrong.toLowerCase(), new Set(['app-other'])],
  ])
  const attests = [
    { dappId: '0xhashe', user: attesterWrong, timestamp: '1000' },
  ]
  const { entries } = buildLeaderboard({
    apps: [appE],
    byHash,
    votes: [],
    attests,
    boosts: [],
    since: 0,
    usedBy,
  })
  check('wrong app in usedBy -> not verified', entries[0].verifiedAttestations, 0)
  check('wrong app: attestations still counted', entries[0].attestations, 1)
  // score = 0 + 0*2 + (1-0)*0.5 + 0 = 0.5
  check('wrong app: score = 0.5', entries[0].score, 0.5)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — verified: case-insensitive attester match
// ---------------------------------------------------------------------------
console.log('\n--- verified: attester match is case-insensitive ---')
{
  const appF = app('app-f')
  const byHash: Map<string, string> = new Map([['0xhashf', 'app-f']])

  // usedBy key is lowercase; row user is uppercase
  const usedBy: Map<string, ReadonlySet<string>> = new Map([
    ['0xattester', new Set(['app-f'])],
  ])
  const attests = [
    { dappId: '0xhashf', user: '0xATTESTER', timestamp: '1000' },
  ]
  const { entries } = buildLeaderboard({
    apps: [appF],
    byHash,
    votes: [],
    attests,
    boosts: [],
    since: 0,
    usedBy,
  })
  check('uppercase attester matched via lower-case key', entries[0].verifiedAttestations, 1)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — ranks, zero-activity apps, stable ties
// ---------------------------------------------------------------------------
console.log('\n--- ranks, zero apps, tie stability ---')
{
  const appG1 = app('app-g1')
  const appG2 = app('app-g2')
  const appG3 = app('app-g3') // no activity
  const byHash: Map<string, string> = new Map([
    ['0xhashg1', 'app-g1'],
    ['0xhashg2', 'app-g2'],
  ])

  // appG1: 2 votes -> score 2
  // appG2: 2 votes -> score 2  (tie — appG1 came first in apps array)
  // appG3: nothing -> score 0
  const votes = [
    { dappId: '0xhashg1', voter: '0xV1', timestamp: '1000' },
    { dappId: '0xhashg1', voter: '0xV2', timestamp: '1000' },
    { dappId: '0xhashg2', voter: '0xV3', timestamp: '1000' },
    { dappId: '0xhashg2', voter: '0xV4', timestamp: '1000' },
  ]
  const { entries } = buildLeaderboard({
    apps: [appG1, appG2, appG3],
    byHash,
    votes,
    attests: [],
    boosts: [],
    since: 0,
    usedBy: new Map(),
  })

  check('three entries returned', entries.length, 3)
  check('zero-activity app listed', entries[2].app.id, 'app-g3')
  check('zero-activity score = 0', entries[2].score, 0)
  check('zero-activity rank = 3', entries[2].rank, 3)
  // Tie: appG1 and appG2 both score 2; stable sort preserves original order
  check('tie: rank 1 app is app-g1 (original order)', entries[0].app.id, 'app-g1')
  check('tie: rank 2 app is app-g2 (original order)', entries[1].app.id, 'app-g2')
  check('rank 1 score = 2', entries[0].score, 2)
  check('rank 2 score = 2', entries[1].score, 2)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — topContributors
// ---------------------------------------------------------------------------
console.log('\n--- topContributors ---')

// Key is lower-cased address; same person different cases merges (keeps first-seen casing).
// Weight = votes + attestations*2 + boostUsdc*10
// Cap at 10; give 12 distinct people.
// appsInteracted counts distinct known apps only.
{
  const appH = app('app-h')
  const appH2 = app('app-h2')
  const byHash: Map<string, string> = new Map([
    ['0xhashh', 'app-h'],
    ['0xhashh2', 'app-h2'],
  ])

  // Person '0xAlpha' votes 5 times (weight=5), addresses in both cases -> merges
  // Person '0xBeta' attests 3 times (weight=6)
  // Person '0xGamma' boosts '5000000' -> 5.0 USDC (weight=50)
  // 9 more people each vote once (weight=1 each) -> total 12 people
  const votes = [
    { dappId: '0xhashh', voter: '0xAlpha', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0XALPHA', timestamp: '1001' }, // same person, uppercase
    { dappId: '0xhashh', voter: '0xAlpha', timestamp: '1002' },
    { dappId: '0xhashh', voter: '0xAlpha', timestamp: '1003' },
    { dappId: '0xhashh', voter: '0xAlpha', timestamp: '1004' },
    // 9 extra unique voters
    { dappId: '0xhashh', voter: '0xP01', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0xP02', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0xP03', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0xP04', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0xP05', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0xP06', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0xP07', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0xP08', timestamp: '1000' },
    { dappId: '0xhashh', voter: '0xP09', timestamp: '1000' },
  ]
  const attests = [
    { dappId: '0xhashh2', user: '0xBeta', timestamp: '1000' },
    { dappId: '0xhashh2', user: '0xBeta', timestamp: '1001' },
    { dappId: '0xhashh2', user: '0xBeta', timestamp: '1002' },
  ]
  const boosts = [
    { dappId: '0xhashh', booster: '0xGamma', amount: '5000000', timestamp: '1000' },
  ]

  const { topContributors } = buildLeaderboard({
    apps: [appH, appH2],
    byHash,
    votes,
    attests,
    boosts,
    since: 0,
    usedBy: new Map(),
  })

  check('topContributors capped at 10', topContributors.length, 10)

  // 0xGamma weight=50 -> rank 1
  check('rank 1 is 0xGamma (highest boost weight)', topContributors[0].address, '0xGamma')
  check('0xGamma boostUsdc = 5', topContributors[0].boostUsdc, 5)

  // 0xBeta weight=6 -> rank 2
  check('rank 2 is 0xBeta (attestations weight=6)', topContributors[1].address, '0xBeta')
  check('0xBeta attestations = 3', topContributors[1].attestations, 3)

  // 0xAlpha weight=5 -> rank 3 (5 votes merged from mixed casing)
  check('rank 3 is 0xAlpha (merged votes)', topContributors[2].address, '0xAlpha')
  check('0xAlpha votes merged = 5', topContributors[2].votes, 5)

  // Same address different cases: first-seen address value kept ('0xAlpha' seen first)
  check('0xAlpha first-seen casing preserved', topContributors[2].address, '0xAlpha')

  // appsInteracted: 0xAlpha voted on app-h only -> 1
  check('0xAlpha appsInteracted = 1', topContributors[2].appsInteracted, 1)
  // 0xBeta attested on app-h2 only -> 1
  check('0xBeta appsInteracted = 1', topContributors[1].appsInteracted, 1)
}

// ---------------------------------------------------------------------------
// buildLeaderboard — hasActivity
// ---------------------------------------------------------------------------
console.log('\n--- hasActivity ---')
{
  const appI = app('app-i')
  const byHash: Map<string, string> = new Map([['0xhashi', 'app-i']])

  // No rows -> false
  const r1 = buildLeaderboard({ apps: [appI], byHash, votes: [], attests: [], boosts: [], since: 0, usedBy: new Map() })
  check('no rows -> hasActivity = false', r1.hasActivity, false)

  // Single vote -> true
  const r2 = buildLeaderboard({
    apps: [appI],
    byHash,
    votes: [{ dappId: '0xhashi', voter: '0xV', timestamp: '1000' }],
    attests: [],
    boosts: [],
    since: 0,
    usedBy: new Map(),
  })
  check('single vote -> hasActivity = true', r2.hasActivity, true)

  // Only a boost -> true
  const r3 = buildLeaderboard({
    apps: [appI],
    byHash,
    votes: [],
    attests: [],
    boosts: [{ dappId: '0xhashi', booster: '0xB', amount: '1000000', timestamp: '1000' }],
    since: 0,
    usedBy: new Map(),
  })
  check('only boost -> hasActivity = true', r3.hasActivity, true)

  // All rows out of period -> false
  const r4 = buildLeaderboard({
    apps: [appI],
    byHash,
    votes: [{ dappId: '0xhashi', voter: '0xV', timestamp: '100' }],
    attests: [{ dappId: '0xhashi', user: '0xA', timestamp: '50' }],
    boosts: [{ dappId: '0xhashi', booster: '0xB', amount: '1000000', timestamp: '1' }],
    since: 1000,
    usedBy: new Map(),
  })
  check('all rows out of period -> hasActivity = false', r4.hasActivity, false)
}

// ---------------------------------------------------------------------------
// Extra cases added after mutation checks
// ---------------------------------------------------------------------------
console.log('\n--- extra: period vs verified, contributor weights, missing person ---')
{
  const X = app('x')
  const byHashX = new Map([['0xhashx', 'x']])
  // Verified attester has one attestation inside the period and one before it:
  // only the inside one may count, as attestation and as verified.
  const rv = buildLeaderboard({
    apps: [X],
    byHash: byHashX,
    votes: [],
    attests: [
      { dappId: '0xhashx', user: '0xA', timestamp: '500' },
      { dappId: '0xhashx', user: '0xA', timestamp: '2000' },
    ],
    boosts: [],
    since: 1000,
    usedBy: new Map([['0xa', new Set(['x'])]]),
  })
  check('out-of-period attestation not counted', rv.entries[0].attestations, 1)
  check('out-of-period attestation not verified', rv.entries[0].verifiedAttestations, 1)
  check('score = 1 verified * 2', rv.entries[0].score, 2)

  // One attestation (weight 2) must outrank one vote (weight 1), whatever the input order.
  for (const order of ['attest-first', 'vote-first'] as const) {
    const attests = [{ dappId: '0xhashx', user: '0xP', timestamp: '5' }]
    const votes = [{ dappId: '0xhashx', voter: '0xQ', timestamp: '5' }]
    const rc = buildLeaderboard({
      apps: [X], byHash: byHashX,
      votes: order === 'vote-first' ? votes : votes,
      attests,
      boosts: [],
      since: 0,
      usedBy: new Map(),
    })
    check(`attestation outranks vote (${order})`, rc.topContributors.map(p => p.address), ['0xP', '0xQ'])
  }
  // Same check with the vote person created first via a second app order.
  const rc2 = buildLeaderboard({
    apps: [X], byHash: byHashX,
    votes: [{ dappId: '0xhashx', voter: '0xQ', timestamp: '5' }],
    attests: [{ dappId: '0xhashx', user: '0xP', timestamp: '5' }],
    boosts: [], since: 0, usedBy: new Map(),
  })
  check('Q (vote) is registered before P (attestation) yet ranks below', rc2.topContributors[0].address, '0xP')

  // A vote row with no voter still counts for the app but creates no contributor.
  const rn = buildLeaderboard({
    apps: [X], byHash: byHashX,
    votes: [{ dappId: '0xhashx', timestamp: '5' }],
    attests: [], boosts: [], since: 0, usedBy: new Map(),
  })
  check('row without voter counts for the app', rn.entries[0].votes, 1)
  check('row without voter creates no contributor', rn.topContributors, [])
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`)
console.log(`Result: ${pass}/${total} passed`)
if (pass < total) {
  console.error(`${total - pass} test(s) FAILED`)
  process.exit(1)
}
