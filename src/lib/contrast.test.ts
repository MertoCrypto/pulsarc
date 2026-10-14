/**
 * Pulsarc colour-contrast drift test
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/contrast.test.ts
 *
 * Reads src/index.css at runtime, parses the first :root block,
 * extracts CSS custom properties of the form  --name: #rrggbb;
 * (hex only; rgba / hsl / etc. are ignored), then:
 *
 *  1. Checks every named text token against --bg and --bg-deep.
 *  2. Requires --text ≥ 7:1 on both backgrounds (WCAG AAA).
 *  3. Requires all other text tokens ≥ 4.5:1 on both backgrounds (WCAG AA),
 *     EXCEPT tokens listed in KNOWN_BELOW_AA, which must stay ≥ their floor
 *     AND remain < 4.5 (if they reach 4.5 the entry must be removed).
 *
 * All violations are collected before a single assert.deepEqual(violations, []).
 * A table of every checked token is always printed.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// KNOWN BELOW-AA EXEMPTIONS
// key  : CSS custom-property name (with --)
// value: minimum floor ratio (must still be ≥ floor AND < 4.5)
// ---------------------------------------------------------------------------
const KNOWN_BELOW_AA: Record<string, number> = {};

// ---------------------------------------------------------------------------
// Text tokens to verify (checked against both --bg and --bg-deep)
// ---------------------------------------------------------------------------
const TEXT_TOKENS = ["--text", "--muted", "--faint", "--periwinkle", "--periwinkle-hi"];

// Token that must additionally pass the 7:1 AAA threshold
const AAA_TOKEN = "--text";

// ---------------------------------------------------------------------------
// WCAG 2.x helpers
// ---------------------------------------------------------------------------

/** sRGB channel (0–255) → linearised value */
function linearise(channel8: number): number {
  const c = channel8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Hex colour string (#rrggbb or #rgb) → relative luminance [0, 1] */
function luminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  let r: number, g: number, b: number;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    throw new Error(`luminance: unrecognised hex value "${hex}"`);
  }
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG contrast ratio between two hex colours, rounded to 2 d.p. */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = luminance(hexA);
  const lB = luminance(hexB);
  const L1 = Math.max(lA, lB);
  const L2 = Math.min(lA, lB);
  return Math.round(((L1 + 0.05) / (L2 + 0.05)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Self-check: known reference values
// ---------------------------------------------------------------------------
{
  const blackOnWhite = contrastRatio("#000000", "#ffffff");
  assert.equal(
    blackOnWhite,
    21,
    `Self-check failed: black on white should be 21, got ${blackOnWhite}`,
  );

  // #777777 on white — accepted range: 4.45–4.51 to allow 2 d.p. rounding
  const grayOnWhite = contrastRatio("#777777", "#ffffff");
  assert.ok(
    grayOnWhite >= 4.45 && grayOnWhite <= 4.51,
    `Self-check failed: #777777 on white should be ~4.48, got ${grayOnWhite}`,
  );

  console.log(
    `Self-check passed  black/white=${blackOnWhite}  #777/#fff=${grayOnWhite}`,
  );
}

// ---------------------------------------------------------------------------
// Parse src/index.css — first :root block only
// ---------------------------------------------------------------------------

const CSS_PATH = join(process.cwd(), "src", "index.css");
let cssSource: string;
try {
  cssSource = readFileSync(CSS_PATH, "utf8");
} catch (err) {
  throw new Error(
    `Cannot read ${CSS_PATH} — run from the repo root.\n${(err as Error).message}`,
  );
}

/**
 * Extract the text of the first :root { ... } block from the CSS source.
 * Handles simple single-level braces; enough for a variables file.
 */
function extractRootBlock(css: string): string | null {
  const startIdx = css.search(/:root\s*\{/);
  if (startIdx === -1) return null;
  const braceStart = css.indexOf("{", startIdx);
  let depth = 0;
  let i = braceStart;
  while (i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(braceStart + 1, i);
    }
    i++;
  }
  return null; // unclosed block
}

const rootBlock = extractRootBlock(cssSource);

if (rootBlock === null) {
  console.error(
    [
      "",
      "ERROR: No :root { } block found in src/index.css.",
      "",
      "This test expects a :root block containing CSS custom properties like:",
      "  :root {",
      "    --bg:           #0d0d14;",
      "    --bg-deep:      #08080f;",
      "    --text:         #e8e8f0;",
      "    --muted:        #9090a8;",
      "    --faint:        #505068;",
      "    --periwinkle:   #7b7fff;",
      "    --periwinkle-hi:#a5a8ff;",
      "  }",
      "",
      "Add those tokens to src/index.css and re-run.",
    ].join("\n"),
  );
  process.exit(1);
}

/** Parse `--name: #rrggbb;` lines inside the root block (hex values only) */
function parseTokens(block: string): Map<string, string> {
  const map = new Map<string, string>();
  // Matches: --token-name: #hexvalue; (optional whitespace around)
  const re = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*(?:;|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    // Only keep 3-char and 6-char hex (skip 8-char with alpha)
    const hex = m[2];
    const bareHex = hex.replace(/^#/, "");
    if (bareHex.length === 3 || bareHex.length === 6) {
      map.set(m[1], hex.toLowerCase());
    }
  }
  return map;
}

const tokens = parseTokens(rootBlock);

// ---------------------------------------------------------------------------
// Resolve required tokens
// ---------------------------------------------------------------------------
const BACKGROUND_TOKENS = ["--bg", "--bg-deep"] as const;

for (const req of [...BACKGROUND_TOKENS, ...TEXT_TOKENS]) {
  if (!tokens.has(req)) {
    console.error(
      `ERROR: Required token "${req}" not found in the :root block of src/index.css.\n` +
        `Found tokens: ${[...tokens.keys()].join(", ") || "(none)"}`,
    );
    process.exit(1);
  }
}

const bgHex = tokens.get("--bg")!;
const bgDeepHex = tokens.get("--bg-deep")!;

// ---------------------------------------------------------------------------
// Compute ratios and build result table
// ---------------------------------------------------------------------------
type Row = {
  token: string;
  hex: string;
  ratioBg: number;
  ratioBgDeep: number;
};

const rows: Row[] = TEXT_TOKENS.map((token) => {
  const hex = tokens.get(token)!;
  return {
    token,
    hex,
    ratioBg: contrastRatio(hex, bgHex),
    ratioBgDeep: contrastRatio(hex, bgDeepHex),
  };
});

// ---------------------------------------------------------------------------
// Print table
// ---------------------------------------------------------------------------
const COL = {
  token: 18,
  hex: 10,
  bg: 12,
  bgDeep: 14,
};

const pad = (s: string | number, n: number) => String(s).padEnd(n);

console.log("");
console.log(
  pad("token", COL.token) +
    pad("hex", COL.hex) +
    pad("ratio/--bg", COL.bg) +
    pad("ratio/--bg-deep", COL.bgDeep),
);
console.log("-".repeat(COL.token + COL.hex + COL.bg + COL.bgDeep));

for (const r of rows) {
  console.log(
    pad(r.token, COL.token) +
      pad(r.hex, COL.hex) +
      pad(r.ratioBg.toFixed(2), COL.bg) +
      pad(r.ratioBgDeep.toFixed(2), COL.bgDeep),
  );
}
console.log("");

// ---------------------------------------------------------------------------
// Collect violations
// ---------------------------------------------------------------------------
const violations: string[] = [];

for (const r of rows) {
  const isAAA = r.token === AAA_TOKEN;
  const floor = KNOWN_BELOW_AA[r.token] ?? null;
  const requiredMin = isAAA ? 7 : 4.5;
  const label = isAAA ? "7:1 (AAA)" : "4.5:1 (AA)";

  for (const [bgLabel, ratio] of [
    ["--bg", r.ratioBg],
    ["--bg-deep", r.ratioBgDeep],
  ] as [string, number][]) {
    if (floor !== null) {
      // Known-below-AA token: must be ≥ floor AND < 4.5
      if (ratio >= 4.5) {
        violations.push(
          `remove ${r.token} from KNOWN_BELOW_AA, it now passes (${ratio.toFixed(2)}:1 on ${bgLabel} ≥ 4.5:1)`,
        );
      } else if (ratio < floor) {
        violations.push(
          `${r.token} on ${bgLabel}: ratio ${ratio.toFixed(2)}:1 dropped below floor ${floor}:1 (got worse)`,
        );
      }
      // else: within the known-low range — no violation
    } else {
      // Standard token: must meet requiredMin
      if (ratio < requiredMin) {
        violations.push(
          `${r.token} on ${bgLabel}: ${ratio.toFixed(2)}:1 < ${label}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Single assertion — all violations at once
// ---------------------------------------------------------------------------
assert.deepEqual(
  violations,
  [],
  violations.length > 0
    ? `\nContrast violations:\n${violations.map((v) => "  • " + v).join("\n")}\n`
    : "",
);

console.log("All contrast checks passed.");
