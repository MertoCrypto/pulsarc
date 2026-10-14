/**
 * node:test suite for src/lib/tokenLogos.ts
 *
 * Run: node --experimental-strip-types src/lib/tokenLogos.test.ts
 * (or via the project's test runner)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getTokenLogo } from './tokenLogos.ts'

// ── Arc Mainnet verified addresses (from appRegistries.ts MAINNET_APPS) ──────
const USDC_ADDR   = '0x3600000000000000000000000000000000000000'
const EURC_ADDR   = '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1'
const CIRBTC_ADDR = '0x171a4217b86a807a64eb94757db6849fb4bdbaa0'
const WETH_ADDR   = '0x128cc466b61f542da60c70e3aa11c10e19b84edb'
const USYC_ADDR   = '0x8a5d989bbb96929f689b0200f435f53da42bf490'

// ── Self-hosted token logos: the real files served under /portal-assets/tokens/ ──
const SELF_HOSTED_FILENAMES: Set<string> = new Set(
  readdirSync(join(import.meta.dirname, '../../public/portal-assets/tokens')),
)

test('USDC address maps to web3icon usdc', () => {
  const logo = getTokenLogo(USDC_ADDR)
  assert.ok(logo !== null, 'USDC should have a logo')
  assert.equal(logo.kind, 'web3icon')
  assert.equal((logo as { kind: 'web3icon'; icon: string }).icon, 'usdc')
})

test('EURC address maps to web3icon eurc', () => {
  const logo = getTokenLogo(EURC_ADDR)
  assert.ok(logo !== null, 'EURC should have a logo')
  assert.equal(logo.kind, 'web3icon')
  assert.equal((logo as { kind: 'web3icon'; icon: string }).icon, 'eurc')
})

test('cirBTC address maps to web3icon btc', () => {
  const logo = getTokenLogo(CIRBTC_ADDR)
  assert.ok(logo !== null, 'cirBTC should have a logo')
  assert.equal(logo.kind, 'web3icon')
  assert.equal((logo as { kind: 'web3icon'; icon: string }).icon, 'btc')
})

test('WETH address maps to img with self-hosted src', () => {
  const logo = getTokenLogo(WETH_ADDR)
  assert.ok(logo !== null, 'WETH should have a logo')
  assert.equal(logo.kind, 'img')
  assert.ok(
    (logo as { kind: 'img'; src: string }).src.startsWith('/portal-assets/tokens/'),
    'WETH img src must be under /portal-assets/tokens/'
  )
})

test('USYC address returns null (no logo asset)', () => {
  const logo = getTokenLogo(USYC_ADDR)
  assert.equal(logo, null, 'USYC must have no logo (returns null)')
})

test('unverified / unknown address returns null', () => {
  assert.equal(getTokenLogo('0x0000000000000000000000000000000000000001'), null)
  assert.equal(getTokenLogo('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), null)
})

test('lookup is case-insensitive — uppercase address still resolves', () => {
  assert.ok(getTokenLogo(USDC_ADDR.toUpperCase()) !== null, 'uppercase USDC should resolve')
  assert.ok(getTokenLogo(EURC_ADDR.toUpperCase()) !== null, 'uppercase EURC should resolve')
  assert.ok(getTokenLogo(WETH_ADDR.toUpperCase()) !== null, 'uppercase WETH should resolve')
})

test('every { kind: img } src filename is a real file under public/portal-assets/tokens', () => {
  // Collect all img entries from the mapping by querying known addresses
  const addresses = [USDC_ADDR, EURC_ADDR, CIRBTC_ADDR, WETH_ADDR, USYC_ADDR]
  for (const addr of addresses) {
    const logo = getTokenLogo(addr)
    if (logo === null || logo.kind !== 'img') continue
    // src is like /portal-assets/tokens/weth.svg → filename is last segment
    const parts = (logo as { kind: 'img'; src: string }).src.split('/')
    const filename = parts[parts.length - 1]
    assert.ok(
      SELF_HOSTED_FILENAMES.has(filename),
      `img src filename "${filename}" must exist under public/portal-assets/tokens`
    )
  }
})
