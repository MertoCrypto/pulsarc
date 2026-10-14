/**
 * dexLogos.test.ts — unit tests for parseDexLogos and dexLogoSrc.
 * Run with: node --import tsx/esm src/lib/dexLogos.test.ts
 * (or via the project's test runner with .ts import support)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseDexLogos, dexLogoSrc } from './dexLogos.ts'

// ─── parseDexLogos ────────────────────────────────────────────────────────────

void describe('parseDexLogos', () => {
  void it('accepts a well-formed payload', () => {
    const result = parseDexLogos({
      logos: {
        '0xabcdef1234567890abcdef1234567890abcdef12': 'abc123',
        '0x1111111111111111111111111111111111111111': 'img-logo_X9',
      },
    })
    assert.equal(result['0xabcdef1234567890abcdef1234567890abcdef12'], 'abc123')
    assert.equal(result['0x1111111111111111111111111111111111111111'], 'img-logo_X9')
  })

  void it('drops entries with uppercase address keys', () => {
    const result = parseDexLogos({
      logos: {
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF12': 'abc123',
      },
    })
    // uppercase hex letters are not matched by /^0x[0-9a-f]{40}$/
    assert.deepEqual(result, {})
  })

  void it('drops entries with path-traversal ids', () => {
    const result = parseDexLogos({
      logos: {
        '0xabcdef1234567890abcdef1234567890abcdef12': '../../../etc/passwd',
        '0x1111111111111111111111111111111111111111': '../../secret',
        '0x2222222222222222222222222222222222222222': '/absolute/path',
        '0x3333333333333333333333333333333333333333': 'has space here!',
      },
    })
    assert.deepEqual(result, {})
  })

  void it('drops entries with ids that are too short', () => {
    const result = parseDexLogos({
      logos: {
        '0xabcdef1234567890abcdef1234567890abcdef12': 'abc',
      },
    })
    assert.deepEqual(result, {})
  })

  void it('drops entries with ids that are too long', () => {
    const result = parseDexLogos({
      logos: {
        '0xabcdef1234567890abcdef1234567890abcdef12': 'a'.repeat(65),
      },
    })
    assert.deepEqual(result, {})
  })

  void it('drops entries where the id is not a string', () => {
    const result = parseDexLogos({
      logos: {
        '0xabcdef1234567890abcdef1234567890abcdef12': 42,
        '0x1111111111111111111111111111111111111111': null,
        '0x2222222222222222222222222222222222222222': { nested: 'obj' },
        '0x3333333333333333333333333333333333333333': true,
      },
    })
    assert.deepEqual(result, {})
  })

  void it('returns {} for null', () => {
    assert.deepEqual(parseDexLogos(null), {})
  })

  void it('returns {} for a plain string', () => {
    assert.deepEqual(parseDexLogos('{"logos":{}}'), {})
  })

  void it('returns {} for an array', () => {
    assert.deepEqual(parseDexLogos([{ logos: {} }]), {})
  })

  void it('returns {} when logos is missing', () => {
    assert.deepEqual(parseDexLogos({ other: {} }), {})
  })

  void it('returns {} when logos is an array', () => {
    assert.deepEqual(parseDexLogos({ logos: [] }), {})
  })

  void it('returns {} when logos is a string', () => {
    assert.deepEqual(parseDexLogos({ logos: 'nope' }), {})
  })

  void it('returns {} for undefined', () => {
    assert.deepEqual(parseDexLogos(undefined), {})
  })

  void it('silently drops invalid entries and keeps valid ones', () => {
    const result = parseDexLogos({
      logos: {
        '0xabcdef1234567890abcdef1234567890abcdef12': 'validID1',
        '0xBAD': '../traversal',
        '0x1111111111111111111111111111111111111111': 'anotherValid-ID_ok',
        'not-an-address': 'validID2',
      },
    })
    assert.equal(result['0xabcdef1234567890abcdef1234567890abcdef12'], 'validID1')
    assert.equal(result['0x1111111111111111111111111111111111111111'], 'anotherValid-ID_ok')
    assert.equal(Object.keys(result).length, 2)
  })

  void it('id exactly 6 chars is accepted', () => {
    const result = parseDexLogos({
      logos: { '0xabcdef1234567890abcdef1234567890abcdef12': 'abc123' },
    })
    assert.equal(result['0xabcdef1234567890abcdef1234567890abcdef12'], 'abc123')
  })

  void it('id exactly 64 chars is accepted', () => {
    const id = 'a'.repeat(64)
    const result = parseDexLogos({
      logos: { '0xabcdef1234567890abcdef1234567890abcdef12': id },
    })
    assert.equal(result['0xabcdef1234567890abcdef1234567890abcdef12'], id)
  })
})

// ─── dexLogoSrc ───────────────────────────────────────────────────────────────

void describe('dexLogoSrc', () => {
  const map: Record<string, string> = {
    '0xabcdef1234567890abcdef1234567890abcdef12': 'tokens-abc123',
    '0x1111111111111111111111111111111111111111': 'logo-XYZ',
  }

  void it('returns the proxy URL for a known address', () => {
    assert.equal(
      dexLogoSrc(map, '0xabcdef1234567890abcdef1234567890abcdef12'),
      '/dx/tokens-abc123',
    )
  })

  void it('is case-insensitive for the address argument', () => {
    assert.equal(
      dexLogoSrc(map, '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'),
      '/dx/tokens-abc123',
    )
    assert.equal(
      dexLogoSrc(map, '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'),
      '/dx/tokens-abc123',
    )
  })

  void it('returns null for an unknown address', () => {
    assert.equal(
      dexLogoSrc(map, '0x0000000000000000000000000000000000000000'),
      null,
    )
  })

  void it('returns null for an empty map', () => {
    assert.equal(dexLogoSrc({}, '0xabcdef1234567890abcdef1234567890abcdef12'), null)
  })

  void it('URL always starts with /dx/', () => {
    const src = dexLogoSrc(map, '0x1111111111111111111111111111111111111111')
    assert.ok(src?.startsWith('/dx/'))
  })
})
