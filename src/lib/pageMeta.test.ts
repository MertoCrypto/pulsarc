/**
 * pageMeta.test.ts
 * Run with: node --experimental-strip-types src/lib/pageMeta.test.ts
 */
import assert from 'node:assert/strict'
import { metaFor, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from './pageMeta.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORBIDDEN_WORDS = ['score', 'level', 'airdrop', 'eligible', 'tvl', 'circle']

function assertNoForbiddenWords(text: string, label: string) {
  const lower = text.toLowerCase()
  for (const word of FORBIDDEN_WORDS) {
    assert.ok(
      !lower.includes(word),
      `"${label}" contains forbidden word "${word}": ${text}`,
    )
  }
}

function assertValidMeta(pathname: string) {
  const meta = metaFor(pathname)
  assert.ok(meta.title.length > 0, `title is empty for "${pathname}"`)
  assert.ok(meta.description.length > 0, `description is empty for "${pathname}"`)
  assert.ok(
    meta.description.length <= 160,
    `description exceeds 160 chars for "${pathname}" (${meta.description.length})`,
  )
  assertNoForbiddenWords(meta.title, `title[${pathname}]`)
  assertNoForbiddenWords(meta.description, `description[${pathname}]`)
}

// ---------------------------------------------------------------------------
// 1. Home page returns verbatim defaults
// ---------------------------------------------------------------------------

{
  const meta = metaFor('/')
  assert.strictEqual(meta.title, DEFAULT_TITLE, 'home title must equal DEFAULT_TITLE')
  assert.strictEqual(meta.description, DEFAULT_DESCRIPTION, 'home description must equal DEFAULT_DESCRIPTION')
  console.log('PASS  home page returns verbatim defaults')
}

// ---------------------------------------------------------------------------
// 2. Every listed exact path returns title ending in "· Pulsarc"
//    (except "/" which returns the full default title)
// ---------------------------------------------------------------------------

const EXACT_PATHS = [
  '/network', '/tokens', '/wallets', '/deploy', '/compare',
  '/trends', '/nfts', '/agents', '/leaderboard', '/method',
  '/brand', '/digest', '/status', '/discover', '/check',
  '/data', '/answers',
]

for (const path of EXACT_PATHS) {
  const { title } = metaFor(path)
  assert.ok(
    title.endsWith('· Pulsarc'),
    `title for "${path}" must end with "· Pulsarc", got: "${title}"`,
  )
  console.log(`PASS  ${path} → title ends with "· Pulsarc"`)
}

// ---------------------------------------------------------------------------
// 3. Hand-written expected values for at least 5 paths
// ---------------------------------------------------------------------------

{
  const m = metaFor('/network')
  assert.strictEqual(m.title, 'Network · Pulsarc')
  assert.strictEqual(
    m.description,
    'Arc Network fees in dollars, block times and payment memos, read straight from the chain.',
  )
  console.log('PASS  /network — hand-written values match')
}

{
  const m = metaFor('/tokens')
  assert.strictEqual(m.title, 'Tokens · Pulsarc')
  assert.strictEqual(
    m.description,
    'The 200 most-held ERC-20 tokens on Arc, from ArcScan. A price is shown only when the explorer has one.',
  )
  console.log('PASS  /tokens — hand-written values match')
}

{
  const m = metaFor('/method')
  assert.strictEqual(m.title, 'Method · Pulsarc')
  assert.strictEqual(
    m.description,
    'Where every Pulsarc figure comes from, what is estimated, and how it is built, so you can check it.',
  )
  console.log('PASS  /method — hand-written values match')
}

{
  const m = metaFor('/answers')
  assert.strictEqual(m.title, 'Answers · Pulsarc')
  assert.strictEqual(
    m.description,
    'Short, sourced answers about Arc, each read live from Pulsarc\'s indexer data with its method.',
  )
  console.log('PASS  /answers — hand-written values match')
}

{
  const m = metaFor('/leaderboard')
  assert.strictEqual(m.title, 'Leaderboard · Pulsarc')
  assert.strictEqual(
    m.description,
    'Community votes, I-used-this attestations and USDC boosts recorded by Pulsarc contracts on Arc.',
  )
  console.log('PASS  /leaderboard — hand-written values match')
}

// ---------------------------------------------------------------------------
// 4. Prefix paths
// ---------------------------------------------------------------------------

{
  const m = metaFor('/dapp/uniswap')
  assert.strictEqual(m.title, 'App · Pulsarc')
  assert.ok(m.description.length > 0)
  console.log('PASS  /dapp/uniswap uses dapp prefix rule')
}

{
  const m = metaFor('/wallet/0xabc123')
  assert.strictEqual(m.title, 'Wallet · Pulsarc')
  assert.ok(m.description.length > 0)
  console.log('PASS  /wallet/0xabc123 uses wallet prefix rule')
}

{
  const m = metaFor('/answers/what-is-arc')
  assert.strictEqual(m.title, 'Answers · Pulsarc')
  assert.ok(m.description.length > 0)
  console.log('PASS  /answers/what-is-arc uses answers prefix rule')
}

// ---------------------------------------------------------------------------
// 5. Trailing slash normalisation
// ---------------------------------------------------------------------------

{
  const withSlash = metaFor('/network/')
  const withoutSlash = metaFor('/network')
  assert.deepStrictEqual(withSlash, withoutSlash, 'trailing slash must be normalised')
  console.log('PASS  trailing slash normalised (/network/ === /network)')
}

{
  // Root "/" must NOT be stripped
  const root = metaFor('/')
  assert.strictEqual(root.title, DEFAULT_TITLE, '"/" must not be stripped to ""')
  console.log('PASS  "/" is not over-stripped')
}

// ---------------------------------------------------------------------------
// 6. Uppercase normalisation
// ---------------------------------------------------------------------------

{
  const upper = metaFor('/NETWORK')
  const lower = metaFor('/network')
  assert.deepStrictEqual(upper, lower, 'uppercase pathname must be normalised')
  console.log('PASS  uppercase normalised (/NETWORK === /network)')
}

{
  const mixedDapp = metaFor('/Dapp/SomeApp')
  const normalDapp = metaFor('/dapp/someapp')
  assert.deepStrictEqual(mixedDapp, normalDapp, 'mixed-case prefix must be normalised')
  console.log('PASS  mixed-case prefix normalised')
}

// ---------------------------------------------------------------------------
// 7. Unknown paths return defaults
// ---------------------------------------------------------------------------

{
  const m = metaFor('/totally-unknown-page')
  assert.strictEqual(m.title, DEFAULT_TITLE, 'unknown path must return DEFAULT_TITLE')
  assert.strictEqual(m.description, DEFAULT_DESCRIPTION, 'unknown path must return DEFAULT_DESCRIPTION')
  console.log('PASS  unknown path returns defaults')
}

{
  const m = metaFor('/404/not/found')
  assert.strictEqual(m.title, DEFAULT_TITLE)
  assert.strictEqual(m.description, DEFAULT_DESCRIPTION)
  console.log('PASS  deep unknown path returns defaults')
}

// ---------------------------------------------------------------------------
// 8. Every description is <= 160 chars and has no forbidden words
// ---------------------------------------------------------------------------

// "/" is exempt: it returns the verbatim index.html defaults which are read-only
// and contain the word "scored" (a conjugation of "score"). All other paths
// must satisfy the forbidden-word constraint.
const ALL_PATHS_CHECKED = [
  ...EXACT_PATHS,
  '/dapp/test', '/wallet/0x1', '/answers/foo',
]

for (const path of ALL_PATHS_CHECKED) {
  assertValidMeta(path)
}
console.log('PASS  all non-home descriptions <= 160 chars and no forbidden words')

// ---------------------------------------------------------------------------
// 9. All non-home titles are distinct from each other
// ---------------------------------------------------------------------------

{
  const titles = EXACT_PATHS.map((p) => metaFor(p).title)
  const unique = new Set(titles)
  assert.strictEqual(
    unique.size,
    titles.length,
    `non-home titles must all be distinct; found duplicates: ${JSON.stringify(titles)}`,
  )
  console.log('PASS  all non-home titles are distinct')
}

// ---------------------------------------------------------------------------
// 10. Prefix titles end in "· Pulsarc"
// ---------------------------------------------------------------------------

for (const path of ['/dapp/foo', '/wallet/bar', '/answers/baz']) {
  const { title } = metaFor(path)
  assert.ok(title.endsWith('· Pulsarc'), `prefix title for "${path}" must end with "· Pulsarc"`)
}
console.log('PASS  all prefix-rule titles end with "· Pulsarc"')

// ---------------------------------------------------------------------------

console.log('\nAll tests passed.')
