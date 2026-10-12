/**
 * Tests for walletExtras.ts
 * Run with:
 *   node --experimental-strip-types src/lib/walletExtras.test.ts
 */
import assert from 'node:assert/strict'
import { checklist, agentsOwnedBy, formatBalance, shareCardSvg } from './walletExtras.ts'

// ── checklist ─────────────────────────────────────────────────────────────────

{
  const apps = [{ id: 'usdc' }, { id: 'eurc' }, { id: 'gateway' }, { id: 'cctp' }]
  const used = ['gateway', 'usdc']
  const result = checklist(used, apps)

  // Preserves config order
  assert.deepEqual(result.map(r => r.id), ['usdc', 'eurc', 'gateway', 'cctp'], 'checklist order')

  // Correct used flags
  assert.equal(result[0].used, true,  'usdc used=true')
  assert.equal(result[1].used, false, 'eurc used=false')
  assert.equal(result[2].used, true,  'gateway used=true')
  assert.equal(result[3].used, false, 'cctp used=false')
}

{
  // Empty usedAppIds
  const apps = [{ id: 'a' }, { id: 'b' }]
  const result = checklist([], apps)
  assert.ok(result.every(r => !r.used), 'all false when no used ids')
}

{
  // Empty apps list
  const result = checklist(['foo'], [])
  assert.deepEqual(result, [], 'empty apps -> empty result')
}

console.log('checklist: OK')

// ── agentsOwnedBy ─────────────────────────────────────────────────────────────

{
  const agents = [
    { id: 5,  owner: '0xAbCd1234abcd1234abcd1234abcd1234abcd1234', name: 'Alpha' },
    { id: 2,  owner: '0xabcd1234abcd1234abcd1234abcd1234abcd1234', name: 'Beta' },
    { id: 10, owner: '0xOTHER00000000000000000000000000000000000' },
    { id: 1,  owner: '0XABCD1234ABCD1234ABCD1234ABCD1234ABCD1234', name: 'Gamma' },
  ]

  // Case-insensitive match; sorts by id ascending; excludes non-matching
  const result = agentsOwnedBy('0xabcd1234abcd1234abcd1234abcd1234abcd1234', agents)
  assert.deepEqual(result.map(a => a.id), [1, 2, 5], 'sorted by id ascending')
  assert.equal(result[2].name, 'Alpha', 'name preserved')
  assert.equal(result[1].name, 'Beta',  'name preserved')
  assert.equal(result[0].name, 'Gamma', 'name preserved')
}

{
  // Empty agents list
  const result = agentsOwnedBy('0x1234567890123456789012345678901234567890', [])
  assert.deepEqual(result, [], 'empty input -> empty result')
}

{
  // No match
  const agents = [{ id: 3, owner: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]
  const result = agentsOwnedBy('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', agents)
  assert.deepEqual(result, [], 'no match -> empty result')
}

{
  // Returned objects have only id (and optionally name), not owner
  const agents = [{ id: 7, owner: '0xabcd1234abcd1234abcd1234abcd1234abcd1234' }]
  const result = agentsOwnedBy('0xabcd1234abcd1234abcd1234abcd1234abcd1234', agents)
  assert.equal(result.length, 1)
  assert.ok(!('owner' in result[0]), 'owner not in result')
  assert.ok(!('name' in result[0]), 'name absent when not provided')
}

console.log('agentsOwnedBy: OK')

// ── formatBalance ─────────────────────────────────────────────────────────────

{
  // Zero
  assert.equal(formatBalance(0n, 6), '0.00', 'zero -> 0.00')
}

{
  // 1n with 6 decimals -> 0.000001 (below 1, use 6 dp)
  assert.equal(formatBalance(1n, 6), '0.000001', '1 unit with 6 dec -> 0.000001')
}

{
  // 1_234_567_890_000n with 6 decimals -> 1,234,567.89 (2 dp, thousands)
  assert.equal(formatBalance(1_234_567_890_000n, 6), '1,234,567.89', 'large value 2dp')
}

{
  // Value above 2^53 — must not use float arithmetic
  // 123456789012345678901234n with 6 decimals
  // Integer part: 123456789012345678901234n / 10^6 = 123456789012345678n (truncated)
  // Frac part: 123456789012345678901234n % 10^6 = 901234
  // Display: "123,456,789,012,345,678.90" (2 dp from "901234".slice(0,2) = "90")
  const big = 123456789012345678901234n
  const result = formatBalance(big, 6)
  // The integer part formatted with en-US commas:
  // 123456789012345678 -> "123,456,789,012,345,678"
  assert.ok(result.startsWith('123,456,789,012,345,678.'), `large bigint int part: got ${result}`)
  assert.ok(result.endsWith('.90'), `large bigint frac part: got ${result}`)
  // Confirm no float corruption: float(123456789012345678901234) rounds, so if
  // formatBalance used floats the integer digits would differ.
  assert.equal(result, '123,456,789,012,345,678.90', 'exact large bigint result')
}

{
  // Value of exactly 1.00 (1_000_000n with 6 decimals)
  assert.equal(formatBalance(1_000_000n, 6), '1.00', 'exactly 1.00')
}

{
  // Value slightly above 1 (1_500_000n with 6 decimals -> 1.50)
  assert.equal(formatBalance(1_500_000n, 6), '1.50', '1.50')
}

console.log('formatBalance: OK')

// ── shareCardSvg ──────────────────────────────────────────────────────────────

const svgOpts = {
  address: '0x1234567890abcdef1234567890abcdef12345678',
  net: 'mainnet' as const,
  firstSeen: '2026-01-15',
  activeDays: 42,
  tx: 100,
  usdcSent: 500.5,
  usdcReceived: 300.25,
  appsUsed: 3,
  appsTracked: 10,
  coverage: 'Covers 2026-01-06 to 2026-10-11 (UTC), closed days only.',
}

const svg = shareCardSvg(svgOpts)

{
  // Explicit width/height/viewBox attributes
  assert.ok(svg.includes('width="720"'), 'explicit width=720')
  assert.ok(svg.includes('height="380"'), 'explicit height=380')
  assert.ok(svg.includes('viewBox="0 0 720 380"'), 'explicit viewBox')
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'xmlns present')
}

{
  // Address shortening: 0x1234…5678
  assert.ok(svg.includes('0x1234\u2026'), 'address prefix shortened')
  assert.ok(svg.includes('5678'), 'address suffix present')
  // Full 42-char address must NOT appear
  assert.ok(
    !svg.includes('0x1234567890abcdef1234567890abcdef12345678'),
    'full address not in SVG',
  )
}

{
  // Injection through coverage: & and < > must be escaped
  const injOpts = { ...svgOpts, coverage: 'A & B < script> alert(&amp;) > end' }
  const injSvg = shareCardSvg(injOpts)
  assert.ok(!injSvg.includes('A & B'), 'raw & not present')
  assert.ok(injSvg.includes('&amp;'), '& escaped to &amp;')
  assert.ok(!injSvg.includes('< script>'), 'raw < not present')
  assert.ok(injSvg.includes('&lt;'), '< escaped to &lt;')
}

{
  // Injection via coverage containing <script>
  const injOpts = { ...svgOpts, coverage: '<script>alert(1)</script>' }
  const injSvg = shareCardSvg(injOpts)
  assert.ok(!injSvg.includes('<script>'), '<script> tag not in raw form')
  assert.ok(injSvg.includes('&lt;script&gt;'), '<script> properly escaped')
}

{
  // No <image element (no external images)
  assert.ok(!svg.includes('<image'), 'no <image element')
}

{
  // No href= attribute (no external links)
  assert.ok(!svg.includes('href='), 'no href= attribute')
}

{
  // Disclaimer text present
  assert.ok(
    svg.includes('independent project, not affiliated with Circle or Arc'),
    'disclaimer present',
  )
  assert.ok(svg.includes('pulsarc.vercel.app'), 'domain in footer')
}

{
  // Testnet label
  const testnetSvg = shareCardSvg({ ...svgOpts, net: 'testnet' })
  assert.ok(testnetSvg.includes('Testnet'), 'testnet label present')
  assert.ok(!testnetSvg.includes('Mainnet'), 'mainnet label absent for testnet')
}

console.log('shareCardSvg: OK')

console.log('\nAll tests passed.')
