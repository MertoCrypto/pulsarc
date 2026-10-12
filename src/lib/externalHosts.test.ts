/**
 * External-host allowlist drift test for the Pulsarc site.
 *
 * Run from repo root:
 *   node --experimental-strip-types src/lib/externalHosts.test.ts
 *
 * Rules:
 *  - Scans every .ts / .tsx under src/ (excluding *.test.* files) + index.html
 *  - Extracts every host from http(s) URLs (lowercased)
 *  - Ignores: localhost, 127.0.0.1, *.example.com, example.com
 *  - Every found host must be in ALLOWED
 *  - Every ALLOWED entry must appear somewhere (except schema.org / www.w3.org
 *    which are always considered used even if only in JSON-LD / index.html)
 *  - At least 20 distinct hosts must be found (guards a broken regex)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Allowlist (copy verbatim per spec)
// ---------------------------------------------------------------------------
const ALLOWED = [
  '11155111.rpc.thirdweb.com',
  '56.rpc.thirdweb.com',
  'amoy.polygonscan.com',
  'api.avax-test.network',
  'api.avax.network',
  'arb1.arbitrum.io',
  'arbiscan.io',
  'basescan.org',
  'blastscan.io',
  'bscscan.com',
  'ethereum.reth.rs',
  'etherscan.io',
  'evm-rpc-testnet.sei-apis.com',
  'explorer.arc.io',
  'explorer.testnet.arc.io',
  'explorer.zksync.io',
  'github.com',
  'gnosisscan.io',
  'ipfs.io',
  'mainnet.base.org',
  'mainnet.era.zksync.io',
  'mainnet.optimism.io',
  'modular-sdk.circle.com',
  'optimistic.etherscan.io',
  'polygon-amoy.drpc.org',
  'polygon.drpc.org',
  'polygonscan.com',
  'portal.arc.io',
  'pulsarc.vercel.app',
  'raw.githubusercontent.com',
  'rpc.blast.io',
  'rpc.blockdaemon.testnet.arc.network',
  'rpc.drpc.testnet.arc.network',
  'rpc.gnosischain.com',
  'rpc.mainnet.arc.io',
  'rpc.testnet.arc.io',
  'schema.org',
  'sepolia-optimistic.etherscan.io',
  'sepolia-rollup.arbitrum.io',
  'sepolia.arbiscan.io',
  'sepolia.base.org',
  'sepolia.basescan.org',
  'sepolia.etherscan.io',
  'sepolia.optimism.io',
  'sepolia.unichain.org',
  'sepolia.uniscan.xyz',
  'snowtrace.io',
  'studio.arc.io',
  'testnet-rpc.monad.xyz',
  'testnet.monadexplorer.com',
  'testnet.seiscan.io',
  'testnet.snowtrace.io',
  'twitter.com',
  'warpcast.com',
  'www.w3.org',
];

// Hosts that are always considered "used" regardless of whether the regex
// finds them (they legitimately appear only in JSON-LD strings or index.html
// metadata where the surrounding context makes them non-trackable).
const ALWAYS_USED = new Set(['schema.org', 'www.w3.org']);

const ALLOWED_SET = new Set(ALLOWED);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect every .ts / .tsx file under a directory. */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (
      entry.isFile() &&
      /\.(tsx?)$/.test(entry.name) &&
      !entry.name.includes('.test.')
    ) {
      results.push(full);
    }
  }
  return results;
}

interface Occurrence {
  host: string;
  file: string;
  line: number;
}

const HOST_RE = /https?:\/\/([a-zA-Z0-9.-]+)/g;

/** Return true for hosts we never care about. */
function isIgnored(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (host === 'example.com' || host.endsWith('.example.com')) return true;
  return false;
}

/** Extract all (host, file, line) occurrences from a file's text. */
function extractOccurrences(filePath: string, text: string): Occurrence[] {
  const occurrences: Occurrence[] = [];
  // Work line-by-line so we can record the 1-based line number.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    HOST_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HOST_RE.exec(lines[i])) !== null) {
      const host = m[1].toLowerCase();
      if (!isIgnored(host)) {
        occurrences.push({ host, file: filePath, line: i + 1 });
      }
    }
  }
  return occurrences;
}

// ---------------------------------------------------------------------------
// Collect files
// ---------------------------------------------------------------------------

const repoRoot = process.cwd();
const srcDir = path.join(repoRoot, 'src');
const indexHtml = path.join(repoRoot, 'index.html');

const sourceFiles = collectSourceFiles(srcDir);
if (fs.existsSync(indexHtml)) {
  sourceFiles.push(indexHtml);
}

// ---------------------------------------------------------------------------
// Extract all occurrences
// ---------------------------------------------------------------------------

const allOccurrences: Occurrence[] = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  allOccurrences.push(...extractOccurrences(file, text));
}

// Distinct hosts found (for the count assertion)
const foundHosts = new Set(allOccurrences.map((o) => o.host));

// ---------------------------------------------------------------------------
// 1. Unknown hosts: found but not in ALLOWED
// ---------------------------------------------------------------------------

const unknownOccurrences = allOccurrences.filter(
  (o) => !ALLOWED_SET.has(o.host),
);

// Deduplicate to one entry per (host, file, line) — already unique by construction,
// but group by host for a readable message.
const unknown = unknownOccurrences.map((o) => ({
  host: o.host,
  file: path.relative(repoRoot, o.file),
  line: o.line,
}));

// ---------------------------------------------------------------------------
// 2. Stale ALLOWED entries: in ALLOWED but never found in source
// ---------------------------------------------------------------------------

const stale = ALLOWED.filter(
  (entry) => !ALWAYS_USED.has(entry) && !foundHosts.has(entry),
);

// ---------------------------------------------------------------------------
// 3. Count distinct hosts found
// ---------------------------------------------------------------------------

const distinctCount = foundHosts.size;
console.log(`Distinct external hosts found: ${distinctCount}`);

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

assert.deepEqual(
  unknown,
  [],
  `A new external host was found that is not in ALLOWED.\n` +
    `Every new external host must be reviewed (privacy, brand, rate limits)\n` +
    `and added to ALLOWED on purpose.\n` +
    `Unknown hosts found:\n` +
    unknown.map((u) => `  ${u.host}  at ${u.file}:${u.line}`).join('\n'),
);

assert.deepEqual(
  stale,
  [],
  `Stale allowlist entries: the following hosts are in ALLOWED but were not\n` +
    `found in any source file. Remove them to keep the list honest:\n` +
    stale.map((h) => `  ${h}`).join('\n'),
);

assert.ok(
  distinctCount >= 20,
  `Expected at least 20 distinct external hosts to be found, but only found ` +
    `${distinctCount}. This may indicate a broken regex or missing source files.`,
);

console.log('All external-host allowlist checks passed.');
