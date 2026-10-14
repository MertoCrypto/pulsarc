/**
 * Contrast ratio tests.
 * Run with: node --experimental-strip-types src/lib/contrast.test.ts
 *
 * Uses node:test and node:assert. Reads src/index.css from the filesystem to
 * keep assertions tied to the live token values — if the CSS changes the tests
 * will catch any regression.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hexToRgb, relativeLuminance, contrastRatio } from './contrast.ts';

// ---------------------------------------------------------------------------
// Resolve paths relative to this file
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// This file lives at src/lib/contrast.test.ts → ../index.css is src/index.css
const cssPath = join(__dirname, '..', 'index.css');

// ---------------------------------------------------------------------------
// CSS parser: extract :root custom properties with plain hex values
// ---------------------------------------------------------------------------
function parseRootTokens(css: string): Record<string, string> {
  // Capture everything inside the first :root { ... } block
  const rootMatch = css.match(/:root\s*\{([^}]*)\}/);
  if (!rootMatch) throw new Error('No :root block found in CSS');
  const block = rootMatch[1];
  const tokens: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (m) tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

const css = readFileSync(cssPath, 'utf8');
const tokens = parseRootTokens(css);

// Surface / background token names that represent solid dark backgrounds
const BG_TOKENS = ['--bg', '--bg-deep', '--surface', '--surface-hi', '--surface-teal'] as const;

// ---------------------------------------------------------------------------
// (a) Known anchor values
// ---------------------------------------------------------------------------
void describe('known contrast values', () => {
  void it('black vs white = 21:1', () => {
    const ratio = contrastRatio('#000000', '#ffffff');
    // Allow ±0.01 for floating-point
    assert.ok(
      Math.abs(ratio - 21) < 0.01,
      `expected ~21, got ${ratio}`,
    );
  });

  void it('same color = 1:1', () => {
    const ratio = contrastRatio('#5d7494', '#5d7494');
    assert.ok(
      Math.abs(ratio - 1) < 0.0001,
      `expected 1, got ${ratio}`,
    );
  });

  void it('hexToRgb parses correctly', () => {
    assert.deepEqual(hexToRgb('#0b182c'), [11, 24, 44]);
    assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
    assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
  });

  void it('relativeLuminance: black=0, white=1', () => {
    assert.strictEqual(relativeLuminance('#000000'), 0);
    assert.ok(Math.abs(relativeLuminance('#ffffff') - 1) < 0.0001);
  });
});

// ---------------------------------------------------------------------------
// (b) --faint vs every background token — read live from index.css
// ---------------------------------------------------------------------------
void describe('--faint WCAG AA compliance (from index.css)', () => {
  const faint = tokens['--faint'];
  assert.ok(faint, '--faint token not found in :root');

  for (const bgToken of BG_TOKENS) {
    const bgHex = tokens[bgToken];
    assert.ok(bgHex, `${bgToken} not found in :root`);

    void it(`--faint (${faint}) on ${bgToken} (${bgHex}) >= 4.5:1`, () => {
      const ratio = contrastRatio(faint, bgHex);
      assert.ok(
        ratio >= 4.5,
        `Expected >= 4.5, got ${ratio.toFixed(4)} (--faint ${faint} on ${bgToken} ${bgHex})`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// (c) Visual hierarchy: --faint contrast < --muted contrast on every bg
// ---------------------------------------------------------------------------
void describe('--faint contrast is lower than --muted on every background', () => {
  const faint = tokens['--faint'];
  const muted = tokens['--muted'];
  assert.ok(faint, '--faint token not found in :root');
  assert.ok(muted, '--muted token not found in :root');

  for (const bgToken of BG_TOKENS) {
    const bgHex = tokens[bgToken];
    assert.ok(bgHex, `${bgToken} not found in :root`);

    void it(`--faint < --muted contrast on ${bgToken}`, () => {
      const faintRatio = contrastRatio(faint, bgHex);
      const mutedRatio = contrastRatio(muted, bgHex);
      assert.ok(
        faintRatio < mutedRatio,
        `Hierarchy broken on ${bgToken}: --faint ${faintRatio.toFixed(4)} >= --muted ${mutedRatio.toFixed(4)}`,
      );
    });
  }
});
