/**
 * Tests for src/lib/catalog.ts
 * Run with: node --experimental-strip-types --no-warnings src/lib/catalog.test.ts
 */
import assert from 'node:assert/strict'
import { parseCatalog, toTokenRows, toNftRows } from './catalog.ts'

// ─── helpers ──────────────────────────────────────────────────────────────────

const ADDR = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
const ADDR2 = '0x1111111111111111111111111111111111111111'

function minimal(overrides: Record<string, unknown> = {}): unknown {
  return {
    network: 'mainnet',
    generatedAt: '2026-10-13T00:00:00.000Z',
    coverage: 'full',
    tokens: [],
    nfts: [],
    ...overrides,
  }
}

function minToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { address: ADDR, name: 'Test', symbol: 'TST', decimals: 6, totalSupply: '1000000', ...overrides }
}

function minNft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { address: ADDR, name: 'MyNFT', symbol: 'NFT', kind: 'ERC-721', ...overrides }
}

// ─── parseCatalog: structural rejections ─────────────────────────────────────

{
  // null input
  assert.equal(parseCatalog(null), null, 'null -> null')
  // string input
  assert.equal(parseCatalog('{"network":"mainnet"}'), null, 'string -> null')
  // missing tokens array
  assert.equal(parseCatalog(minimal({ tokens: 'bad' })), null, 'tokens not array -> null')
  // missing nfts array
  assert.equal(parseCatalog(minimal({ nfts: 'bad' })), null, 'nfts not array -> null')
  // missing network
  assert.equal(parseCatalog(minimal({ network: undefined })), null, 'missing network -> null')
  // missing generatedAt
  assert.equal(parseCatalog(minimal({ generatedAt: undefined })), null, 'missing generatedAt -> null')
  console.log('PASS structural rejections')
}

// ─── parseCatalog: empty lists ────────────────────────────────────────────────

{
  const cat = parseCatalog(minimal())
  assert.ok(cat !== null, 'empty lists -> valid catalog')
  assert.deepEqual(cat.tokens, [])
  assert.deepEqual(cat.nfts, [])
  assert.equal(cat.network, 'mainnet')
  assert.equal(cat.coverage, 'full')
  console.log('PASS empty lists')
}

// ─── parseCatalog: invalid address dropped ────────────────────────────────────

{
  const badToken = minToken({ address: '0xshort' })
  const badNft   = minNft({ address: 'notanaddress' })
  const cat = parseCatalog(minimal({ tokens: [badToken], nfts: [badNft] }))
  assert.ok(cat !== null)
  assert.equal(cat.tokens.length, 0, 'bad token address dropped')
  assert.equal(cat.nfts.length, 0, 'bad nft address dropped')
  console.log('PASS invalid address dropped')
}

// ─── parseCatalog: decimals boundaries ───────────────────────────────────────

{
  // decimals 0 — valid
  const d0 = parseCatalog(minimal({ tokens: [minToken({ decimals: 0 })] }))
  assert.equal(d0!.tokens.length, 1, 'decimals=0 accepted')

  // decimals 36 — valid
  const d36 = parseCatalog(minimal({ tokens: [minToken({ decimals: 36 })] }))
  assert.equal(d36!.tokens.length, 1, 'decimals=36 accepted')

  // decimals 37 — dropped
  const d37 = parseCatalog(minimal({ tokens: [minToken({ decimals: 37 })] }))
  assert.equal(d37!.tokens.length, 0, 'decimals=37 dropped')

  // decimals -1 — dropped
  const dn1 = parseCatalog(minimal({ tokens: [minToken({ decimals: -1 })] }))
  assert.equal(dn1!.tokens.length, 0, 'decimals=-1 dropped')

  // non-integer decimals — dropped
  const df = parseCatalog(minimal({ tokens: [minToken({ decimals: 1.5 })] }))
  assert.equal(df!.tokens.length, 0, 'decimals=1.5 dropped')

  console.log('PASS decimals boundaries')
}

// ─── parseCatalog: totalSupply sanitisation ───────────────────────────────────

{
  // '0' — valid, kept as '0'
  const z = parseCatalog(minimal({ tokens: [minToken({ totalSupply: '0' })] }))
  assert.equal(z!.tokens[0].totalSupply, '0', 'totalSupply=0 kept')

  // very large digit string — valid
  const big = '9'.repeat(78)
  const b = parseCatalog(minimal({ tokens: [minToken({ totalSupply: big })] }))
  assert.equal(b!.tokens[0].totalSupply, big, 'large totalSupply kept')

  // contains non-digits — sanitized to null
  const bad = parseCatalog(minimal({ tokens: [minToken({ totalSupply: '123abc' })] }))
  assert.equal(bad!.tokens[0].totalSupply, null, 'totalSupply with letters -> null')

  // null — kept as null
  const n = parseCatalog(minimal({ tokens: [minToken({ totalSupply: null })] }))
  assert.equal(n!.tokens[0].totalSupply, null, 'totalSupply=null kept')

  console.log('PASS totalSupply sanitisation')
}

// ─── parseCatalog: null name/symbol ──────────────────────────────────────────

{
  const cat = parseCatalog(minimal({ tokens: [minToken({ name: null, symbol: null })] }))
  assert.ok(cat !== null)
  assert.equal(cat.tokens[0].name, null)
  assert.equal(cat.tokens[0].symbol, null)
  console.log('PASS null name/symbol kept as null')
}

// ─── parseCatalog: good + bad rows mixed ─────────────────────────────────────

{
  const cat = parseCatalog(minimal({
    tokens: [
      minToken({ address: ADDR }),
      minToken({ address: 'bad', decimals: 6 }),   // dropped: bad address
      minToken({ address: ADDR2, decimals: 6 }),   // kept
    ],
    nfts: [
      minNft({ address: ADDR }),
      minNft({ address: ADDR2, kind: 'ERC-1155' }),
      minNft({ address: ADDR, kind: 'ERC-999' }), // dropped: bad kind
    ],
  }))
  assert.ok(cat !== null)
  assert.equal(cat.tokens.length, 2, 'two valid token rows kept')
  assert.equal(cat.nfts.length, 2, 'two valid nft rows kept')
  console.log('PASS mixed good/bad rows')
}

// ─── toTokenRows: supply BigInt safety ────────────────────────────────────────

{
  const bigSupply = '1' + '0'.repeat(24)  // 1e24, decimals=18 -> 1_000_000 tokens
  const cat = parseCatalog(minimal({ tokens: [minToken({ totalSupply: bigSupply, decimals: 18 })] }))
  assert.ok(cat !== null)
  const rows = toTokenRows(cat)
  assert.equal(rows.length, 1)
  // 1e24 / 1e18 = 1_000_000
  assert.equal(rows[0].supply, 1_000_000, 'BigInt supply division correct')
  console.log('PASS toTokenRows BigInt supply')
}

{
  // Very large supply — whole part clamped to MAX_SAFE_INTEGER
  const huge = '9'.repeat(78)
  const cat = parseCatalog(minimal({ tokens: [minToken({ totalSupply: huge, decimals: 0 })] }))
  const rows = toTokenRows(cat!)
  assert.equal(rows[0].supply, Number.MAX_SAFE_INTEGER, 'huge supply clamped to MAX_SAFE_INTEGER')
  console.log('PASS toTokenRows huge supply clamped')
}

{
  // totalSupply='0' -> supply=0
  const cat = parseCatalog(minimal({ tokens: [minToken({ totalSupply: '0', decimals: 6 })] }))
  const rows = toTokenRows(cat!)
  assert.equal(rows[0].supply, 0, 'supply=0 for totalSupply=0')
  console.log('PASS toTokenRows supply=0')
}

// ─── toTokenRows: holders is 0 on mainnet catalog rows ───────────────────────

{
  // Mainnet catalog does not carry holder counts — toTokenRows sets holders to 0.
  // The Tokens page renders '—' in the Holders column on mainnet regardless of value.
  const cat = parseCatalog(minimal({ tokens: [minToken()] }))
  const rows = toTokenRows(cat!)
  assert.equal(rows[0].holders, 0, 'holders is 0 for mainnet catalog rows')
  console.log('PASS toTokenRows holders=0')
}

// ─── toNftRows ────────────────────────────────────────────────────────────────

{
  const cat = parseCatalog(minimal({ nfts: [minNft(), minNft({ address: ADDR2, kind: 'ERC-1155', name: null })] }))
  const rows = toNftRows(cat!)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].kind, 'ERC-721')
  assert.equal(rows[1].kind, 'ERC-1155')
  assert.equal(rows[1].name, 'Unnamed collection', 'null name -> fallback')
  assert.equal(rows[0].holders, 0, 'holders is 0 for mainnet catalog rows')
  assert.equal(rows[0].items, null)
  assert.equal(rows[0].transfers, null)
  console.log('PASS toNftRows')
}

// ─── groupOf propagation ─────────────────────────────────────────────────────

{
  const cat = parseCatalog(minimal({
    tokens: [
      minToken({ name: 'USD Coin', symbol: 'USDC' }),
      minToken({ address: ADDR2, name: 'USYC Token', symbol: 'USYC' }),
    ],
  }))
  const rows = toTokenRows(cat!)
  assert.equal(rows[0].group, 'Stablecoin')
  assert.equal(rows[1].group, 'RWA')
  console.log('PASS groupOf propagation')
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTANT-KILLING TESTS
// All tests below are added to kill surviving mutants identified in the task.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Mutant :86/:102/:103 — `typeof x.name === 'string' ? x.name : null` ──────
//
// Mutation: === → !==
// With !==: non-string values (number, object, undefined) return themselves,
//           string values return null.
// Correct: only strings pass through; everything else → null.
//
// Tested for BOTH token name/symbol (:86/:87) AND nft name/symbol (:102/:103).

{
  // Token name is a number → must be null
  const cat = parseCatalog(minimal({ tokens: [minToken({ name: 42, symbol: 'OK' })] }))
  assert.ok(cat !== null)
  assert.equal(cat.tokens[0].name, null, 'token name=42 (number) -> null')

  // Token name is an object → must be null
  const cat2 = parseCatalog(minimal({ tokens: [minToken({ name: { x: 1 }, symbol: 'OK' })] }))
  assert.ok(cat2 !== null)
  assert.equal(cat2.tokens[0].name, null, 'token name={} (object) -> null')

  // Token name is undefined → must be null
  const cat3 = parseCatalog(minimal({ tokens: [minToken({ name: undefined, symbol: 'OK' })] }))
  assert.ok(cat3 !== null)
  assert.equal(cat3.tokens[0].name, null, 'token name=undefined -> null')

  // Token name is empty string → must be empty string (valid string)
  const cat4 = parseCatalog(minimal({ tokens: [minToken({ name: '', symbol: 'OK' })] }))
  assert.ok(cat4 !== null)
  assert.equal(cat4.tokens[0].name, '', 'token name="" (empty string) -> ""')

  // Token name is valid string → must be kept
  const cat5 = parseCatalog(minimal({ tokens: [minToken({ name: 'ValidName', symbol: 'OK' })] }))
  assert.ok(cat5 !== null)
  assert.equal(cat5.tokens[0].name, 'ValidName', 'token name="ValidName" -> "ValidName"')

  // Token symbol is a number → must be null
  const cat6 = parseCatalog(minimal({ tokens: [minToken({ name: 'OK', symbol: 99 })] }))
  assert.ok(cat6 !== null)
  assert.equal(cat6.tokens[0].symbol, null, 'token symbol=99 (number) -> null')

  // Token symbol is undefined → must be null
  const cat7 = parseCatalog(minimal({ tokens: [minToken({ name: 'OK', symbol: undefined })] }))
  assert.ok(cat7 !== null)
  assert.equal(cat7.tokens[0].symbol, null, 'token symbol=undefined -> null')

  // NFT name is a number → must be null
  const cat8 = parseCatalog(minimal({ nfts: [minNft({ name: 100 })] }))
  assert.ok(cat8 !== null)
  assert.equal(cat8.nfts[0].name, null, 'nft name=100 (number) -> null')

  // NFT name is an object → must be null
  const cat9 = parseCatalog(minimal({ nfts: [minNft({ name: { foo: 'bar' } })] }))
  assert.ok(cat9 !== null)
  assert.equal(cat9.nfts[0].name, null, 'nft name={} (object) -> null')

  // NFT name is undefined → must be null
  const cat10 = parseCatalog(minimal({ nfts: [minNft({ name: undefined })] }))
  assert.ok(cat10 !== null)
  assert.equal(cat10.nfts[0].name, null, 'nft name=undefined -> null')

  // NFT name is empty string → must be empty string (valid string)
  const cat11 = parseCatalog(minimal({ nfts: [minNft({ name: '' })] }))
  assert.ok(cat11 !== null)
  assert.equal(cat11.nfts[0].name, '', 'nft name="" (empty string) -> ""')

  // NFT name is valid string → must be kept
  const cat12 = parseCatalog(minimal({ nfts: [minNft({ name: 'CoolNFT' })] }))
  assert.ok(cat12 !== null)
  assert.equal(cat12.nfts[0].name, 'CoolNFT', 'nft name="CoolNFT" -> "CoolNFT"')

  // NFT symbol is a number → must be null
  const cat13 = parseCatalog(minimal({ nfts: [minNft({ symbol: 7 })] }))
  assert.ok(cat13 !== null)
  assert.equal(cat13.nfts[0].symbol, null, 'nft symbol=7 (number) -> null')

  console.log('PASS mutant :86/:102/:103 — name/symbol non-string -> null')
}

// ─── Mutant :80/:96 — `typeof item !== 'object' || item === null` ─────────────
//
// Mutation: || → &&
// With &&: condition is true only when item is BOTH non-object AND null
//          (impossible) → guard never fires → null/number/string items are not
//          skipped and cause a runtime error or wrong parse.
// Correct: skip item when it is NOT an object OR when it IS null.

{
  // null item in tokens array — must be skipped (catalog still valid, 0 tokens)
  const cat = parseCatalog(minimal({ tokens: [null] }))
  assert.ok(cat !== null, 'catalog with null token item is valid')
  assert.equal(cat.tokens.length, 0, 'null token item dropped')

  // number item in tokens array — must be skipped
  const cat2 = parseCatalog(minimal({ tokens: [42] }))
  assert.ok(cat2 !== null)
  assert.equal(cat2.tokens.length, 0, 'number token item dropped')

  // string item in tokens array — must be skipped
  const cat3 = parseCatalog(minimal({ tokens: ['foo'] }))
  assert.ok(cat3 !== null)
  assert.equal(cat3.tokens.length, 0, 'string token item dropped')

  // null item in nfts array — must be skipped
  const cat4 = parseCatalog(minimal({ nfts: [null] }))
  assert.ok(cat4 !== null, 'catalog with null nft item is valid')
  assert.equal(cat4.nfts.length, 0, 'null nft item dropped')

  // number item in nfts array — must be skipped
  const cat5 = parseCatalog(minimal({ nfts: [99] }))
  assert.ok(cat5 !== null)
  assert.equal(cat5.nfts.length, 0, 'number nft item dropped')

  // string item in nfts array — must be skipped
  const cat6 = parseCatalog(minimal({ nfts: ['bar'] }))
  assert.ok(cat6 !== null)
  assert.equal(cat6.nfts.length, 0, 'string nft item dropped')

  // mix of null and valid items — null dropped, valid kept
  const cat7 = parseCatalog(minimal({ tokens: [null, minToken({ address: ADDR })] }))
  assert.ok(cat7 !== null)
  assert.equal(cat7.tokens.length, 1, 'null + valid token: only valid kept')

  console.log('PASS mutant :80/:96 — non-object/null items dropped')
}

// ─── Mutant :54 — `v === null || v === undefined` in sanitizeTotalSupply ───────
//
// Mutation: || → &&
// With &&: the condition is only true when v is BOTH null AND undefined
//          (impossible) → null alone and undefined alone are NOT caught and
//          fall through to `typeof v !== 'string'` which still returns null.
//
// Analysis: null → typeof null !== 'string' → null (same result).
//           undefined → typeof undefined !== 'string' → null (same result).
//
// This mutant is EQUIVALENT: both branches produce null for null and undefined.
// Proven: null → `typeof null !== 'string'` is true → return null.
//         undefined → `typeof undefined !== 'string'` is true → return null.
// The early-return guard is redundant; the second check covers both cases.
//
// Tests below confirm the observable outputs are correct.

{
  // totalSupply=null → null (covers original || path AND mutant && path identically)
  const cat = parseCatalog(minimal({ tokens: [minToken({ totalSupply: null })] }))
  assert.ok(cat !== null)
  assert.equal(cat.tokens[0].totalSupply, null, 'totalSupply=null -> null')

  // totalSupply=undefined → null
  const cat2 = parseCatalog(minimal({ tokens: [minToken({ totalSupply: undefined })] }))
  assert.ok(cat2 !== null)
  assert.equal(cat2.tokens[0].totalSupply, null, 'totalSupply=undefined -> null')

  console.log('PASS mutant :54 — null/undefined totalSupply (equivalent mutant, outputs verified)')
}

// ─── Mutant :170 — `!raw || raw === '0'` in supplyFromRaw ─────────────────────
//
// Mutation: || → &&
// Analysis (per-input):
//   raw=null:  `!null=true && null==='0'=false` → false → BigInt(null) throws → catch→0. Same result.
//   raw='':    Sanitization converts '' to null before reaching supplyFromRaw;
//              raw=null handled above.
//   raw='0':   `!'0'=false && ...` → false → BigInt('0')=0n → whole=0n, frac=0n →
//              0 + 0 = 0. Same result.
//
// This mutant is EQUIVALENT: all three inputs produce 0 with or without the mutation.
// Proven by tracing each path through BigInt arithmetic.
//
// Tests below confirm observable outputs are correct for all three inputs.

{
  // raw=null via totalSupply=null → supply=0
  const cat = parseCatalog(minimal({ tokens: [minToken({ totalSupply: null, decimals: 6 })] }))
  const rows = toTokenRows(cat!)
  assert.equal(rows[0].supply, 0, 'totalSupply=null -> supply=0')

  // raw='0' → supply=0
  const cat2 = parseCatalog(minimal({ tokens: [minToken({ totalSupply: '0', decimals: 6 })] }))
  const rows2 = toTokenRows(cat2!)
  assert.equal(rows2[0].supply, 0, 'totalSupply="0" -> supply=0')

  // totalSupply='' → sanitized to null → supply=0
  const cat3 = parseCatalog(minimal({ tokens: [minToken({ totalSupply: '', decimals: 6 })] }))
  assert.ok(cat3 !== null)
  assert.equal(cat3.tokens[0].totalSupply, null, 'totalSupply="" sanitized to null')
  const rows3 = toTokenRows(cat3)
  assert.equal(rows3[0].supply, 0, 'totalSupply="" -> supply=0')

  console.log('PASS mutant :170 — !raw || raw==="0" (equivalent mutant, outputs verified)')
}

// ─── Mutant :177 — `if (whole > MAX) return MAX_SAFE_INTEGER` (> → >=) ────────
//
// Mutation: > → >=
// With >=: when whole === MAX, returns MAX_SAFE_INTEGER (loses fractional part).
// With >:  when whole === MAX, proceeds to Number(whole) + Number(frac)/Number(divisor).
//
// Killed by: a supply where whole === MAX_SAFE_INTEGER AND frac > 0.
//   Supply = MAX_SAFE_INTEGER * 10 + 5, decimals = 1
//   whole = (MAX_SAFE_INTEGER * 10 + 5) / 10 = MAX_SAFE_INTEGER (integer division)
//   frac  = (MAX_SAFE_INTEGER * 10 + 5) % 10 = 5
//   Correct result: MAX_SAFE_INTEGER + 5/10 = 9007199254740991.5
//   Mutant result:  MAX_SAFE_INTEGER exactly (9007199254740991)

{
  // whole === MAX, frac > 0 — result must exceed MAX_SAFE_INTEGER
  const MAX = BigInt(Number.MAX_SAFE_INTEGER)  // 9007199254740991n
  const rawSupply = String(MAX * 10n + 5n)     // "90071992547409915", decimals=1
  const cat = parseCatalog(minimal({ tokens: [minToken({ totalSupply: rawSupply, decimals: 1 })] }))
  assert.ok(cat !== null)
  const rows = toTokenRows(cat)
  // Correct: 9007199254740991 + 0.5 = 9007199254740991.5 (strictly > MAX_SAFE_INTEGER)
  assert.ok(rows[0].supply > Number.MAX_SAFE_INTEGER,
    `whole===MAX with frac>0 must exceed MAX_SAFE_INTEGER; got ${rows[0].supply}`)

  // whole === MAX, frac === 0 — result equals MAX_SAFE_INTEGER exactly (both paths agree)
  const rawExact = String(MAX)  // "9007199254740991", decimals=0
  const cat2 = parseCatalog(minimal({ tokens: [minToken({ totalSupply: rawExact, decimals: 0 })] }))
  assert.ok(cat2 !== null)
  const rows2 = toTokenRows(cat2)
  assert.equal(rows2[0].supply, Number.MAX_SAFE_INTEGER, 'whole===MAX, frac===0 -> MAX_SAFE_INTEGER')

  // whole === MAX + 1 — must clamp to MAX_SAFE_INTEGER
  const rawOver = String(MAX + 1n)  // "9007199254740992", decimals=0
  const cat3 = parseCatalog(minimal({ tokens: [minToken({ totalSupply: rawOver, decimals: 0 })] }))
  assert.ok(cat3 !== null)
  const rows3 = toTokenRows(cat3)
  assert.equal(rows3[0].supply, Number.MAX_SAFE_INTEGER, 'whole===MAX+1 -> clamped to MAX_SAFE_INTEGER')

  console.log('PASS mutant :177 — > vs >= at MAX_SAFE_INTEGER boundary')
}

// ─── Mutant :176 — `BigInt(Number.MAX_SAFE_INTEGER)` constant ─────────────────
//
// Mutation: changes the constant used for comparison.
// Killed by: testing the exact boundary where whole === MAX_SAFE_INTEGER must NOT
// clamp (from the test above, rows2[0].supply === MAX_SAFE_INTEGER), and
// whole === MAX_SAFE_INTEGER + 1 must clamp (rows3[0].supply === MAX_SAFE_INTEGER).
//
// Additionally: if MAX were BigInt(MAX_SAFE_INTEGER - 1), then whole===MAX_SAFE_INTEGER
// would be caught by > (MAX_SAFE_INTEGER > MAX_SAFE_INTEGER-1 = true) and return
// MAX_SAFE_INTEGER directly, losing any fractional part. The test above (rows[0].supply
// > MAX_SAFE_INTEGER) would fail because it would return MAX_SAFE_INTEGER.
//
// If MAX were BigInt(MAX_SAFE_INTEGER + 1), then whole===MAX_SAFE_INTEGER is NOT > MAX+1,
// so whole===MAX with frac>0 would return MAX+0.5 (correct coincidentally for that case),
// but whole===MAX+1 (9007199254740992) would NOT be caught (MAX+1 > MAX+1 = false) and
// would return Number(MAX+1) + frac/divisor — but Number(9007199254740992n) =
// 9007199254740992 which is representable, so it would NOT equal MAX_SAFE_INTEGER.
// The test rows3[0].supply === MAX_SAFE_INTEGER kills this variant.

{
  const MAX = BigInt(Number.MAX_SAFE_INTEGER)

  // whole = MAX_SAFE_INTEGER: correct MAX constant → NOT clamped (> is false for equal)
  const rawExact = String(MAX)
  const cat = parseCatalog(minimal({ tokens: [minToken({ totalSupply: rawExact, decimals: 0 })] }))
  const rows = toTokenRows(cat!)
  assert.equal(rows[0].supply, Number.MAX_SAFE_INTEGER,
    'whole===MAX_SAFE_INTEGER: not clamped, correct value returned')

  // whole = MAX_SAFE_INTEGER + 1: correct MAX constant → clamped
  const rawOver = String(MAX + 1n)
  const cat2 = parseCatalog(minimal({ tokens: [minToken({ totalSupply: rawOver, decimals: 0 })] }))
  const rows2 = toTokenRows(cat2!)
  assert.equal(rows2[0].supply, Number.MAX_SAFE_INTEGER,
    'whole===MAX_SAFE_INTEGER+1: clamped to MAX_SAFE_INTEGER')

  // If MAX were MAX_SAFE_INTEGER - 1, this would clamp MAX_SAFE_INTEGER case too
  // (MAX_SAFE_INTEGER > MAX_SAFE_INTEGER-1 = true → return MAX_SAFE_INTEGER, same value here)
  // But the frac>0 test above catches that variant (it would return MAX without frac).

  console.log('PASS mutant :176 — BigInt(MAX_SAFE_INTEGER) constant boundary')
}

console.log('\nAll catalog tests passed.')

// ─── finalText: Mutation trial table ──────────────────────────────────────────
//
// Each mutant was applied (source line changed), tests re-run, then reverted.
// "broke?" = did at least one test fail with the mutation active?
//
// Line  Mutation                                        broke?  Notes
// ────  ──────────────────────────────────────────────  ──────  ──────────────────────────────────────────
// :86   typeof t.name === → !==                         YES     'token name=42->null' fails (gets 42)
// :87   typeof t.symbol === → !==                       YES     'token symbol=99->null' fails (gets 99)
// :102  typeof n.name === → !==                         YES     'nft name=100->null' fails (gets 100)
// :103  typeof n.symbol === → !==                       YES     'nft symbol=7->null' fails (gets 7)
// :177  whole > MAX → whole >= MAX                      YES     'whole===MAX with frac>0' fails (gets MAX)
// :176  BigInt(MAX_SAFE_INTEGER) → BigInt(MAX-1)        YES     'whole===MAX with frac>0' fails (returns MAX)
// :176  BigInt(MAX_SAFE_INTEGER) → BigInt(MAX+1)        YES     'whole===MAX+1 clamped' fails (not clamped)
// :54   v===null || v===undefined → &&                  NO*     EQUIVALENT — typeof covers both cases
// :80   typeof item!=='object'||item===null → &&        YES     'null token item dropped' fails (throws)
// :96   typeof item!=='object'||item===null → &&        YES     'null nft item dropped' fails (throws)
// :170  !raw || raw==='0' → &&                          NO*     EQUIVALENT — BigInt/catch path returns 0
//
// * Marked EQUIVALENT: the mutant produces identical observable output for all inputs.
//   Equivalence is proven by tracing through the code in the test block comments above.
