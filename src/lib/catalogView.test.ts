/**
 * Unit tests for catalogView.ts
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/catalogView.test.ts
 */

import assert from 'node:assert/strict'
import { visibleNfts, visibleTokens, tokenGroupCounts, topWalletsOf } from './catalogView.ts'
import type { NftCollection } from './nfts.ts'
import type { ArcToken } from './tokens.ts'
import type { AppSample, AnchorSample, ActivityEvent } from './appMetrics.ts'

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0
let total = 0

function check<T>(label: string, actual: T, expected: T): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  ✓  ${label}`)
    passed++
  } catch (err) {
    console.error(`  ✗  ${label}`)
    if (err instanceof assert.AssertionError) {
      console.error(`     actual:   ${JSON.stringify(actual)}`)
      console.error(`     expected: ${JSON.stringify(expected)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers — full shapes, no implicit any
// ---------------------------------------------------------------------------

function makeNft(
  address: string,
  name: string,
  symbol: string,
  kind: 'ERC-721' | 'ERC-1155',
  holders: number,
  items: number | null,
  transfers: number | null,
): NftCollection {
  return { address, name, symbol, kind, holders, items, transfers }
}

function makeToken(
  address: string,
  name: string,
  symbol: string,
  decimals: number,
  holders: number,
  supply: number,
  group: 'Stablecoin' | 'RWA' | 'LP & Vaults' | 'Other',
  iconUrl: string,
): ArcToken {
  return { address, name, symbol, decimals, holders, supply, group, iconUrl }
}

function makeEvent(ts: number, wallets: string[], usd: number | null, fee: number | null, hash: string): ActivityEvent {
  return { ts, wallets, usd, fee: fee ?? 0, hash }
}

function makeAnchor(events: ActivityEvent[], hasMore: boolean, balance: number): AnchorSample {
  return {
    anchor: null as unknown as AnchorSample['anchor'],
    events,
    hasMore,
    balance,
  }
}

function makeSample(appId: string, anchors: AnchorSample[], fetchedAt: number): AppSample {
  return { appId, anchors, fetchedAt }
}

// ---------------------------------------------------------------------------
// visibleNfts
// ---------------------------------------------------------------------------

console.log('\n── visibleNfts ──────────────────────────────────────────────')

const nA: NftCollection = makeNft('0xAAA', 'ApeClub', 'APE', 'ERC-721', 100, 50, 200)
const nB: NftCollection = makeNft('0xBBB', 'Boredz', 'BRD', 'ERC-1155', 80, 30, 150)
const nC: NftCollection = makeNft('0xCCC', 'CryptoKitties', 'CK', 'ERC-721', 60, null, null)
const nD: NftCollection = makeNft('0xDDD', 'Doodles', 'DOO', 'ERC-721', 120, 0, 10)
const nftsAll: NftCollection[] = [nA, nB, nC, nD]

// filter 'All' keeps all (sorted by holders desc: nD 120, nA 100, nB 80, nC 60)
check(
  "filter 'All' keeps all, sorted holders desc",
  visibleNfts(nftsAll, 'All', 'holders', ''),
  [nD, nA, nB, nC],
)

// filter 'ERC-721' keeps only that kind (sorted holders desc: nD 120, nA 100, nC 60)
check(
  "filter 'ERC-721' keeps only ERC-721",
  visibleNfts(nftsAll, 'ERC-721', 'holders', ''),
  [nD, nA, nC],
)

// filter 'ERC-1155' keeps only that kind
check(
  "filter 'ERC-1155' keeps only ERC-1155",
  visibleNfts(nftsAll, 'ERC-1155', 'holders', ''),
  [nB],
)

// query matches name case-insensitively
check(
  'query matches name (case-insensitive)',
  visibleNfts(nftsAll, 'All', 'holders', 'ape'),
  [nA],
)

// query matches symbol
check(
  'query matches symbol',
  visibleNfts(nftsAll, 'All', 'holders', 'brd'),
  [nB],
)

// query matches address
check(
  'query matches address',
  visibleNfts(nftsAll, 'All', 'holders', '0xccc'),
  [nC],
)

// query is trimmed — leading/trailing spaces
check(
  'query is trimmed',
  visibleNfts(nftsAll, 'All', 'holders', '  ape  '),
  [nA],
)

// whitespace-only query = no filter
check(
  'whitespace-only query = no filter',
  visibleNfts(nftsAll, 'All', 'holders', '   '),
  [nD, nA, nB, nC],
)

// query + kind filter combine with AND
check(
  'query + kind combine AND (ape + ERC-721)',
  visibleNfts(nftsAll, 'ERC-721', 'holders', 'ape'),
  [nA],
)

// AND combination that produces empty result (ape is ERC-721, not ERC-1155)
check(
  'query + kind AND -> empty when incompatible',
  visibleNfts(nftsAll, 'ERC-1155', 'holders', 'ape'),
  [],
)

// non-matching query -> []
check(
  'non-matching query -> []',
  visibleNfts(nftsAll, 'All', 'holders', 'zzznomatch'),
  [],
)

// sort 'holders' descending
check(
  "sort 'holders' desc",
  visibleNfts(nftsAll, 'All', 'holders', '').map(n => n.holders),
  [120, 100, 80, 60],
)

// sort by 'items': nA=50, nD=0, nB=30, nC=null(-1)
// descending: nA 50, nB 30, nD 0, nC -1
check(
  "sort 'items' desc, null last (treated as -1)",
  visibleNfts(nftsAll, 'All', 'items', ''),
  [nA, nB, nD, nC],
)

// 0 sorts above null: nD(items=0) > nC(items=null)
check(
  'items=0 sorts above items=null',
  visibleNfts([nC, nD], 'All', 'items', ''),
  [nD, nC],
)

// two nulls keep relative order (stable sort — nC before a clone)
const nE: NftCollection = makeNft('0xEEE', 'Evos', 'EVO', 'ERC-721', 10, null, null)
{
  const result: NftCollection[] = visibleNfts([nC, nE], 'All', 'items', '')
  // both items=null => both treated as -1; .sort is stable in V8 so relative order preserved
  check(
    'two null items keep relative (stable) order',
    result,
    [nC, nE],
  )
}

// sort 'transfers': nA=200, nB=150, nD=10, nC=null(-1)
check(
  "sort 'transfers' desc, null last",
  visibleNfts(nftsAll, 'All', 'transfers', ''),
  [nA, nB, nD, nC],
)

// input array not mutated
{
  const original: NftCollection[] = [nA, nB, nC, nD]
  const before: string[] = original.map(n => n.address)
  visibleNfts(original, 'All', 'holders', '')
  const after: string[] = original.map(n => n.address)
  check('input array not mutated', after, before)
}

// empty input -> []
check(
  'empty input -> []',
  visibleNfts([], 'All', 'holders', ''),
  [],
)

// ---------------------------------------------------------------------------
// visibleTokens
// ---------------------------------------------------------------------------

console.log('\n── visibleTokens ────────────────────────────────────────────')

const tA: ArcToken = makeToken('0x100', 'Alpha USDC', 'aUSDC', 6, 500, 1_000_000, 'Stablecoin', '')
const tB: ArcToken = makeToken('0x200', 'beta RWA', 'bRWA', 18, 200, 500_000, 'RWA', '')
const tC: ArcToken = makeToken('0x300', 'Gamma LP', 'gLP', 18, 300, 750_000, 'LP & Vaults', '')
const tD: ArcToken = makeToken('0x400', 'Delta Other', 'dOTH', 8, 100, 250_000, 'Other', '')
const tE: ArcToken = makeToken('0x500', 'Epsilon', 'EPS', 18, 400, 900_000, 'Stablecoin', '')
const tokensAll: ArcToken[] = [tA, tB, tC, tD, tE]

// filter 'All' keeps all
check(
  "filter 'All' keeps all (holders desc: tA500,tE400,tC300,tB200,tD100)",
  visibleTokens(tokensAll, 'All', 'holders', ''),
  [tA, tE, tC, tB, tD],
)

// filter by group 'Stablecoin'
check(
  "filter 'Stablecoin'",
  visibleTokens(tokensAll, 'Stablecoin', 'holders', ''),
  [tA, tE],
)

// filter 'RWA'
check(
  "filter 'RWA'",
  visibleTokens(tokensAll, 'RWA', 'holders', ''),
  [tB],
)

// filter 'LP & Vaults'
check(
  "filter 'LP & Vaults'",
  visibleTokens(tokensAll, 'LP & Vaults', 'holders', ''),
  [tC],
)

// filter 'Other'
check(
  "filter 'Other'",
  visibleTokens(tokensAll, 'Other', 'holders', ''),
  [tD],
)

// query matches name (case-insensitive)
check(
  'query matches name case-insensitively',
  visibleTokens(tokensAll, 'All', 'holders', 'alpha'),
  [tA],
)

// query matches symbol
check(
  'query matches symbol',
  visibleTokens(tokensAll, 'All', 'holders', 'eps'),
  [tE],
)

// query matches address
check(
  'query matches address',
  visibleTokens(tokensAll, 'All', 'holders', '0x300'),
  [tC],
)

// query trimmed
check(
  'query trimmed',
  visibleTokens(tokensAll, 'All', 'holders', '  alpha  '),
  [tA],
)

// whitespace-only query = no filter
check(
  'whitespace-only query = no filter',
  visibleTokens(tokensAll, 'All', 'holders', '   '),
  [tA, tE, tC, tB, tD],
)

// query + group AND
check(
  'query + group AND (alpha + Stablecoin)',
  visibleTokens(tokensAll, 'Stablecoin', 'holders', 'alpha'),
  [tA],
)

// AND combo that results in empty
check(
  'query + group AND -> empty when incompatible',
  visibleTokens(tokensAll, 'RWA', 'holders', 'alpha'),
  [],
)

// non-matching query -> []
check(
  'non-matching query -> []',
  visibleTokens(tokensAll, 'All', 'holders', 'zzznomatch'),
  [],
)

// sort 'holders' desc
check(
  "sort 'holders' desc",
  visibleTokens(tokensAll, 'All', 'holders', '').map(t => t.holders),
  [500, 400, 300, 200, 100],
)

// sort 'supply' desc: tA=1e6, tE=9e5, tC=750k, tB=500k, tD=250k
check(
  "sort 'supply' desc",
  visibleTokens(tokensAll, 'All', 'supply', ''),
  [tA, tE, tC, tB, tD],
)

// sort 'name' ascending via localeCompare
// Names: 'Alpha USDC', 'beta RWA', 'Delta Other', 'Epsilon', 'Gamma LP'
// localeCompare is locale-sensitive; in the default C locale JS sorts uppercase before lower,
// but in most Node locales the order is: Alpha, beta, Delta, Epsilon, Gamma
// Verify with the actual JS comparison the module uses:
{
  const names: string[] = ['Alpha USDC', 'beta RWA', 'Gamma LP', 'Delta Other', 'Epsilon']
  const sorted: string[] = [...names].sort((a, b) => a.localeCompare(b))
  const result: ArcToken[] = visibleTokens(tokensAll, 'All', 'name', '')
  check(
    "sort 'name' asc via localeCompare",
    result.map(t => t.name),
    sorted,
  )
}

// ties keep input order (two tokens with equal holders)
{
  const tT1: ArcToken = makeToken('0xT1', 'ZZA', 'ZA', 6, 50, 100, 'Other', '')
  const tT2: ArcToken = makeToken('0xT2', 'ZZB', 'ZB', 6, 50, 100, 'Other', '')
  const result: ArcToken[] = visibleTokens([tT1, tT2], 'All', 'holders', '')
  check(
    'ties in holders keep input order',
    result,
    [tT1, tT2],
  )
}

// input array not mutated
{
  const original: ArcToken[] = [tA, tB, tC, tD, tE]
  const before: string[] = original.map(t => t.address)
  visibleTokens(original, 'All', 'holders', '')
  const after: string[] = original.map(t => t.address)
  check('input array not mutated', after, before)
}

// empty input -> []
check(
  'empty input -> []',
  visibleTokens([], 'All', 'holders', ''),
  [],
)

// ---------------------------------------------------------------------------
// tokenGroupCounts
// ---------------------------------------------------------------------------

console.log('\n── tokenGroupCounts ─────────────────────────────────────────')

// counts per group + All = total
check(
  'counts per group and All=total',
  tokenGroupCounts(tokensAll),
  { All: 5, Stablecoin: 2, RWA: 1, 'LP & Vaults': 1, Other: 1 },
)

// empty input
check(
  'empty input -> {All:0}',
  tokenGroupCounts([]),
  { All: 0 },
)

// groups absent from input do not appear as keys
{
  const onlyStable: ArcToken[] = [tA, tE]
  const counts: Record<string, number> = tokenGroupCounts(onlyStable)
  check(
    'absent groups not present as keys',
    Object.keys(counts).sort(),
    ['All', 'Stablecoin'],
  )
  check(
    'absent groups not present: correct counts',
    counts,
    { All: 2, Stablecoin: 2 },
  )
}

// single group
{
  const oneRwa: ArcToken[] = [tB]
  check(
    'single group',
    tokenGroupCounts(oneRwa),
    { All: 1, RWA: 1 },
  )
}

// ---------------------------------------------------------------------------
// topWalletsOf
// ---------------------------------------------------------------------------

console.log('\n── topWalletsOf ─────────────────────────────────────────────')

// null sample -> []
check('null -> []', topWalletsOf(null), [])

// undefined sample -> []
check('undefined -> []', topWalletsOf(undefined), [])

// empty events -> []
{
  const s: AppSample = makeSample('app1', [makeAnchor([], false, 0)], 0)
  check('empty events -> []', topWalletsOf(s), [])
}

// counts events per wallet across all anchors
{
  const e1: ActivityEvent = makeEvent(1, ['0xW1', '0xW2'], 10, null, 'h1')
  const e2: ActivityEvent = makeEvent(2, ['0xW1'], 20, null, 'h2')
  const e3: ActivityEvent = makeEvent(3, ['0xW2', '0xW3'], 5, null, 'h3')
  const anchor1: AnchorSample = makeAnchor([e1, e2], false, 0)
  const anchor2: AnchorSample = makeAnchor([e3], false, 0)
  const s: AppSample = makeSample('app1', [anchor1, anchor2], 0)
  const result: [string, { n: number; usd: number }][] = topWalletsOf(s)
  // 0xW1: n=2 (e1+e2), usd=30; 0xW2: n=2 (e1+e3), usd=15; 0xW3: n=1 (e3), usd=5
  // sorted by n desc; ties keep first-seen order -> W1 before W2
  check(
    'counts across anchors, sorted by n desc',
    result,
    [
      ['0xW1', { n: 2, usd: 30 }],
      ['0xW2', { n: 2, usd: 15 }],
      ['0xW3', { n: 1, usd: 5 }],
    ],
  )
}

// usd sums with null treated as 0
{
  const e1: ActivityEvent = makeEvent(1, ['0xW1'], null, null, 'h1')
  const e2: ActivityEvent = makeEvent(2, ['0xW1'], 50, null, 'h2')
  const s: AppSample = makeSample('app1', [makeAnchor([e1, e2], false, 0)], 0)
  const result: [string, { n: number; usd: number }][] = topWalletsOf(s)
  check(
    'null usd treated as 0 in sum',
    result,
    [['0xW1', { n: 2, usd: 50 }]],
  )
}

// default limit 15 (give 20 wallets -> 15)
{
  const wallets20: string[] = Array.from({ length: 20 }, (_, i) => `0xW${String(i).padStart(2, '0')}`)
  const events20: ActivityEvent[] = wallets20.map((w, i) => makeEvent(i, [w], 1, null, `h${i}`))
  const s: AppSample = makeSample('app1', [makeAnchor(events20, false, 0)], 0)
  check(
    'default limit=15 with 20 wallets',
    topWalletsOf(s).length,
    15,
  )
}

// custom limit 3
{
  const wallets5: string[] = ['0xA', '0xB', '0xC', '0xD', '0xE']
  const events5: ActivityEvent[] = wallets5.map((w, i) => makeEvent(i, [w], 1, null, `h${i}`))
  const s: AppSample = makeSample('app1', [makeAnchor(events5, false, 0)], 0)
  check(
    'custom limit=3',
    topWalletsOf(s, 3).length,
    3,
  )
}

// ties keep first-seen order
{
  const e1: ActivityEvent = makeEvent(1, ['0xAlpha'], 10, null, 'h1')
  const e2: ActivityEvent = makeEvent(2, ['0xBeta'], 10, null, 'h2')
  const s: AppSample = makeSample('app1', [makeAnchor([e1, e2], false, 0)], 0)
  const result: [string, { n: number; usd: number }][] = topWalletsOf(s)
  // both n=1, first-seen = 0xAlpha
  check(
    'ties keep first-seen order',
    result.map(r => r[0]),
    ['0xAlpha', '0xBeta'],
  )
}

// a wallet listed twice in one event's wallets counts twice (current behaviour)
{
  const e1: ActivityEvent = makeEvent(1, ['0xDouble', '0xDouble', '0xOnce'], 10, null, 'h1')
  const s: AppSample = makeSample('app1', [makeAnchor([e1], false, 0)], 0)
  const result: [string, { n: number; usd: number }][] = topWalletsOf(s)
  // 0xDouble n=2, usd=20; 0xOnce n=1, usd=10
  check(
    'wallet listed twice in one event counts twice',
    result,
    [
      ['0xDouble', { n: 2, usd: 20 }],
      ['0xOnce', { n: 1, usd: 10 }],
    ],
  )
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Each searchable field on its own, and an upper-case query (added after mutation checks)
// ---------------------------------------------------------------------------
console.log('\n--- search fields one at a time ---')
{
  const nfts = [
    makeNft('0xaaa1', 'Zebra Club', 'ZZ', 'ERC-721', 3, 1, 1),
    makeNft('0xbbb2', 'Other', 'MONKEY', 'ERC-721', 2, 1, 1),
    makeNft('0xccc3', 'Third', 'TT', 'ERC-1155', 1, 1, 1),
  ]
  check('nft: matches by name only', visibleNfts(nfts, 'All', 'holders', 'zebra').map(c => c.address), ['0xaaa1'])
  check('nft: matches by symbol only', visibleNfts(nfts, 'All', 'holders', 'monkey').map(c => c.address), ['0xbbb2'])
  check('nft: matches by address only', visibleNfts(nfts, 'All', 'holders', '0xccc3').map(c => c.address), ['0xccc3'])
  check('nft: upper-case query matches lower-cased fields', visibleNfts(nfts, 'All', 'holders', 'ZEBRA').map(c => c.address), ['0xaaa1'])
  check('nft: mixed-case address query', visibleNfts(nfts, 'All', 'holders', '0XCCC3').map(c => c.address), ['0xccc3'])

  const toks = [
    makeToken('0xt1', 'Zebra Dollar', 'ZD', 6, 3, 1, 'Stablecoin', ''),
    makeToken('0xt2', 'Other', 'MONKEY', 6, 2, 1, 'Other', ''),
    makeToken('0xt3', 'Third', 'TT', 6, 1, 1, 'Other', ''),
  ]
  check('token: matches by name only', visibleTokens(toks, 'All', 'holders', 'zebra').map(t => t.address), ['0xt1'])
  check('token: matches by symbol only', visibleTokens(toks, 'All', 'holders', 'monkey').map(t => t.address), ['0xt2'])
  check('token: matches by address only', visibleTokens(toks, 'All', 'holders', '0xt3').map(t => t.address), ['0xt3'])
  check('token: upper-case query', visibleTokens(toks, 'All', 'holders', 'MONKEY').map(t => t.address), ['0xt2'])
}

console.log(`\n${'─'.repeat(52)}`)
console.log(`  ${passed} / ${total} tests passed`)
if (passed < total) {
  console.error(`  ${total - passed} test(s) FAILED`)
  process.exit(1)
} else {
  console.log('  All tests passed.')
}
