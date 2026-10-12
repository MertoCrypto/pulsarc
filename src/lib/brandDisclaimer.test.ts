/**
 * Brand-disclaimer guard for the Pulsarc site.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/brandDisclaimer.test.ts
 *
 * Collects ALL failures into an array and asserts once at the end.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Collapse every run of whitespace (including newlines) to a single space. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * Walk a directory recursively, returning absolute paths of all files.
 * Skips the given skip list of directory basenames.
 */
function walkFiles(dir: string, skipDirs: string[] = []): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name)) {
        results.push(...walkFiles(path.join(dir, entry.name), skipDirs));
      }
    } else {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Collect failures
// ---------------------------------------------------------------------------

const failures: string[] = [];

// ---------------------------------------------------------------------------
// Test 1 — src/App.tsx footer disclaimer
// ---------------------------------------------------------------------------
try {
  const appText = normalise(read("src/App.tsx"));

  if (!appText.includes("independent project")) {
    failures.push(
      'Test 1a: src/App.tsx does not contain "independent project"'
    );
  }

  const required =
    "not affiliated with, endorsed by or sponsored by Circle";
  if (!appText.includes(required)) {
    failures.push(
      `Test 1b: src/App.tsx does not contain "${required}"`
    );
  }
} catch (err) {
  failures.push(`Test 1: could not read src/App.tsx — ${(err as Error).message}`);
}

// ---------------------------------------------------------------------------
// Test 2 — index.html meta description + title
// ---------------------------------------------------------------------------
try {
  const html = read("index.html");

  // Check meta description contains "independent"
  const metaMatch = html.match(
    /<meta\s[^>]*name=["']description["'][^>]*>/i
  );
  if (!metaMatch) {
    failures.push(
      'Test 2a: index.html has no <meta name="description"> tag'
    );
  } else if (!metaMatch[0].includes("independent")) {
    failures.push(
      'Test 2a: index.html meta description does not contain "independent"'
    );
  }

  // Check <title> contains "Arc Network"
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (!titleMatch) {
    failures.push("Test 2b: index.html has no <title> tag");
  } else if (!titleMatch[1].includes("Arc Network")) {
    failures.push(
      `Test 2b: index.html <title> is "${titleMatch[1]}" — does not contain "Arc Network"`
    );
  }
} catch (err) {
  failures.push(`Test 2: could not read index.html — ${(err as Error).message}`);
}

// ---------------------------------------------------------------------------
// Test 3 — public/llms.txt first 400 characters
// ---------------------------------------------------------------------------
try {
  const llms = read("public/llms.txt");
  const first400 = llms.slice(0, 400);

  if (!first400.includes("independent")) {
    failures.push(
      'Test 3: public/llms.txt first 400 chars do not contain "independent"'
    );
  }
} catch (err) {
  failures.push(
    `Test 3: could not read public/llms.txt — ${(err as Error).message}`
  );
}

// ---------------------------------------------------------------------------
// Test 4 — src/lib/walletExtras.ts share-card disclaimer
// ---------------------------------------------------------------------------
try {
  const walletExtras = read("src/lib/walletExtras.ts");
  const required = "independent project, not affiliated with Circle or Arc";

  if (!walletExtras.includes(required)) {
    failures.push(
      `Test 4: src/lib/walletExtras.ts does not contain "${required}"`
    );
  }
} catch (err) {
  failures.push(
    `Test 4: could not read src/lib/walletExtras.ts — ${(err as Error).message}`
  );
}

// ---------------------------------------------------------------------------
// Test 5 — no forbidden marketing phrases in src/**/*.tsx
//          (skip src/components/brand/)
// ---------------------------------------------------------------------------
const forbiddenPhrases = [
  "Official Circle",
  "official Arc",
  "Circle partner",
];
const forbiddenRe = new RegExp(forbiddenPhrases.join("|"), "i");

const srcDir = path.join(root, "src");
const allSrcFiles = walkFiles(srcDir, ["brand"]).filter((f) =>
  f.endsWith(".tsx")
);

let scannedCount = 0;
for (const filePath of allSrcFiles) {
  const content = fs.readFileSync(filePath, "utf8");
  scannedCount++;
  const match = content.match(forbiddenRe);
  if (match) {
    const rel = path.relative(root, filePath);
    failures.push(
      `Test 5: "${rel}" contains forbidden phrase matching "${match[0]}"`
    );
  }
}

console.log(`Scanned ${scannedCount} .tsx file(s) under src/ (excluding src/components/brand/).`);

// ---------------------------------------------------------------------------
// Final assertion — fail once with all failures listed
// ---------------------------------------------------------------------------
assert.deepEqual(
  failures,
  [],
  `Brand-disclaimer guard found ${failures.length} failure(s):\n` +
    failures.map((f, i) => `  [${i + 1}] ${f}`).join("\n")
);

console.log("All brand-disclaimer checks passed.");
