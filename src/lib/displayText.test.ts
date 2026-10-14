/**
 * displayText.test.ts
 * Unit + integration tests for cleanDisplayText and its usage in catalog.ts.
 * Runner: node:test (built-in, no extra deps).
 * Run with: bun test src/lib/displayText.test.ts
 *
 * All describe/it calls are prefixed with void because node:test returns
 * Promise<void> and the linter requires floating promises to be handled.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { cleanDisplayText } from './displayText.ts'
import { parseCatalog, toTokenRows } from './catalog.ts'

// ---- Non-string inputs -----------------------------------------------------

void describe('cleanDisplayText - non-string inputs', () => {
  void it('returns "" for undefined', () => assert.equal(cleanDisplayText(undefined), ''))
  void it('returns "" for null',      () => assert.equal(cleanDisplayText(null), ''))
  void it('returns "" for number',    () => assert.equal(cleanDisplayText(42), ''))
  void it('returns "" for object',    () => assert.equal(cleanDisplayText({}), ''))
  void it('returns "" for array',     () => assert.equal(cleanDisplayText([]), ''))
})

// ---- C0 control characters (U+0000-U+001F) ---------------------------------

void describe('cleanDisplayText - C0 controls', () => {
  void it('strips NUL (U+0000)',    () => assert.equal(cleanDisplayText('a\u0000b'), 'ab'))
  void it('strips BEL (U+0007)',    () => assert.equal(cleanDisplayText('a\u0007b'), 'ab'))
  void it('strips TAB (U+0009) - in C0 range, deleted', () => assert.equal(cleanDisplayText('a\tb'), 'ab'))
  void it('strips LF  (U+000A) - in C0 range, deleted', () => assert.equal(cleanDisplayText('a\nb'), 'ab'))
  void it('strips CR  (U+000D) - in C0 range, deleted', () => assert.equal(cleanDisplayText('a\rb'), 'ab'))
  void it('strips U+001F',          () => assert.equal(cleanDisplayText('a\u001Fb'), 'ab'))
})

// ---- DEL + C1 controls (U+007F-U+009F) ------------------------------------

void describe('cleanDisplayText - DEL + C1 controls', () => {
  void it('strips DEL (U+007F)',    () => assert.equal(cleanDisplayText('a\u007Fb'), 'ab'))
  void it('strips U+0080',          () => assert.equal(cleanDisplayText('a\u0080b'), 'ab'))
  void it('strips U+009F',          () => assert.equal(cleanDisplayText('a\u009Fb'), 'ab'))
})

// ---- Soft hyphen (U+00AD) --------------------------------------------------

void describe('cleanDisplayText - soft hyphen', () => {
  void it('strips U+00AD', () => assert.equal(cleanDisplayText('abc\u00ADdef'), 'abcdef'))
})

// ---- Arabic letter mark (U+061C) -------------------------------------------

void describe('cleanDisplayText - Arabic letter mark', () => {
  void it('strips U+061C', () => assert.equal(cleanDisplayText('abc\u061Cdef'), 'abcdef'))
})

// ---- Zero-width / BOM group (U+200B-U+200F) --------------------------------

void describe('cleanDisplayText - zero-width group', () => {
  void it('strips ZWSP  (U+200B)', () => assert.equal(cleanDisplayText('a\u200Bb'), 'ab'))
  void it('strips ZWNJ  (U+200C)', () => assert.equal(cleanDisplayText('a\u200Cb'), 'ab'))
  void it('strips ZWJ   (U+200D)', () => assert.equal(cleanDisplayText('a\u200Db'), 'ab'))
  void it('strips LRM   (U+200E)', () => assert.equal(cleanDisplayText('a\u200Eb'), 'ab'))
  void it('strips RLM   (U+200F)', () => assert.equal(cleanDisplayText('a\u200Fb'), 'ab'))
})

// ---- Bidi embedding chars (U+202A-U+202E) ----------------------------------

void describe('cleanDisplayText - bidi embedding', () => {
  void it('strips LRE   (U+202A)', () => assert.equal(cleanDisplayText('a\u202Ab'), 'ab'))
  void it('strips RLE   (U+202B)', () => assert.equal(cleanDisplayText('a\u202Bb'), 'ab'))
  void it('strips PDF   (U+202C)', () => assert.equal(cleanDisplayText('a\u202Cb'), 'ab'))
  void it('strips LRO   (U+202D)', () => assert.equal(cleanDisplayText('a\u202Db'), 'ab'))
  void it('strips RLO   (U+202E)', () => assert.equal(cleanDisplayText('a\u202Eb'), 'ab'))
})

// ---- Interlinear / invisible formatters (U+2060-U+2069) -------------------

void describe('cleanDisplayText - invisible formatters', () => {
  void it('strips WJ    (U+2060)', () => assert.equal(cleanDisplayText('a\u2060b'), 'ab'))
  void it('strips U+2061',          () => assert.equal(cleanDisplayText('a\u2061b'), 'ab'))
  void it('strips U+2066',          () => assert.equal(cleanDisplayText('a\u2066b'), 'ab'))
  void it('strips U+2069',          () => assert.equal(cleanDisplayText('a\u2069b'), 'ab'))
})

// ---- BOM / ZWNBSP (U+FEFF) -------------------------------------------------

void describe('cleanDisplayText - BOM', () => {
  void it('strips BOM   (U+FEFF)', () => assert.equal(cleanDisplayText('\uFEFFUSDC'), 'USDC'))
  void it('strips mid-string BOM', () => assert.equal(cleanDisplayText('US\uFEFFDC'), 'USDC'))
})

// ---- The reported attack: RLO spoof ----------------------------------------

void describe('cleanDisplayText - RLO spoof', () => {
  // U+202E (RLO) before "cdsU" makes it render visually as "Usdc"
  void it('strips RLO leaving "cdsU"', () => {
    const spoofed = '\u202EcdsU'
    assert.equal(cleanDisplayText(spoofed), 'cdsU')
  })
})

// ---- Characters that must be preserved -------------------------------------

void describe('cleanDisplayText - preserved characters', () => {
  void it('keeps emoji (unicorn)',      () => assert.equal(cleanDisplayText('Token\uD83E\uDD84'), 'Token\uD83E\uDD84'))
  void it('keeps emoji (rocket)',       () => assert.equal(cleanDisplayText('\uD83D\uDE80USDC'), '\uD83D\uDE80USDC'))
  void it('keeps Turkish c-cedilla',   () => assert.equal(cleanDisplayText('\u00E7ay'), '\u00E7ay'))
  void it('keeps Turkish g-breve',     () => assert.equal(cleanDisplayText('\u011F'), '\u011F'))
  void it('keeps Turkish I-dot',       () => assert.equal(cleanDisplayText('\u0130stanbul Token'), '\u0130stanbul Token'))
  void it('keeps regular ASCII',       () => assert.equal(cleanDisplayText('USDC'), 'USDC'))
  void it('keeps hyphen in name',      () => assert.equal(cleanDisplayText('Wrapped-BTC'), 'Wrapped-BTC'))
})

// ---- Whitespace collapsing -------------------------------------------------

void describe('cleanDisplayText - whitespace', () => {
  void it('trims leading/trailing space', () => assert.equal(cleanDisplayText('  USDC  '), 'USDC'))
  void it('collapses multiple spaces',    () => assert.equal(cleanDisplayText('USD  Coin'), 'USD Coin'))
  void it('TAB+LF between words are deleted (C0 strip)', () => assert.equal(cleanDisplayText('USD\t\nCoin'), 'USDCoin'))
})

// ---- max code-point limit --------------------------------------------------

void describe('cleanDisplayText - max limit', () => {
  void it('keeps string at exactly max', () => {
    const s = 'A'.repeat(10)
    assert.equal(cleanDisplayText(s, 10), s)
  })
  void it('truncates at max', () => {
    const s = 'ABCDEFGHIJ' // 10 chars
    assert.equal(cleanDisplayText(s, 5), 'ABCDE')
  })
  void it('default max = 80', () => {
    const s = 'X'.repeat(100)
    assert.equal(cleanDisplayText(s).length, 80)
  })
})

// ---- Surrogate-pair safety -------------------------------------------------

void describe('cleanDisplayText - surrogate safety', () => {
  // Unicorn emoji (U+1F984) = two UTF-16 code units; must not be split
  void it('does not split a surrogate pair at the truncation boundary', () => {
    // 4 ASCII chars + unicorn emoji (2 UTF-16 units) + more ASCII, max = 5 code points
    const s = 'ABCD\uD83E\uDD84XYZ'
    const result = cleanDisplayText(s, 5)
    // Should be "ABCD" + full emoji (5 code points), not "ABCD" + lone surrogate
    assert.equal(result, 'ABCD\uD83E\uDD84')
    assert.ok(result.codePointAt(4) === 0x1F984)
  })

  void it('counts emoji as 1 code point for max purposes', () => {
    // Three unicorn emojis = 3 code points but 6 UTF-16 code units; max=3 keeps all
    const s = '\uD83E\uDD84\uD83E\uDD84\uD83E\uDD84'
    const result = cleanDisplayText(s, 3)
    assert.equal([...result].length, 3)
  })
})

// ---- Integration: parseCatalog + toTokenRows -------------------------------

void describe('catalog integration - toTokenRows cleans names and symbols', () => {
  const RAW_CATALOG = {
    network: 'arc-testnet',
    generatedAt: '2026-01-01T00:00:00Z',
    coverage: 'full',
    tokens: [
      {
        address: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
        name:   '\u202EcdsU',       // RLO spoof of "Usdc"
        symbol: '\u202EDRCU',       // RLO spoof of "USDC" (reversed)
        decimals: 6,
        totalSupply: '1000000',
      },
      {
        address: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf02',
        name:   'Good\u200BToken',  // ZWSP injection
        symbol: 'GT\uFEFF',         // trailing BOM
        decimals: 18,
        totalSupply: null,
      },
    ],
    nfts: [],
  }

  void it('parses the catalog without errors', () => {
    const cat = parseCatalog(RAW_CATALOG)
    assert.ok(cat !== null)
  })

  void it('strips RLO from token name', () => {
    const cat = parseCatalog(RAW_CATALOG)!
    const rows = toTokenRows(cat)
    assert.equal(rows[0].name, 'cdsU')
  })

  void it('strips RLO from token symbol', () => {
    const cat = parseCatalog(RAW_CATALOG)!
    const rows = toTokenRows(cat)
    assert.equal(rows[0].symbol, 'DRCU')
  })

  void it('strips ZWSP from name and BOM from symbol', () => {
    const cat = parseCatalog(RAW_CATALOG)!
    const rows = toTokenRows(cat)
    assert.equal(rows[1].name,   'GoodToken')
    assert.equal(rows[1].symbol, 'GT')
  })
})
