/**
 * Tests for walletExamples.
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/walletExamples.test.ts
 */

import assert from 'node:assert/strict'
import { walletExamples, type WalletExample } from './walletExamples.ts'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TESTNET_EXAMPLES: WalletExample[] = [
  { label: 'Memo contract', address: '0x5294E9927c3306DcBaDb03fe70b92e01cCede505' },
  { label: 'Pulsarc tip wallet', address: '0xTIPADDRESS' },
]

const MAINNET_APPS = [
  { id: 'usdc',     name: 'USDC',     contractAddress: '0xUSDA' },
  { id: 'eurc',     name: 'EURC',     contractAddress: '0xEURC' },
  { id: 'stablefx', name: 'StableFX', contractAddress: '0xSFX'  },
  { id: 'cctp',     name: 'CCTP v2',  contractAddress: '0xCCTP' },
  { id: 'gateway',  name: 'Gateway',  contractAddress: '0xGW'   }, // not in the target ids — should be skipped
]

// ─── Mainnet (5042) tests ─────────────────────────────────────────────────────

{
  const result = walletExamples(5042, MAINNET_APPS, TESTNET_EXAMPLES)

  // Only the four target ids are returned, in order: usdc, eurc, cctp, stablefx
  assert.deepEqual(result.map(r => r.label), ['USDC', 'EURC', 'CCTP v2', 'StableFX'],
    'mainnet: order must be usdc, eurc, cctp, stablefx')

  // name and contractAddress are copied verbatim from mainnetApps
  assert.equal(result[0].address, '0xUSDA', 'usdc address copied')
  assert.equal(result[1].address, '0xEURC', 'eurc address copied')
  assert.equal(result[2].address, '0xCCTP', 'cctp address copied')
  assert.equal(result[3].address, '0xSFX',  'stablefx address copied')

  // gateway is in mainnetApps but not in the target list — must not appear
  assert.ok(!result.some(r => r.label === 'Gateway'), 'gateway must be excluded')

  console.log('PASS mainnet order + name/address copy')
}

// ─── Mainnet: missing id is skipped ──────────────────────────────────────────

{
  // cctp is absent from mainnetApps
  const apps = MAINNET_APPS.filter(a => a.id !== 'cctp')
  const result = walletExamples(5042, apps, TESTNET_EXAMPLES)

  assert.deepEqual(result.map(r => r.label), ['USDC', 'EURC', 'StableFX'],
    'missing id cctp must be skipped without error')

  console.log('PASS mainnet: missing id skipped')
}

// ─── Mainnet: empty mainnetApps ───────────────────────────────────────────────

{
  const result = walletExamples(5042, [], TESTNET_EXAMPLES)
  assert.deepEqual(result, [], 'empty mainnetApps → empty result')

  console.log('PASS mainnet: empty mainnetApps returns []')
}

// ─── Testnet (5042002) returns testnet array unchanged ────────────────────────

{
  const result = walletExamples(5042002, MAINNET_APPS, TESTNET_EXAMPLES)
  assert.equal(result, TESTNET_EXAMPLES, 'testnet: must return the exact same array reference')

  console.log('PASS testnet (5042002): returns testnet array as-is')
}

// ─── Unknown network id returns testnet array unchanged ───────────────────────

{
  const result = walletExamples(1, MAINNET_APPS, TESTNET_EXAMPLES)
  assert.equal(result, TESTNET_EXAMPLES, 'unknown id: must return the exact same array reference')

  console.log('PASS unknown network id: returns testnet array as-is')
}

console.log('\nAll walletExamples tests passed.')
