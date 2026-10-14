import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tipAddressFor, TESTNET_TIP_JAR } from './tipAddress.ts'

const TESTNET = 5042002
const MAINNET = 5042
const VALID_MAINNET_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const

describe('tipAddressFor', () => {
  it('testnet — no override falls back to TESTNET_TIP_JAR', () => {
    assert.equal(tipAddressFor(TESTNET, undefined), TESTNET_TIP_JAR)
  })

  it('testnet — valid override is used verbatim', () => {
    assert.equal(tipAddressFor(TESTNET, VALID_MAINNET_ADDR), VALID_MAINNET_ADDR)
  })

  it('testnet — invalid override falls back to TESTNET_TIP_JAR', () => {
    assert.equal(tipAddressFor(TESTNET, 'not-an-address'), TESTNET_TIP_JAR)
  })

  it('testnet — override with leading/trailing space is invalid (no trim) -> fallback', () => {
    assert.equal(tipAddressFor(TESTNET, ` ${VALID_MAINNET_ADDR}`), TESTNET_TIP_JAR)
  })

  it('mainnet — no override returns null', () => {
    assert.equal(tipAddressFor(MAINNET, undefined), null)
  })

  it('mainnet — invalid override returns null', () => {
    assert.equal(tipAddressFor(MAINNET, '0xshort'), null)
  })

  it('mainnet — override with whitespace returns null (no trim)', () => {
    assert.equal(tipAddressFor(MAINNET, `${VALID_MAINNET_ADDR} `), null)
  })

  it('mainnet — valid override is returned', () => {
    assert.equal(tipAddressFor(MAINNET, VALID_MAINNET_ADDR), VALID_MAINNET_ADDR)
  })

  it('mainnet — NEVER returns TESTNET_TIP_JAR unless explicitly passed as override', () => {
    // No override given — must be null, not the testnet default
    const result = tipAddressFor(MAINNET, undefined)
    assert.notEqual(result, TESTNET_TIP_JAR)
    assert.equal(result, null)
  })

  it('unknown network — returns null', () => {
    assert.equal(tipAddressFor(999, undefined), null)
    assert.equal(tipAddressFor(999, VALID_MAINNET_ADDR), null)
  })
})
