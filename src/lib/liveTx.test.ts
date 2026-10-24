// Run: node --experimental-strip-types src/lib/liveTx.test.ts
import assert from 'node:assert/strict'
import { buildAddressIndex, classifyTx, trackedShare, usdcOfTx, USDC_TOKEN } from './liveTx.ts'

const UNISWAP_ROUTER = '0x4fCa4a51aB4F23a7447B3284FBd7D73289A89fb1'
const XYLO_TOKEN = '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1'
const OTHER_TOKEN = '0x240Eb85458CD41361bd8C3773253a1D78054f747'
const STRANGER = '0x00000000000000000000000000000000000000aa'

const apps = [
  { id: 'uniswap', category: 'DeFi' as const, anchors: [{ address: UNISWAP_ROUTER, kind: 'contract' as const, label: 'Uniswap' }] },
  { id: 'xylonet', category: 'DeFi' as const, anchors: [{ address: XYLO_TOKEN, kind: 'token' as const, label: 'LP' }] },
  { id: 'usdc', category: 'Stablecoin' as const, anchors: [{ address: USDC_TOKEN, kind: 'token' as const, label: 'USDC', usd: true }] },
]
const index = buildAddressIndex(apps)

const word = (hexValue: string) => '0'.repeat(64 - hexValue.length) + hexValue
const ADDR_WORD = '0'.repeat(24) + 'bb'.repeat(20)
// 0x2625a0 = 2*1048576 + 6*65536 + 2*4096 + 5*256 + 10*16 = 2,500,000
const AMOUNT_2_5 = word('2625a0')
// 0x0b71b0 = 11*65536 + 7*4096 + 1*256 + 11*16 + 0 = 750,000
const AMOUNT_0_75 = word('0b71b0')

const transferData = '0xa9059cbb' + ADDR_WORD + AMOUNT_2_5
const transferFromData = '0x23b872dd' + ADDR_WORD + ADDR_WORD + AMOUNT_0_75

// ── buildAddressIndex ───────────────────────────────────────────────────────
assert.equal(index.size, 3)
assert.ok(index.has(UNISWAP_ROUTER.toLowerCase()), 'keys are lower-cased')
assert.ok(!index.has(UNISWAP_ROUTER), 'mixed-case key is not stored')
assert.deepEqual(index.get(XYLO_TOKEN.toLowerCase()), { appId: 'xylonet', category: 'DeFi' })

const dup = buildAddressIndex([
  { id: 'first', category: 'Infra', anchors: [{ address: '0xAbC0000000000000000000000000000000000001', kind: 'contract', label: 'a' }] },
  { id: 'second', category: 'DeFi', anchors: [{ address: '0xabc0000000000000000000000000000000000001', kind: 'contract', label: 'b' }] },
])
assert.equal(dup.size, 1)
assert.equal(dup.get('0xabc0000000000000000000000000000000000001')?.appId, 'first')

// ── classifyTx ──────────────────────────────────────────────────────────────
assert.deepEqual(
  classifyTx({ to: UNISWAP_ROUTER.toLowerCase(), value: 0n, input: '0x' }, index),
  { appId: 'uniswap', category: 'DeFi', usdc: null },
)
assert.deepEqual(
  classifyTx({ to: XYLO_TOKEN, value: 0n, input: '0x' }, index),
  { appId: 'xylonet', category: 'DeFi', usdc: null },
  'token anchor matches when tx.to is the token',
)
assert.equal(classifyTx({ to: UNISWAP_ROUTER.toUpperCase().replace('0X', '0x'), value: 0n, input: '0x' }, index).appId, 'uniswap', 'upper-case to')
assert.deepEqual(
  classifyTx({ to: null, value: 0n, input: '0x6080' }, index),
  { appId: null, category: null, usdc: null },
  'contract creation is unlisted',
)
assert.deepEqual(
  classifyTx({ to: STRANGER, value: 0n, input: '0x' }, index),
  { appId: null, category: null, usdc: null },
  'value=0 plain send → unlisted',
)
assert.deepEqual(
  classifyTx({ to: USDC_TOKEN, value: 0n, input: transferData }, index),
  { appId: 'usdc', category: 'Stablecoin', usdc: 2.5 },
)
assert.equal(classifyTx({ to: STRANGER, value: 1_500_000_000_000_000_000n, input: '0x' }, index).usdc, 1.5, 'unlisted tx keeps its value')

// ── usdcOfTx ────────────────────────────────────────────────────────────────
assert.equal(usdcOfTx({ to: STRANGER, value: 1_500_000_000_000_000_000n, input: '0x' }), 1.5, 'native 1.5e18 wei → 1.5')
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: transferData }), 2.5, 'transfer 2_500_000 (6 dec) → 2.5')
assert.equal(usdcOfTx({ to: USDC_TOKEN.toUpperCase().replace('0X', '0x'), value: 0n, input: transferData }), 2.5, 'upper-case USDC address')
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: transferData.toUpperCase().replace('0X', '0x') }), 2.5, 'upper-case calldata')
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: transferFromData }), 0.75, 'transferFrom reads the 3rd word')
assert.equal(usdcOfTx({ to: OTHER_TOKEN, value: 0n, input: transferData }), null, 'transfer to a non-USDC token')
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: '0xa9059cbb' + ADDR_WORD }), null, 'transfer missing the amount word')
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: '0x23b872dd' + ADDR_WORD + ADDR_WORD + 'ff' }), null, 'transferFrom with a short amount word')
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: '0xa9' }), null, 'malformed short input')
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: '0x' }), null)
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: '0xa9059cbb' + ADDR_WORD + 'z'.repeat(64) }), null, 'non-hex amount')
assert.equal(usdcOfTx({ to: STRANGER, value: 0n, input: '0x' }), null, '0 value, no transfer')
assert.equal(usdcOfTx({ to: USDC_TOKEN, value: 0n, input: '0xa9059cbb' + ADDR_WORD + word('0') }), null, 'transfer of zero')
assert.equal(usdcOfTx({ to: STRANGER, value: 1n, input: '0x' }), 1e-18, 'smallest native unit')

// ── attribution: native USDC sends ──────────────────────────────────────────
// Plain send (input '0x', value > 0) to an unknown EOA → credited to the USDC app.
assert.deepEqual(
  classifyTx({ to: STRANGER, value: 1_000_000_000_000_000_000n, input: '0x' }, index),
  { appId: 'usdc', category: 'Stablecoin', usdc: 1 },
  'plain send to unknown EOA → USDC app',
)
// Plain send with value=0 → still unlisted.
assert.deepEqual(
  classifyTx({ to: STRANGER, value: 0n, input: '0x' }, index),
  { appId: null, category: null, usdc: null },
  'plain send with value=0 → unlisted',
)
// Call with data to unknown address → stays unlisted even if value > 0.
assert.deepEqual(
  classifyTx({ to: STRANGER, value: 1_000_000_000_000_000_000n, input: '0xdeadbeef01020304' }, index),
  { appId: null, category: null, usdc: 1 },
  'call with data to unknown address → unlisted appId',
)
// Index without a USDC anchor: plain send stays unlisted.
const indexNoUsdc = buildAddressIndex([
  { id: 'uniswap', category: 'DeFi' as const, anchors: [{ address: UNISWAP_ROUTER, kind: 'contract' as const, label: 'Uniswap' }] },
])
assert.deepEqual(
  classifyTx({ to: STRANGER, value: 1_000_000_000_000_000_000n, input: '0x' }, indexNoUsdc),
  { appId: null, category: null, usdc: 1 },
  'index without USDC anchor: plain send stays unlisted',
)

// ── trackedShare ────────────────────────────────────────────────────────────
assert.equal(trackedShare({ tracked: 0, total: 0 }), null, '0 txs → null')
assert.equal(trackedShare({ tracked: 0, total: 8 }), 0)
assert.equal(trackedShare({ tracked: 3, total: 4 }), 75)
assert.equal(trackedShare({ tracked: 4, total: 4 }), 100)
assert.equal(trackedShare({ tracked: 9, total: 4 }), 100, 'clamped')
assert.equal(trackedShare({ tracked: 1, total: 8 }), 12.5)

console.log('liveTx.test.ts: all assertions passed')
