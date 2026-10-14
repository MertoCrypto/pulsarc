/**
 * Unit tests for src/lib/tokens.ts (groupOf, toArcToken).
 *
 * Run from the repo root:
 *   node --experimental-strip-types --no-warnings src/lib/tokens.test.ts
 *
 * Uses only node:assert — no test framework required.
 * All expected values are derived by hand from the actual regex patterns:
 *
 *   STABLE  = /^(w|a|x)?(usdc|eurc|usdt)(\.a)?$/i
 *   name    = /^(circle )?(usd coin|euro coin)$/i
 *   LP      = /\blp\b|-lp|lp$|vault|gauge|staked|pool/i   (tested on `${name} ${symbol}`)
 *   RWA     = /^usyc$/i                                    (tested on symbol only)
 *
 * Precedence (highest first): RWA → Stablecoin → LP & Vaults → Other
 */

import assert from 'node:assert/strict'
import { groupOf, toArcToken, parseMarketNum, mergeTokenSources } from './tokens.ts'
import type { RawToken, ArcToken } from './tokens.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0
let total  = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  assert.deepEqual(actual, expected, label)
  passed++
}

// ---------------------------------------------------------------------------
// groupOf — RWA
// ---------------------------------------------------------------------------

// /^usyc$/i: exact match only
check('RWA: symbol USYC (upper)',  groupOf('Yield Coin', 'USYC'),  'RWA')
check('RWA: symbol usyc (lower)',  groupOf('Yield Coin', 'usyc'),  'RWA')
check('RWA: symbol Usyc (mixed)',  groupOf('Yield Coin', 'Usyc'),  'RWA')

// Symbol merely contains USYC — ^usyc$ requires full match, so these fall through
// USYC2: not ^usyc$, not STABLE (core must be usdc|eurc|usdt), plain name → Other
check('not-RWA: USYC2 → Other',   groupOf('Some Token', 'USYC2'), 'Other')
// XUSYC: prefix x is allowed in STABLE only for usdc/eurc/usdt, not usyc → Other
check('not-RWA: XUSYC → Other',   groupOf('Some Token', 'XUSYC'), 'Other')

// Precedence: RWA beats LP even when name contains "Vault"
// symbol USYC → RWA first; LP check is never reached
check('RWA beats LP: USYC + Vault name', groupOf('USYC Vault', 'USYC'), 'RWA')

// ---------------------------------------------------------------------------
// groupOf — Stablecoin via STABLE regex on symbol
// ---------------------------------------------------------------------------

// Core matches (no prefix, no suffix)
check('Stablecoin: USDC',  groupOf('USD Coin', 'USDC'),  'Stablecoin')
check('Stablecoin: EURC',  groupOf('Euro Coin', 'EURC'), 'Stablecoin')
check('Stablecoin: USDT',  groupOf('Tether', 'USDT'),    'Stablecoin')
// Case-insensitive core
check('Stablecoin: usdc (lower)', groupOf('USD Coin', 'usdc'), 'Stablecoin')
// Wrapped prefix w
check('Stablecoin: WUSDC', groupOf('Wrapped USDC', 'WUSDC'), 'Stablecoin')
// Aave prefix a
check('Stablecoin: aUSDC', groupOf('Aave USDC', 'aUSDC'),    'Stablecoin')
// xUSDC prefix x
check('Stablecoin: xUSDC', groupOf('Bridged USDC', 'xUSDC'), 'Stablecoin')
// Suffix .a (Bridged/Stargate style)
check('Stablecoin: USDC.a', groupOf('Bridged USDC', 'USDC.a'), 'Stablecoin')

// NOT stablecoins via STABLE — suffix/prefix outside the pattern
// USDC2: after 'usdc' the regex allows only '.a' or end-of-string; '2' fails
check('not-Stablecoin: USDC2',  groupOf('USDC Two',   'USDC2'),  'Other')
// USDCX: 'X' is not a legal suffix
check('not-Stablecoin: USDCX',  groupOf('USDC X',     'USDCX'),  'Other')
// xxUSDC: two-char prefix; pattern allows at most one of w|a|x
check('not-Stablecoin: xxUSDC', groupOf('Double X',   'xxUSDC'), 'Other')
// DAI is not USDC/EURC/USDT and doesn't match the name regex
check('not-Stablecoin: DAI',    groupOf('Dai Stablecoin', 'DAI'), 'Other')

// ---------------------------------------------------------------------------
// groupOf — Stablecoin via name regex (symbol is irrelevant/unrelated)
// ---------------------------------------------------------------------------

// /^(circle )?(usd coin|euro coin)$/i
// "USD Coin" with an unrelated symbol
check('Stablecoin by name: USD Coin / XYZ',        groupOf('USD Coin',        'XYZ'), 'Stablecoin')
check('Stablecoin by name: Euro Coin / ABC',        groupOf('Euro Coin',       'ABC'), 'Stablecoin')
check('Stablecoin by name: Circle USD Coin / XYZ',  groupOf('Circle USD Coin', 'XYZ'), 'Stablecoin')
check('Stablecoin by name: Circle Euro Coin / ABC', groupOf('Circle Euro Coin','ABC'), 'Stablecoin')
// Case-insensitive
check('Stablecoin by name: usd coin (lower)', groupOf('usd coin', 'XYZ'), 'Stablecoin')

// Precedence: Stablecoin beats LP — symbol USDC with a "Vault" name stays Stablecoin
// STABLE matches on symbol before the LP check is reached
check('Stablecoin beats LP: USDC + Vault name', groupOf('USDC Vault', 'USDC'), 'Stablecoin')

// ---------------------------------------------------------------------------
// groupOf — LP & Vaults
// (only reached when neither RWA nor Stablecoin matched)
// Tested on the joined string `${name} ${symbol}`
// ---------------------------------------------------------------------------

// \blp\b — LP as a standalone word (word boundaries on both sides)
check('LP via \\blp\\b: XyloNet USDC-EURC LP / XLP',
  groupOf('XyloNet USDC-EURC LP', 'XLP'), 'LP & Vaults')
check('LP via \\blp\\b: Swaparc LP Token / SLP',
  groupOf('Swaparc LP Token', 'SLP'), 'LP & Vaults')
// "Liquidity Pool Token" → 'pool' keyword
check('LP via pool: Liquidity Pool Token / LPT',
  groupOf('Liquidity Pool Token', 'LPT'), 'LP & Vaults')

// vault keyword
check('LP via vault: XyloNet USDC Vault / XUSV',
  groupOf('XyloNet USDC Vault', 'XUSV'), 'LP & Vaults')

// gauge keyword (Curve-style)
check('LP via gauge: Curve.fi USDCEURC Gauge Deposit / crvUSDCEURC',
  groupOf('Curve.fi USDCEURC Gauge Deposit', 'crvUSDCEURC'), 'LP & Vaults')

// staked keyword
check('LP via staked: Staked ETH / stETH',
  groupOf('Staked ETH', 'stETH'), 'LP & Vaults')

// lp$ — string ends with 'lp' (case-insensitive)
// Symbol 'fooLP': joined = "SomeToken fooLP" — ends with 'LP' → matches lp$
check('LP via lp$: symbol fooLP (ends with LP)',
  groupOf('SomeToken', 'fooLP'), 'LP & Vaults')

// -lp in symbol or name
// Symbol 'TOKEN-LP': joined contains '-lp' → matches -lp alternative
check('LP via -lp: symbol TOKEN-LP',
  groupOf('MyToken', 'TOKEN-LP'), 'LP & Vaults')
// Name contains '-lp'
check('LP via -lp: name contains arc-lp',
  groupOf('Arc-LP Shares', 'ALS'), 'LP & Vaults')

// -----------------------------------------------------------------------
// lp$ edge-cases — word "lp" only inside another word must NOT trigger \blp\b
// but MAY still trigger lp$ if the joined string ends with 'lp'
// -----------------------------------------------------------------------

// "Help Token HELP": 'lp' sits inside 'Help' and 'HELP' with no word boundary on the left.
// \blp\b: in 'Help' — left char 'e' is a word char → no left boundary → no match.
//          in 'HELP' — same: 'E' is a word char → no match.
// -lp: not present.
// lp$: joined = "Help Token HELP" → ends with 'P' → last two chars = 'LP' (case-insensitive) → MATCHES.
// PINNED: 'Help Token' / 'HELP' is classified LP & Vaults because the joined string ends with 'LP'.
check('PINNED – Help Token / HELP: lp$ fires on joined tail → LP & Vaults',
  groupOf('Help Token', 'HELP'), 'LP & Vaults')

// "Alpha ALPHA": A-l-p-h-a: 'lp' at indices 1-2, left='A'(word), right='h'(word) → no boundary.
// joined = "Alpha ALPHA" → ends with 'A' → lp$ does not match.
// -lp: not present. vault/gauge/staked/pool: not present. → Other
check('Alpha / ALPHA: lp only inside word, string ends with A → Other',
  groupOf('Alpha', 'ALPHA'), 'Other')

// "Yelp YLP": name='Yelp', symbol='YLP'
// joined = "Yelp YLP"
// \blp\b: in 'Yelp' — 'lp' at 2-3: left='e'(word), right=' '(non-word) → left boundary missing.
//          in 'YLP'  — 'LP' at 1-2: left='Y'(word) → left boundary missing.
// -lp: not present.
// lp$: joined ends with 'P' → last two chars = 'LP' → MATCHES.
// PINNED: Yelp / YLP → LP & Vaults via lp$ on the joined string.
check('PINNED – Yelp / YLP: lp ends the joined string → LP & Vaults',
  groupOf('Yelp', 'YLP'), 'LP & Vaults')

// ---------------------------------------------------------------------------
// groupOf — Other (fallthrough)
// ---------------------------------------------------------------------------

check('Other: empty name and symbol',  groupOf('', ''),         'Other')
check('Other: plain name/symbol',      groupOf('XyloNet', 'XN'), 'Other')

// ---------------------------------------------------------------------------
// toArcToken — field mapping
// ---------------------------------------------------------------------------

// --- Null name and symbol: display fields get sentinel values,
//     but groupOf receives '' for both (not 'Unnamed' or '—').
//     groupOf('','') → Other (verified above).
//     PINNED: null name → 'Unnamed' display; null symbol → '—' display; group still 'Other'.
const nullNameSymbolRaw: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000001',
  name: null,
  symbol: null,
  decimals: '18',
  holders_count: '10',
  total_supply: '1000000000000000000',
  icon_url: null,
}
const nullNameSymbolToken = toArcToken(nullNameSymbolRaw)
check('toArcToken null name → display Unnamed', nullNameSymbolToken.name,   'Unnamed')
check('toArcToken null symbol → display —',     nullNameSymbolToken.symbol, '—')
check('toArcToken null name+symbol → group Other (groupOf uses empty strings)',
  nullNameSymbolToken.group, 'Other')

// PINNED: null name with symbol 'USDC' → name display is 'Unnamed', group is 'Stablecoin'
// because groupOf receives ('' , 'USDC') and STABLE matches.
const nullNameUsdcRaw: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000002',
  name: null,
  symbol: 'USDC',
  decimals: '6',
  holders_count: '1',
  total_supply: '1000000',
  icon_url: null,
}
const nullNameUsdcToken = toArcToken(nullNameUsdcRaw)
check('PINNED: null name + USDC symbol → name is Unnamed', nullNameUsdcToken.name,   'Unnamed')
check('PINNED: null name + USDC symbol → group Stablecoin',nullNameUsdcToken.group, 'Stablecoin')

// --- Numeric field coercions ---
const coercionRaw: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000003',
  name: 'Test Token',
  symbol: 'TEST',
  decimals: '8',
  holders_count: '42',
  total_supply: '100000000',  // 1.0 with 8 decimals
  icon_url: null,
}
const coercionToken = toArcToken(coercionRaw)
check('toArcToken decimals string → number', coercionToken.decimals, 8)
check('toArcToken holders_count string → number', coercionToken.holders, 42)
// scaled('100000000', 8): d=8, s='100000000' (len=9, padStart(9)→ same)
//   whole = s.slice(0, 9-8) = s.slice(0,1) = '1'
//   frac  = s.slice(1) = '00000000'
//   Number('1.00000000') = 1
check('toArcToken supply: 100000000 / 8 decimals → 1', coercionToken.supply, 1)

// --- Null numeric fields → 0 ---
const nullFieldsRaw: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000004',
  name: 'Zero Token',
  symbol: 'ZERO',
  decimals: null,
  holders_count: null,
  total_supply: null,
  icon_url: null,
}
const nullFieldsToken = toArcToken(nullFieldsRaw)
check('toArcToken null decimals → 0',      nullFieldsToken.decimals, 0)
check('toArcToken null holders_count → 0', nullFieldsToken.holders,  0)
check('toArcToken null total_supply → 0',  nullFieldsToken.supply,   0)

// --- scaled spot-checks ---
// scaled('1500000', 6): d=6, s='1500000'(len=7, padStart(7)→ same)
//   whole=s.slice(0,1)='1', frac=s.slice(1)='500000' → Number('1.500000') = 1.5
const supplyToken: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000005',
  name: 'Supply Test',
  symbol: 'STEST',
  decimals: '6',
  holders_count: '1',
  total_supply: '1500000',
  icon_url: null,
}
check('toArcToken supply 1500000 / 6 decimals → 1.5', toArcToken(supplyToken).supply, 1.5)

// --- address_hash passes through as address ---
const addrRaw: RawToken = {
  address_hash: '0xabcdef1234567890abcdef1234567890abcdef12',
  name: 'Addr Test',
  symbol: 'ADDR',
  decimals: '0',
  holders_count: '0',
  total_supply: '0',
  icon_url: null,
}
check('toArcToken address_hash → address',
  toArcToken(addrRaw).address, '0xabcdef1234567890abcdef1234567890abcdef12')

// --- iconUrl passes through (including null) ---
const iconRaw: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000006',
  name: 'Icon Test',
  symbol: 'ICON',
  decimals: '0',
  holders_count: '0',
  total_supply: '0',
  icon_url: 'https://cdn.example.com/icon.png',
}
check('toArcToken iconUrl string passes through',
  toArcToken(iconRaw).iconUrl, 'https://cdn.example.com/icon.png')

const iconNullRaw: RawToken = { ...iconRaw, icon_url: null }
check('toArcToken iconUrl null passes through',
  toArcToken(iconNullRaw).iconUrl, null)

// ---------------------------------------------------------------------------
// Realistic USDC row
// address:      0x3600000000000000000000000000000000000000
// decimals:     '6'
// holders:      '4991420'
// total_supply: '317497000290511800'
//
// scaled('317497000290511800', 6):
//   d=6, raw len=18, padStart(7)→ no change (18 > 7)
//   whole = s.slice(0, 18-6) = s.slice(0, 12) = '317497000290'
//   frac  = s.slice(12)                        = '511800'
//   Number('317497000290.511800') = 317497000290.5118
// ---------------------------------------------------------------------------
const usdcRaw: RawToken = {
  address_hash: '0x3600000000000000000000000000000000000000',
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: '6',
  holders_count: '4991420',
  total_supply: '317497000290511800',
  icon_url: 'https://cdn.example.com/usdc.png',
}
const usdcToken: ArcToken = toArcToken(usdcRaw)

check('USDC row: address',   usdcToken.address,  '0x3600000000000000000000000000000000000000')
check('USDC row: name',      usdcToken.name,     'USD Coin')
check('USDC row: symbol',    usdcToken.symbol,   'USDC')
check('USDC row: decimals',  usdcToken.decimals, 6)
check('USDC row: holders',   usdcToken.holders,  4991420)
check('USDC row: supply',    usdcToken.supply,   317497000290.5118)
check('USDC row: group',     usdcToken.group,    'Stablecoin')
check('USDC row: iconUrl',   usdcToken.iconUrl,  'https://cdn.example.com/usdc.png')

// ---------------------------------------------------------------------------
// Added after mutation testing
// ---------------------------------------------------------------------------
check('stable prefix list is exactly w/a/x: yUSDC is not a stablecoin', groupOf('Yield USDC', 'yUSDC'), 'Other')
check('stable name must match the whole name: "My USD Coin Fund" is Other', groupOf('My USD Coin Fund', 'MUF'), 'Other')
check('LP by the whole word "lp" alone (name does not end in lp)', groupOf('Foo LP Token', 'FT'), 'LP & Vaults')
check('LP by "-lp" alone (no whole word, no ending)', groupOf('Foo-LPX', 'F'), 'LP & Vaults')

// ---------------------------------------------------------------------------
// parseMarketNum
// ---------------------------------------------------------------------------

check('parseMarketNum: normal positive string', parseMarketNum('12345.67'), 12345.67)
check('parseMarketNum: zero string', parseMarketNum('0'), 0)
check('parseMarketNum: integer string', parseMarketNum('1000000'), 1000000)
check('parseMarketNum: null → null', parseMarketNum(null), null)
check('parseMarketNum: undefined → null', parseMarketNum(undefined), null)
check('parseMarketNum: empty string → null', parseMarketNum(''), null)
check('parseMarketNum: NaN string → null', parseMarketNum('abc'), null)
check('parseMarketNum: negative → null', parseMarketNum('-5'), null)
check('parseMarketNum: Infinity string → null', parseMarketNum('Infinity'), null)
check('parseMarketNum: -Infinity string → null', parseMarketNum('-Infinity'), null)
check('parseMarketNum: whitespace only → null', parseMarketNum('   '), null)

// toArcToken: market fields from RawToken
const marketRaw: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000099',
  name: 'Market Token',
  symbol: 'MKT',
  decimals: '6',
  holders_count: '100',
  total_supply: '1000000',
  icon_url: null,
  volume_24h: '987654.50',
  circulating_market_cap: '50000000',
  exchange_rate: '1.23',
}
const marketToken = toArcToken(marketRaw)
check('toArcToken volume24h parses correctly', marketToken.volume24h, 987654.50)
check('toArcToken marketCap parses correctly', marketToken.marketCap, 50000000)
check('toArcToken price parses correctly', marketToken.price, 1.23)

// toArcToken: null market fields → null
const noMarketRaw: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000098',
  name: 'No Market',
  symbol: 'NM',
  decimals: '18',
  holders_count: '1',
  total_supply: '0',
  icon_url: null,
  volume_24h: null,
  circulating_market_cap: null,
  exchange_rate: null,
}
const noMarketToken = toArcToken(noMarketRaw)
check('toArcToken null volume24h → null', noMarketToken.volume24h, null)
check('toArcToken null marketCap → null', noMarketToken.marketCap, null)
check('toArcToken null price → null', noMarketToken.price, null)

// toArcToken: omitted market fields (no optional keys) → null
const omittedMarketRaw: RawToken = {
  address_hash: '0x0000000000000000000000000000000000000097',
  name: 'Omitted Market',
  symbol: 'OM',
  decimals: '6',
  holders_count: '1',
  total_supply: '0',
  icon_url: null,
}
const omittedMarketToken = toArcToken(omittedMarketRaw)
check('toArcToken omitted volume24h → null', omittedMarketToken.volume24h, null)
check('toArcToken omitted marketCap → null', omittedMarketToken.marketCap, null)
check('toArcToken omitted price → null', omittedMarketToken.price, null)

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nAll ${passed} / ${total} assertions passed.`)

// --- mergeTokenSources ---
{
  const mk = (address: string, name: string): ArcToken => ({
    address, name, symbol: name, decimals: 6, holders: 0, supply: 0, group: 'Other',
    iconUrl: null, volume24h: null, marketCap: null, price: null,
  })
  const merged = mergeTokenSources(
    [mk('0xAAAA000000000000000000000000000000000001', 'scan-a')],
    [mk('0xaaaa000000000000000000000000000000000001', 'cat-a'), mk('0xbbbb000000000000000000000000000000000002', 'cat-b')],
  )
  check('merge: overlap keeps the primary row', merged.find(t => t.address.toLowerCase().endsWith('0001'))?.name, 'scan-a')
  check('merge: extra-only token is appended', merged.map(t => t.name), ['scan-a', 'cat-b'])
  check('merge: empty extra leaves primary as is', mergeTokenSources([mk('0x1', 'x')], []).length, 1)
}
