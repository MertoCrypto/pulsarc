/**
 * Unit tests for catalogView.ts
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/catalogView.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { visibleNfts, visibleTokens, tokenGroupCounts, topWalletsOf, verifiedTokenSet } from './catalogView.ts'
import { parseCatalog, toTokenRows } from './catalog.ts'
import { appsForNetwork } from '../data/appRegistries.ts'
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
  volume24h: number | null = null,
  marketCap: number | null = null,
  price: number | null = null,
): ArcToken {
  return { address, name, symbol, decimals, holders, supply, group, iconUrl, volume24h, marketCap, price }
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
// visibleTokens — 'featured' sort
// ---------------------------------------------------------------------------

console.log('\n── visibleTokens featured sort ──────────────────────────────')

// Fixtures: one token per group, with varied supply.
const fStable: ArcToken = makeToken('0xF100', 'USDC', 'USDC', 6, 0, 1_000_000, 'Stablecoin', '')
const fRwa: ArcToken = makeToken('0xF200', 'US Yield Coin', 'USYC', 6, 0, 500_000, 'RWA', '')
const fLp: ArcToken = makeToken('0xF300', 'Arc LP', 'ALP', 18, 0, 750_000, 'LP & Vaults', '')
const fOther1: ArcToken = makeToken('0xF401', 'Zappa', 'ZAP', 18, 0, 200_000, 'Other', '')
const fOther2: ArcToken = makeToken('0xF402', 'Apple Inc', 'AAPL', 18, 0, 200_000, 'Other', '')
const featuredAll: ArcToken[] = [fOther1, fOther2, fLp, fRwa, fStable]

// Stablecoin and RWA appear before Other
{
  const result: ArcToken[] = visibleTokens(featuredAll, 'All', 'featured', '')
  const groups: string[] = result.map(t => t.group)
  const firstOtherIdx: number = groups.indexOf('Other')
  const lastNonOtherIdx: number = [...groups].reverse().findIndex(g => g !== 'Other')
  const lastNonOtherIdxFromStart: number = groups.length - 1 - lastNonOtherIdx
  check(
    'featured: all non-Other groups appear before first Other',
    firstOtherIdx > lastNonOtherIdxFromStart || firstOtherIdx === -1,
    true,
  )
}

// Group order: Stablecoin (0) < RWA (1) < LP & Vaults (2) < Other (3)
{
  const result: ArcToken[] = visibleTokens(featuredAll, 'All', 'featured', '')
  check(
    'featured: Stablecoin before RWA',
    result.indexOf(fStable) < result.indexOf(fRwa),
    true,
  )
  check(
    'featured: RWA before LP & Vaults',
    result.indexOf(fRwa) < result.indexOf(fLp),
    true,
  )
  check(
    'featured: LP & Vaults before Other',
    result.indexOf(fLp) < result.indexOf(fOther1),
    true,
  )
}

// Within-group: supply descending
{
  const hi: ArcToken = makeToken('0xG1', 'Alpha', 'A', 18, 0, 900_000, 'Other', '')
  const lo: ArcToken = makeToken('0xG2', 'Beta', 'B', 18, 0, 100_000, 'Other', '')
  const result: ArcToken[] = visibleTokens([lo, hi], 'All', 'featured', '')
  check(
    'featured: within-group supply desc (hi before lo)',
    result,
    [hi, lo],
  )
}

// Equal supply within group: name localeCompare 'en' ascending
{
  // fOther1.name = 'Zappa', fOther2.name = 'Apple Inc' — both supply 200_000
  const result: ArcToken[] = visibleTokens([fOther1, fOther2], 'All', 'featured', '')
  check(
    'featured: equal supply within group — name localeCompare asc',
    result,
    [fOther2, fOther1], // 'Apple Inc' < 'Zappa'
  )
}

// Two Stablecoin tokens: higher supply first
{
  const s1: ArcToken = makeToken('0xS1', 'USDC', 'USDC', 6, 0, 5_000_000, 'Stablecoin', '')
  const s2: ArcToken = makeToken('0xS2', 'EURC', 'EURC', 6, 0, 2_000_000, 'Stablecoin', '')
  const result: ArcToken[] = visibleTokens([s2, s1], 'All', 'featured', '')
  check(
    'featured: Stablecoin higher supply first',
    result,
    [s1, s2],
  )
}

// existing 'supply' sort is unchanged (regression)
check(
  "featured: existing 'supply' sort unchanged",
  visibleTokens(featuredAll, 'All', 'supply', '').map(t => t.supply),
  [...featuredAll].sort((a, b) => b.supply - a.supply).map(t => t.supply),
)

// existing 'name' sort is unchanged (regression)
{
  const sorted: string[] = featuredAll.map(t => t.name).sort((a, b) => a.localeCompare(b))
  check(
    "featured: existing 'name' sort unchanged",
    visibleTokens(featuredAll, 'All', 'name', '').map(t => t.name),
    sorted,
  )
}

// existing 'holders' sort is unchanged (regression)
{
  const withHolders: ArcToken[] = [
    makeToken('0xH1', 'A', 'A', 6, 300, 0, 'Stablecoin', ''),
    makeToken('0xH2', 'B', 'B', 6, 100, 0, 'Other', ''),
    makeToken('0xH3', 'C', 'C', 6, 200, 0, 'RWA', ''),
  ]
  check(
    "featured: existing 'holders' sort unchanged",
    visibleTokens(withHolders, 'All', 'holders', '').map(t => t.holders),
    [300, 200, 100],
  )
}

// ---------------------------------------------------------------------------
// verifiedTokenSet
// ---------------------------------------------------------------------------

console.log('\n── verifiedTokenSet ─────────────────────────────────────────')

{
  // Only token anchors are included; contract anchors are excluded.
  const apps = [
    { anchors: [{ address: '0xABC', kind: 'token' }, { address: '0xDEF', kind: 'contract' }] },
    { anchors: [{ address: '0xGHI', kind: 'token' }] },
  ]
  const result: Set<string> = verifiedTokenSet(apps)
  check('includes token anchors', result.has('0xabc'), true)
  check('excludes contract anchors', result.has('0xdef'), false)
  check('second app token included', result.has('0xghi'), true)
  check('size is 2 (token anchors only)', result.size, 2)
}

{
  // Addresses are lower-cased regardless of input casing.
  const apps = [{ anchors: [{ address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12', kind: 'token' }] }]
  const result: Set<string> = verifiedTokenSet(apps)
  check(
    'address is lower-cased in output',
    result.has('0xabcdef1234567890abcdef1234567890abcdef12'),
    true,
  )
  check(
    'original mixed-case not in set',
    result.has('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'),
    false,
  )
}

{
  // Empty input → empty set.
  const result: Set<string> = verifiedTokenSet([])
  check('empty apps → empty set', result.size, 0)
}

{
  // App with no token anchors → contributes nothing.
  const apps = [{ anchors: [{ address: '0x999', kind: 'contract' }] }]
  const result: Set<string> = verifiedTokenSet(apps)
  check('no token anchors → empty set', result.size, 0)
}

// ---------------------------------------------------------------------------
// visibleTokens — verified param in 'featured' sort
// ---------------------------------------------------------------------------

console.log('\n── visibleTokens featured — verified param ──────────────────')

{
  // A verified 'Other' token should sort before an unverified 'Other' token.
  const vOther: ArcToken = makeToken('0xV01', 'Verified Wrap', 'VW', 18, 0, 100_000, 'Other', '')
  const uOther: ArcToken = makeToken('0xU01', 'Unverified Meme', 'UMEME', 18, 0, 200_000, 'Other', '')
  const vset: Set<string> = new Set(['0xv01']) // lower-cased
  const result: ArcToken[] = visibleTokens([uOther, vOther], 'All', 'featured', '', vset)
  check(
    'featured: verified Other token before unverified Other token',
    result.indexOf(vOther) < result.indexOf(uOther),
    true,
  )
}

{
  // Verified 'Other' still comes after unverified 'Stablecoin'? No —
  // verified bit is the primary key, so a verified Other beats an unverified Stablecoin.
  const vOther: ArcToken = makeToken('0xV02', 'Verified Other', 'VO', 18, 0, 1_000, 'Other', '')
  const uStable: ArcToken = makeToken('0xU02', 'Unverified Stablecoin', 'US', 6, 0, 9_000_000, 'Stablecoin', '')
  const vset: Set<string> = new Set(['0xv02'])
  const result: ArcToken[] = visibleTokens([uStable, vOther], 'All', 'featured', '', vset)
  check(
    'featured: verified Other before unverified Stablecoin (verified is primary key)',
    result.indexOf(vOther) < result.indexOf(uStable),
    true,
  )
}

{
  // Within verified tokens, group order is still respected.
  const vStable: ArcToken = makeToken('0xVS1', 'V Stable', 'VS', 6, 0, 500_000, 'Stablecoin', '')
  const vOther2: ArcToken = makeToken('0xVO2', 'V Other', 'VOT', 18, 0, 800_000, 'Other', '')
  const vset: Set<string> = new Set(['0xvs1', '0xvo2'])
  const result: ArcToken[] = visibleTokens([vOther2, vStable], 'All', 'featured', '', vset)
  check(
    'featured: among verified, Stablecoin before Other',
    result.indexOf(vStable) < result.indexOf(vOther2),
    true,
  )
}

{
  // When no verified set is provided (5th param omitted), old featured behaviour is preserved:
  // group order only, no verified-first promotion.
  const otherHigh: ArcToken = makeToken('0xOH', 'Other High', 'OH', 18, 0, 999_999, 'Other', '')
  const stableHigh: ArcToken = makeToken('0xSH', 'Stable High', 'SH', 6, 0, 1_000_000, 'Stablecoin', '')
  const result: ArcToken[] = visibleTokens([otherHigh, stableHigh], 'All', 'featured', '')
  check(
    'featured: no verified param — Stablecoin still before Other (group order preserved)',
    result.indexOf(stableHigh) < result.indexOf(otherHigh),
    true,
  )
}

{
  // When verified set is empty, all tokens are treated equally on the verified axis —
  // falls back to group order as before.
  const otherToken: ArcToken = makeToken('0xOE', 'Other Empty', 'OE', 18, 0, 999_999, 'Other', '')
  const stableToken: ArcToken = makeToken('0xSE', 'Stable Empty', 'SE', 6, 0, 1_000_000, 'Stablecoin', '')
  const result: ArcToken[] = visibleTokens([otherToken, stableToken], 'All', 'featured', '', new Set<string>())
  check(
    'featured: empty verified set — group order still applies',
    result.indexOf(stableToken) < result.indexOf(otherToken),
    true,
  )
}

// ---------------------------------------------------------------------------
// Real mainnet data: featured sort with real MAINNET_APPS verified set
// ---------------------------------------------------------------------------

console.log('\n── visibleTokens featured — real mainnet data + registry ────')

{
  const __filename: string = fileURLToPath(import.meta.url)
  const __dirname: string = dirname(__filename)
  const fixturePath: string = join(__dirname, 'fixtures', 'catalog', 'mainnet-catalog-2026-10-14.json')
  const raw: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const catalog = parseCatalog(raw)
  assert.ok(catalog !== null, 'fixture parsed successfully')
  const tokenRows: ArcToken[] = toTokenRows(catalog)
  assert.ok(tokenRows.length > 0, 'fixture has token rows')

  // Build verified set from real MAINNET_APPS (chain id 5042).
  const mainnetApps = appsForNetwork(5042)
  const vset: Set<string> = verifiedTokenSet(mainnetApps)

  // Sanity: WETH and cirBTC are in the verified set.
  check(
    'WETH address in verified set',
    vset.has('0x128cc466b61f542da60c70e3aa11c10e19b84edb'),
    true,
  )
  check(
    'cirBTC address in verified set',
    vset.has('0x171a4217b86a807a64eb94757db6849fb4bdbaa0'),
    true,
  )

  const featured: ArcToken[] = visibleTokens(tokenRows, 'All', 'featured', '', vset)

  // Top 5 must include USDC, EURC, USYC, WETH, cirBTC.
  const top5Addresses: string[] = featured.slice(0, 5).map(t => t.address.toLowerCase())
  const USDC_MAINNET = '0x3600000000000000000000000000000000000000'
  const EURC_MAINNET = '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1'
  const USYC_MAINNET = '0x8a5d989bbb96929f689b0200f435f53da42bf490'
  const WETH_MAINNET = '0x128cc466b61f542da60c70e3aa11c10e19b84edb'
  const CIRBTC_MAINNET = '0x171a4217b86a807a64eb94757db6849fb4bdbaa0'

  check('real data: top 5 contains USDC', top5Addresses.includes(USDC_MAINNET), true)
  check('real data: top 5 contains EURC', top5Addresses.includes(EURC_MAINNET), true)
  check('real data: top 5 contains USYC', top5Addresses.includes(USYC_MAINNET), true)
  check('real data: top 5 contains WETH', top5Addresses.includes(WETH_MAINNET), true)
  check('real data: top 5 contains cirBTC', top5Addresses.includes(CIRBTC_MAINNET), true)

  // None of the top 5 should be unverified (i.e., all are in vset).
  const top5AllVerified: boolean = featured.slice(0, 5).every(t => vset.has(t.address.toLowerCase()))
  check('real data: none of top 5 are unverified', top5AllVerified, true)

  // First row must not be Other.
  check(
    'real mainnet data: featured first row is not Other',
    featured[0]?.group !== 'Other',
    true,
  )
  // Last row should be an unverified Other.
  check(
    'real mainnet data: featured last row is Other',
    featured[featured.length - 1]?.group,
    'Other',
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

// ---------------------------------------------------------------------------
// visibleTokens — 'volume' sort
// ---------------------------------------------------------------------------

console.log('\n── visibleTokens volume sort ─────────────────────────────────')

{
  // verified-first: verified token with no volume sorts before unverified with volume
  const vHigh: ArcToken = makeToken('0xVH', 'V High', 'VH', 6, 100, 0, 'Other', '', null, null)
  const uHigh: ArcToken = makeToken('0xUH', 'U High', 'UH', 6, 50,  0, 'Other', '', 9999, null)
  const vset = new Set(['0xvh'])
  const result = visibleTokens([uHigh, vHigh], 'All', 'volume', '', vset)
  check('volume: verified first even with no volume', result.indexOf(vHigh) < result.indexOf(uHigh), true)
}

{
  // non-null volume desc, null-volume last (zero treated as null)
  const tVol1000: ArcToken = makeToken('0xV1', 'One',  'ONE',  6, 10, 0, 'Other', '', 1000, null)
  const tVol500:  ArcToken = makeToken('0xV2', 'Two',  'TWO',  6, 10, 0, 'Other', '', 500,  null)
  const tVolZero: ArcToken = makeToken('0xV3', 'Zer',  'ZER',  6, 10, 0, 'Other', '', 0,    null)
  const tVolNull: ArcToken = makeToken('0xV4', 'Nul',  'NUL',  6, 10, 0, 'Other', '', null, null)
  const result = visibleTokens([tVolNull, tVolZero, tVol500, tVol1000], 'All', 'volume', '')
  // 1000 and 500 sort first (desc by volume); 0 and null are both "no activity"
  // — tie-break by name asc since holders(10) and marketCap(null) are equal.
  // 'Nul' < 'Zer' so tVolNull sorts before tVolZero.
  check('volume: 1000 and 500 sort first; zero and null tie-break by name', result.map(t => t.address), ['0xV1', '0xV2', '0xV4', '0xV3'])
}

{
  // null and zero are both treated as "no volume" — tie-break by holders desc
  const zeroVol: ArcToken = makeToken('0xZ1', 'Zero', 'ZR', 6, 200, 0, 'Other', '', 0,    null)
  const nullVol: ArcToken = makeToken('0xZ2', 'Null', 'NL', 6, 100, 0, 'Other', '', null, null)
  const result = visibleTokens([nullVol, zeroVol], 'All', 'volume', '')
  // both "no volume" — tie-break by holders: zeroVol(200) before nullVol(100)
  check('volume: zero and null both count as no-volume, tie-break by holders', result.indexOf(zeroVol) < result.indexOf(nullVol), true)
}

{
  // equal volume → tie-break by holders desc
  const tH500: ArcToken = makeToken('0xH1', 'Alpha', 'A', 6, 500, 0, 'Other', '', 1000, null)
  const tH200: ArcToken = makeToken('0xH2', 'Beta',  'B', 6, 200, 0, 'Other', '', 1000, null)
  const result = visibleTokens([tH200, tH500], 'All', 'volume', '')
  check('volume: equal volume → holders desc', result.indexOf(tH500) < result.indexOf(tH200), true)
}

{
  // equal volume and holders → tie-break by marketCap desc
  const tMcHigh: ArcToken = makeToken('0xMC1', 'Alpha', 'A', 6, 100, 0, 'Other', '', 1000, 5_000_000)
  const tMcNull: ArcToken = makeToken('0xMC2', 'Beta',  'B', 6, 100, 0, 'Other', '', 1000, null)
  const result = visibleTokens([tMcNull, tMcHigh], 'All', 'volume', '')
  check('volume: equal vol+holders → marketCap desc (null last)', result.indexOf(tMcHigh) < result.indexOf(tMcNull), true)
}

{
  // equal vol/holders/marketCap → name asc
  const tNB: ArcToken = makeToken('0xN2', 'Beta', 'B', 6, 100, 0, 'Other', '', 1000, 1_000_000)
  const tNA: ArcToken = makeToken('0xN1', 'Alpha','A', 6, 100, 0, 'Other', '', 1000, 1_000_000)
  const result = visibleTokens([tNB, tNA], 'All', 'volume', '')
  check('volume: equal all → name asc', result.map(t => t.name), ['Alpha', 'Beta'])
}

{
  // input not mutated
  const tkA: ArcToken = makeToken('0xMUT1', 'A', 'A', 6, 100, 0, 'Other', '', 500,  null)
  const tkB: ArcToken = makeToken('0xMUT2', 'B', 'B', 6, 200, 0, 'Other', '', 1000, null)
  const original = [tkA, tkB]
  const before = original.map(t => t.address)
  visibleTokens(original, 'All', 'volume', '')
  check('volume sort: input not mutated', original.map(t => t.address), before)
}

{
  // full ordering: verified-first → volume desc → holders desc → marketCap desc → name asc
  const vTop: ArcToken   = makeToken('0xFO1', 'Alpha', 'A', 6, 50, 0, 'Other', '', 5000, 100_000)
  const uV2k: ArcToken   = makeToken('0xFO2', 'Beta',  'B', 6, 10, 0, 'Other', '', 2000, null)
  const uV1k: ArcToken   = makeToken('0xFO3', 'Gamma', 'G', 6, 10, 0, 'Other', '', 1000, null)
  const uV1kHigh: ArcToken = makeToken('0xFO4', 'Delta','D', 6, 99, 0, 'Other', '', 1000, null)
  const uVNone: ArcToken = makeToken('0xFO5', 'Zulu',  'Z', 6, 1,  0, 'Other', '', null, null)
  const vset = new Set(['0xfo1'])
  const result = visibleTokens([uVNone, uV1k, uV2k, vTop, uV1kHigh], 'All', 'volume', '', vset)
  // expected: vTop (verified), uV2k, uV1kHigh (1000 but 99 holders), uV1k (1000, 10 holders), uVNone (null)
  check('volume: full sort order addresses', result.map(t => t.address), ['0xFO1', '0xFO2', '0xFO4', '0xFO3', '0xFO5'])
}

// ---------------------------------------------------------------------------
// cmpNullableDesc via marketCap sort
// ---------------------------------------------------------------------------
console.log('\n── visibleTokens marketCap sort ──────────────────────────────')

{
  const tMc1: ArcToken = makeToken('0xMCA', 'A', 'A', 6, 10, 0, 'Other', '', null, 1_000_000)
  const tMc2: ArcToken = makeToken('0xMCB', 'B', 'B', 6, 10, 0, 'Other', '', null, null)
  const tMc3: ArcToken = makeToken('0xMCC', 'C', 'C', 6, 10, 0, 'Other', '', null, 500_000)
  const result = visibleTokens([tMc2, tMc3, tMc1], 'All', 'marketCap', '')
  check('marketCap sort: desc with null last', result.map(t => t.address), ['0xMCA', '0xMCC', '0xMCB'])
}

{
  // verified first even in marketCap sort
  const vmc: ArcToken  = makeToken('0xVMC', 'A', 'A', 6, 10, 0, 'Other', '', null, null)
  const uvmc: ArcToken = makeToken('0xUMC', 'B', 'B', 6, 10, 0, 'Other', '', null, 9_000_000)
  const vset = new Set(['0xvmc'])
  const result = visibleTokens([uvmc, vmc], 'All', 'marketCap', '', vset)
  check('marketCap sort: verified first regardless of value', result.indexOf(vmc) < result.indexOf(uvmc), true)
}

console.log(`\n${'─'.repeat(52)}`)
console.log(`  ${passed} / ${total} tests passed`)
if (passed < total) {
  console.error(`  ${total - passed} test(s) FAILED`)
  process.exit(1)
} else {
  console.log('  All tests passed.')
}
