/**
 * Tests for src/lib/appGlyph.ts
 *
 * Run with:  node --experimental-strip-types src/lib/appGlyph.test.ts
 *
 * Categories present in src/data/appRegistries.ts:
 *   'Stablecoin' | 'DeFi' | 'RWA' | 'Payments' | 'Agents' | 'Infra'
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { glyphFor } from './appGlyph.ts'

describe('glyphFor — category fallbacks', () => {
  test('Stablecoin → coins', () => {
    assert.equal(glyphFor(undefined, 'Stablecoin'), 'coins')
  })
  test('DeFi → trending-up', () => {
    assert.equal(glyphFor(undefined, 'DeFi'), 'trending-up')
  })
  test('RWA → landmark', () => {
    assert.equal(glyphFor(undefined, 'RWA'), 'landmark')
  })
  test('Payments → send', () => {
    assert.equal(glyphFor(undefined, 'Payments'), 'send')
  })
  test('Agents → bot', () => {
    assert.equal(glyphFor(undefined, 'Agents'), 'bot')
  })
  test('Infra → circuit-board', () => {
    assert.equal(glyphFor(undefined, 'Infra'), 'circuit-board')
  })
})

describe('glyphFor — id overrides', () => {
  test('cctp → arrows-left-right', () => {
    assert.equal(glyphFor('cctp', 'Infra'), 'arrows-left-right')
  })
  test('gateway → arrows-left-right', () => {
    assert.equal(glyphFor('gateway', 'Infra'), 'arrows-left-right')
  })
  test('across → arrows-left-right', () => {
    assert.equal(glyphFor('across', 'Infra'), 'arrows-left-right')
  })
  test('multicall → layers', () => {
    assert.equal(glyphFor('multicall', 'Infra'), 'layers')
  })
  test('erc8004 → fingerprint', () => {
    assert.equal(glyphFor('erc8004', 'Agents'), 'fingerprint')
  })
  test('erc8183 → bot', () => {
    assert.equal(glyphFor('erc8183', 'Agents'), 'bot')
  })
  test('memo → message-square', () => {
    assert.equal(glyphFor('memo', 'Payments'), 'message-square')
  })
  test('stablefx → repeat', () => {
    assert.equal(glyphFor('stablefx', 'Payments'), 'repeat')
  })
  test('swaparc → repeat', () => {
    assert.equal(glyphFor('swaparc', 'DeFi'), 'repeat')
  })
  test('curve-usdc-eurc → repeat', () => {
    assert.equal(glyphFor('curve-usdc-eurc', 'DeFi'), 'repeat')
  })
  test('uniswap → repeat', () => {
    assert.equal(glyphFor('uniswap', 'DeFi'), 'repeat')
  })
  test('weth → coins', () => {
    assert.equal(glyphFor('weth', 'DeFi'), 'coins')
  })
  test('wusdc → coins', () => {
    assert.equal(glyphFor('wusdc', 'Stablecoin'), 'coins')
  })
  test('arc-dollar → coins', () => {
    assert.equal(glyphFor('arc-dollar', 'Stablecoin'), 'coins')
  })
})

describe('glyphFor — unknowns fall back to box', () => {
  test('undefined id, undefined category → box', () => {
    assert.equal(glyphFor(undefined, undefined), 'box')
  })
  test('unknown id, unknown category → box', () => {
    assert.equal(glyphFor('totally-unknown', 'Gibberish'), 'box')
  })
  test('unknown id only → box', () => {
    assert.equal(glyphFor('random-app'), 'box')
  })
  test('no args → box', () => {
    assert.equal(glyphFor(), 'box')
  })
})

describe('glyphFor — id wins over category', () => {
  test('cctp id wins over Infra category', () => {
    const result = glyphFor('cctp', 'Infra')
    assert.equal(result, 'arrows-left-right')
    // confirm the category alone would give something different
    assert.notEqual(glyphFor(undefined, 'Infra'), 'arrows-left-right')
  })
  test('memo id wins over Payments category', () => {
    // Payments → 'send', but memo id → 'message-square'
    assert.equal(glyphFor('memo', 'Payments'), 'message-square')
  })
})
