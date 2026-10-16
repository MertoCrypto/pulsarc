import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gmBoardAddressFor, TESTNET_GM_BOARD, MAINNET_GM_BOARD } from './gmBoardAddress.ts'

const OTHER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe('gmBoardAddressFor', () => {
  it('each network defaults to its own board', () => {
    assert.equal(gmBoardAddressFor(5042002, undefined), TESTNET_GM_BOARD)
    assert.equal(gmBoardAddressFor(5042, undefined), MAINNET_GM_BOARD)
    assert.equal(MAINNET_GM_BOARD, '0x7FAb4269110F6D98f28bff1dDdA44aFb14723993')
    assert.notEqual(TESTNET_GM_BOARD.toLowerCase(), MAINNET_GM_BOARD.toLowerCase())
  })
  it('a valid override wins on both networks', () => {
    assert.equal(gmBoardAddressFor(5042002, OTHER), OTHER)
    assert.equal(gmBoardAddressFor(5042, OTHER), OTHER)
  })
  it('invalid or padded overrides are ignored', () => {
    for (const bad of ['', 'nope', ` ${OTHER}`, `${OTHER} `, '0x123', OTHER + '0']) {
      assert.equal(gmBoardAddressFor(5042, bad), MAINNET_GM_BOARD)
      assert.equal(gmBoardAddressFor(5042002, bad), TESTNET_GM_BOARD)
    }
  })
  it('unknown network returns null', () => {
    assert.equal(gmBoardAddressFor(1, undefined), null)
    assert.equal(gmBoardAddressFor(1, OTHER), null)
  })
})
