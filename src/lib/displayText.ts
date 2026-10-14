/**
 * displayText.ts
 * Defence-layer: strip invisible / direction-changing Unicode characters from
 * on-chain token names and symbols before they reach the DOM.
 *
 * No React, no browser globals — safe to import in Node test runners.
 */

/**
 * Unicode code-point ranges to remove entirely.
 *
 * C0 controls            U+0000-U+001F
 * DEL + C1 controls      U+007F-U+009F
 * Zero-width + BOM group U+200B-U+200F  (ZWSP, ZWNJ, ZWJ, LRM, RLM)
 * Bidi embedding chars   U+202A-U+202E  (LRE, RLE, PDF, LRO, RLO)
 * Interlinear annotation U+2060-U+2069  (WJ, FA/IA invisible formatters)
 * Arabic letter mark     U+061C
 * BOM / ZWNBSP           U+FEFF
 * Soft hyphen            U+00AD
 */
const STRIP_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/gu

/** Collapse runs of whitespace (space, tab, NBSP, etc.) down to a single space. */
const WHITESPACE_RE = /\s+/gu

/**
 * Clean a value received from on-chain data (token name, symbol, NFT collection
 * name, …) before rendering it.
 *
 * Steps:
 *  1. Return '' for any non-string input.
 *  2. Strip all characters in STRIP_RE (C0/C1 controls, bidi formatters, BOM,
 *     zero-width characters, soft hyphen, Arabic letter mark).
 *     TAB/LF/CR are inside the C0 range and are deleted at this step.
 *  3. Collapse consecutive U+0020 SPACE runs to a single space and trim.
 *  4. Truncate to at most `max` Unicode code points (surrogate-pair safe).
 *
 * @param s   Raw value from the indexer / ArcScan / catalog.
 * @param max Maximum number of Unicode code points to keep (default 80).
 */
export function cleanDisplayText(s: unknown, max = 80): string {
  if (typeof s !== 'string') return ''

  const stripped = s.replace(STRIP_RE, '').replace(WHITESPACE_RE, ' ').trim()

  // Truncate by code-point count (not UTF-16 code-unit count) so a surrogate
  // pair is never split: spread into an array of grapheme code points, slice,
  // then join back to a string.
  if (stripped.length <= max) return stripped          // fast path (no surrogates issue for ASCII)

  // Use the string iterator which walks full code points (surrogate pairs stay together).
  const iter = stripped[Symbol.iterator]()
  const points: string[] = []
  for (let i = 0; i < max; i++) {
    const step = iter.next()
    if (step.done) break
    points.push(step.value)
  }
  return points.join('')
}
