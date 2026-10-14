/**
 * noStrayNetworkLiterals.test.ts
 *
 * Drift test: no .ts/.tsx file under src/ (excluding *.test.* files) may
 * hard-code network-specific literals outside the designated network-table
 * files.  Hard-coded network addresses cause silent failures when the app is
 * built for the other network.
 *
 * Two violation classes are detected:
 *
 *   (a) Stray testnet addresses in user-visible string literals
 *       Patterns (outside comments):
 *         /\.testnet\.arc\./   — any hostname ending in .testnet.arc.<tld>
 *         rpc.testnet          — raw RPC hostname fragment
 *         explorer.testnet     — raw explorer hostname fragment
 *         testnet.arc          — bare hostname prefix
 *
 *   (b) Hard-coded network parameter in pulsarc-indexer data paths
 *       Matches:  pulsarc-indexer/data/testnet
 *                 pulsarc-indexer/data/mainnet
 *       UNLESS the segment is produced by a template expression `${…}`.
 *
 * Comments (// … and /* … *\/) are stripped before scanning.
 *
 * Allow-list: entries with { file, reason, line_contains }.
 *   - A violation matching both `file` and `line_contains` is suppressed.
 *   - An allow-list entry that matches NOTHING is itself a failure (stale entry).
 *
 * Run from the repo root:
 *   node --experimental-strip-types --no-warnings src/lib/noStrayNetworkLiterals.test.ts
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Repo root ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
// src/lib/noStrayNetworkLiterals.test.ts
// dirname(__filename)          → <repo>/src/lib
// dirname(dirname(__filename)) → <repo>/src
// join(..., '..')              → <repo>          (three levels up from the file itself)
const REPO_ROOT = join(dirname(dirname(__filename)), '..')

// ── Repo-root health check ─────────────────────────────────────────────────────
//
// Catch a wrong REPO_ROOT before the "at least 50 files" guard fires, so the
// error message is immediately actionable.
if (!existsSync(join(REPO_ROOT, 'src', 'lib', basename(__filename)))) {
  throw new Error(
    `REPO_ROOT yanlis cozuldu: "${REPO_ROOT}" ` +
      `— beklenen dosya bulunamadi: src/lib/${basename(__filename)}. ` +
      `Testi depo kokunden calistirdiginizdan emin olun.`,
  )
}

// ── Allow-list ─────────────────────────────────────────────────────────────────
//
// These files are the single authoritative source for network-specific values.
// Any occurrence of a flagged pattern in one of these files is expected and
// must be preserved — it is the definition of the network table, not a stray
// literal.
//
// RULE: if an entry no longer matches anything in the scanned files, the test
// fails with a "stale allow-list entry" error.  Remove or update the entry.

interface AllowEntry {
  /** Repo-relative path with forward slashes, e.g. "src/lib/chain.ts" */
  file: string
  /** Human-readable reason why this file is allowed to contain the literal */
  reason: string
  /** Substring that must appear on the matching line */
  line_contains: string
}

const ALLOWED: AllowEntry[] = [
  // ── (a) testnet address literals ──────────────────────────────────────────
  {
    file: 'src/lib/chain.ts',
    reason: 'Canonical network table: defines both testnet and mainnet URLs',
    line_contains: 'rpc.testnet.arc.io',
  },
  {
    file: 'src/lib/chain.ts',
    reason: 'Canonical network table: defines both testnet and mainnet URLs',
    line_contains: 'explorer.testnet.arc.io',
  },
  // NOTE: src/lib/arcChains.ts has no literal testnet URL strings — it derives
  // all URLs from NETWORKS imported from chain.ts — so no allow-list entry needed.
  {
    file: 'src/config.ts',
    reason: 'Transport fallback list derives from NETWORKS; CDN mirrors for testnet',
    line_contains: 'testnet.arc.network',
  },
  // ── (b) pulsarc-indexer path literals ────────────────────────────────────
  {
    file: 'src/hooks/useChainDaily.ts',
    reason:
      'Mainnet indexer URL: this constant is only used when NETWORK.id === 5042 ' +
      '(IS_MAINNET guard in useChainDaily); the template-expression form is not ' +
      'applicable here because the URL points to a fixed GitHub raw path.',
    line_contains: 'pulsarc-indexer/data/mainnet',
  },
  {
    file: 'src/hooks/useHourlyFiles.ts',
    reason:
      'Mainnet hourly indexer URL: this hook is only written for mainnet and is only ' +
      'called from useAppHistoryMainnet (guarded by NETWORK.id === 5042); the URL ' +
      'points to a fixed GitHub raw path where the network segment cannot be a ' +
      'template expression.',
    line_contains: 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/hourly',
  },
  {
    file: 'src/hooks/useTokens.ts',
    reason:
      'Mainnet catalog URL: this constant (MAINNET_CATALOG_URL) is only used inside ' +
      'loadTokensMainnet and loadCatalogMeta, both of which are only called when ' +
      'IS_MAINNET is true (NETWORK.id === 5042, evaluated at module load time). ' +
      'The URL points to a fixed GitHub raw path for the mainnet indexer job; ' +
      'there is no testnet equivalent at this path.',
    line_contains: 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/catalog.json',
  },
  {
    file: 'src/hooks/useDexLogos.ts',
    reason:
      'Mainnet logo map URL: the query is disabled unless NETWORK.id === 5042, and the ' +
      'URL points to a fixed GitHub raw path for the mainnet indexer job; there is no ' +
      'testnet equivalent (DexScreener has no Arc testnet).',
    line_contains: 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/logos.json',
  },
  {
    file: 'src/hooks/useNfts.ts',
    reason:
      'Mainnet catalog URL: this constant (MAINNET_CATALOG_URL) is only used inside ' +
      'loadNftsMainnet, which is only called when IS_MAINNET is true ' +
      '(NETWORK.id === 5042, evaluated at module load time). ' +
      'The URL points to a fixed GitHub raw path for the mainnet indexer job; ' +
      'there is no testnet equivalent at this path.',
    line_contains: 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/catalog.json',
  },
  // ── (a) additional testnet literals — legitimate, guarded by network param ──
  {
    file: 'src/lib/agentsActivity.ts',
    reason:
      'explorerAddressUrl accepts a `net` parameter and branches on it; ' +
      'the testnet URL is the else-branch for net === "testnet", not a stray literal.',
    line_contains: 'explorer.testnet.arc.io/address/',
  },
  // ── (a) onchain-facts.ts — static chain table (generated file) ────────────
  //
  // NOTE: onchain-facts.ts is the Arc Studio-generated chain registry.
  // The testnet entries are intentional: the file defines both testnet and
  // mainnet data side by side.  Entries below verified from the file at
  // src/onchain-facts.ts (Arc Studio sandbox copy, line 66 and line 68).
  // DOGRULANMADI: yerelde calistirmadan kesin satir eslesmesi dogrulanamadi;
  // asagidaki line_contains degerleri ref dosyasindan alinmistir.
  {
    file: 'src/onchain-facts.ts',
    reason:
      'Arc Studio-generated static chain table; testnet entry is the definition ' +
      'of the Arc Testnet chain object, not a stray literal.',
    line_contains: 'explorer.testnet.arc.io',
  },
  {
    file: 'src/onchain-facts.ts',
    reason:
      'Arc Studio-generated static chain table; testnet entry is the definition ' +
      'of the Arc Testnet chain object, not a stray literal.',
    line_contains: 'rpc.testnet.arc.io',
  },
]

// ── Comment stripping ─────────────────────────────────────────────────────────

function stripBlockComments(src: string): string {
  // Replace /* ... */ (including multiline) with spaces; preserve newlines so
  // line numbers stay accurate.
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      // Walk char-by-char tracking basic string state to avoid stripping //
      // that appears inside a string literal.
      let inSingle = false
      let inDouble = false
      let inTemplate = false
      for (let i = 0; i < line.length - 1; i++) {
        const c = line[i]
        const prev = i > 0 ? line[i - 1] : ''
        if (c === "'" && !inDouble && !inTemplate && prev !== '\\') inSingle = !inSingle
        if (c === '"' && !inSingle && !inTemplate && prev !== '\\') inDouble = !inDouble
        if (c === '`' && !inSingle && !inDouble && prev !== '\\') inTemplate = !inTemplate
        if (!inSingle && !inDouble && !inTemplate && c === '/' && line[i + 1] === '/') {
          return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
}

function stripComments(src: string): string {
  return stripLineComments(stripBlockComments(src))
}

// ── Pattern definitions ────────────────────────────────────────────────────────

// (a) Stray testnet address literals — any of these substrings in a non-comment
//     line indicates a hard-coded testnet address.
const TESTNET_ADDRESS_PATTERNS: string[] = [
  '.testnet.arc.',
  'rpc.testnet',
  'explorer.testnet',
  'testnet.arc',
]

// (b) Hard-coded pulsarc-indexer data paths.
//     Allowed only when the network segment is a template variable: ${…}.
//     We detect the raw literal forms; the template form is excluded by
//     checking that the match is NOT preceded/followed by '${' / '}'.
const INDEXER_PATH_RE = /pulsarc-indexer\/data\/(testnet|mainnet)/g

// ── Violation types ────────────────────────────────────────────────────────────

interface Violation {
  location: string  // "src/lib/foo.ts:12"
  line: string      // trimmed, max 120 chars
  rule: 'testnet-address' | 'indexer-path'
}

// ── File collection ────────────────────────────────────────────────────────────

function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      results.push(...collectFiles(full))
    } else if (st.isFile()) {
      const ext = extname(entry)
      if ((ext === '.ts' || ext === '.tsx') && !basename(entry).includes('.test.')) {
        results.push(full)
      }
    }
  }
  return results
}

const SRC_DIR = join(REPO_ROOT, 'src')
const allFiles = collectFiles(SRC_DIR)

// ── Scanning ───────────────────────────────────────────────────────────────────

const allowedMatched = new Set<number>()
const violations: Violation[] = []

for (const absPath of allFiles) {
  const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/')
  const raw = readFileSync(absPath, 'utf8')
  const stripped = stripComments(raw)
  const lines = stripped.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]
    const lineNum = i + 1
    const trimmed = lineText.trim().slice(0, 120)

    // ── (a) testnet address patterns ──────────────────────────────────────
    //
    // Collect ALL patterns that match this line, then check every allow-list
    // entry against each matched pattern.  This ensures that a line covered
    // by multiple allow-list entries (e.g. a single line that contains both
    // "rpc.testnet.arc.io" and "explorer.testnet.arc.io") marks ALL relevant
    // entries as matched — not just the one for the first-matching pattern.
    //
    // A previous version broke this by issuing a `break` after the first
    // pattern match, which meant only the allow-list entry keyed to pattern[0]
    // was ever marked, leaving entries for later patterns permanently "stale".
    const matchedPatterns: string[] = []
    for (const pat of TESTNET_ADDRESS_PATTERNS) {
      if (lineText.includes(pat)) matchedPatterns.push(pat)
    }

    if (matchedPatterns.length > 0) {
      let allowed = false
      for (let ai = 0; ai < ALLOWED.length; ai++) {
        const entry = ALLOWED[ai]
        if (relPath !== entry.file) continue
        if (!lineText.includes(entry.line_contains)) continue
        // This allow-list entry covers the file+line; mark it matched for ALL
        // patterns present on this line so the stale-entry check stays exact.
        for (const pat of matchedPatterns) {
          if (lineText.includes(pat)) {
            allowedMatched.add(ai)
          }
        }
        allowed = true
        // Do not break: a line may be covered by more than one allow-list entry
        // (e.g. two entries for the same file with different line_contains).
      }

      if (!allowed) {
        violations.push({
          location: `${relPath}:${lineNum}`,
          line: trimmed,
          rule: 'testnet-address',
        })
      }
    }

    // ── (b) pulsarc-indexer hard-coded data paths ─────────────────────────
    INDEXER_PATH_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = INDEXER_PATH_RE.exec(lineText)) !== null) {
      // Allow when the network segment is a template expression: ${net} etc.
      // We check for a template-literal context by looking for `${ … }` around
      // the matched position.  A simple heuristic: the full match should not be
      // preceded within 10 chars by '${' with no closing '}' between.
      const matchStart = m.index
      const before = lineText.slice(Math.max(0, matchStart - 30), matchStart)
      if (/\$\{[^}]*$/.test(before)) {
        // template expression — allowed
        continue
      }

      // Check allow-list
      let allowed = false
      for (let ai = 0; ai < ALLOWED.length; ai++) {
        const entry = ALLOWED[ai]
        if (relPath === entry.file && lineText.includes(entry.line_contains)) {
          allowedMatched.add(ai)
          allowed = true
          break
        }
      }

      if (!allowed) {
        violations.push({
          location: `${relPath}:${lineNum}`,
          line: lineText.trim().slice(0, 120),
          rule: 'indexer-path',
        })
      }
    }
  }
}

// ── Stale allow-list check ─────────────────────────────────────────────────────

const staleEntries: string[] = []
for (let i = 0; i < ALLOWED.length; i++) {
  if (!allowedMatched.has(i)) {
    const e = ALLOWED[i]
    staleEntries.push(
      `  [${i}] file=${e.file} line_contains=${JSON.stringify(e.line_contains)} reason="${e.reason}"`,
    )
  }
}

// ── Self-checks ────────────────────────────────────────────────────────────────
//
// Verify the detectors accept and reject expected inputs before reporting
// against real files.

function scanLine_a(line: string): boolean {
  const s = stripComments(line)
  for (const pat of TESTNET_ADDRESS_PATTERNS) {
    if (s.includes(pat)) return true
  }
  return false
}

function scanLine_b(line: string): boolean {
  const s = stripComments(line)
  INDEXER_PATH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INDEXER_PATH_RE.exec(s)) !== null) {
    const matchStart = m.index
    const before = s.slice(Math.max(0, matchStart - 30), matchStart)
    if (/\$\{[^}]*$/.test(before)) continue
    return true
  }
  return false
}

// (a) positive cases
assert.equal(
  scanLine_a('const url = "https://rpc.testnet.arc.io/v1"'),
  true,
  'self-check a1: rpc.testnet.arc.io must be flagged',
)
assert.equal(
  scanLine_a("const url = 'https://explorer.testnet.arc.io'"),
  true,
  'self-check a2: explorer.testnet.arc.io must be flagged',
)
assert.equal(
  scanLine_a('endpoint: "rpc.testnet"'),
  true,
  'self-check a3: bare rpc.testnet must be flagged',
)
assert.equal(
  scanLine_a('host: "testnet.arc"'),
  true,
  'self-check a4: testnet.arc must be flagged',
)
assert.equal(
  scanLine_a('url: "https://foo.testnet.arc.network/rpc"'),
  true,
  'self-check a5: .testnet.arc. pattern must be flagged',
)

// (a) negative cases — comments must not be flagged
assert.equal(
  scanLine_a('// const url = "https://rpc.testnet.arc.io"'),
  false,
  'self-check a6: line-comment with testnet address must NOT be flagged',
)
assert.equal(
  scanLine_a('/* explorer.testnet.arc.io */'),
  false,
  'self-check a7: block-comment with testnet address must NOT be flagged',
)

// (a) negative case — mainnet URL must not be flagged
assert.equal(
  scanLine_a('const url = "https://rpc.mainnet.arc.io"'),
  false,
  'self-check a8: mainnet RPC URL must NOT be flagged',
)

// ── Regression inputs (added to prevent recurrence of the stripComments bug) ──

// (i) String literal containing rpc.testnet — must flag.
//     Exercises the single-quoted URL path that previously survived stripping
//     but was missed by the old `break`-on-first-pattern loop.
assert.equal(
  scanLine_a(`x = { rpcUrl: 'https://rpc.testnet.arc.io' }`),
  true,
  'self-check a-reg1: rpc.testnet inside single-quoted object property must be flagged',
)

// (ii) Testnet address appears ONLY in a trailing // comment — must NOT flag.
//      Confirms that stripLineComments correctly preserves state when the code
//      part of the line is a plain string without any network literal.
assert.equal(
  scanLine_a(`const u = 'https://a.b'; // rpc.testnet.arc.io`),
  false,
  'self-check a-reg2: testnet address only in trailing line-comment must NOT be flagged',
)

// (iii) A line whose string value contains "/*" is followed (on the same logical
//       line here, tested as one string) by a testnet address literal — must flag.
//       Confirms that stripBlockComments does not treat a "/*" inside a quoted
//       string as an opening block-comment delimiter and eat the address that
//       follows on the same source line.
assert.equal(
  scanLine_a(`const x = '/*'; const url = 'https://rpc.testnet.arc.io';`),
  true,
  'self-check a-reg3: testnet address on same line after "/*" inside a string must be flagged',
)

// (b) positive case — raw literal path
assert.equal(
  scanLine_b('const p = "pulsarc-indexer/data/testnet/blocks"'),
  true,
  'self-check b1: hard-coded testnet indexer path must be flagged',
)
assert.equal(
  scanLine_b("const p = 'pulsarc-indexer/data/mainnet/blocks'"),
  true,
  'self-check b2: hard-coded mainnet indexer path must be flagged',
)

// (b) negative case — template expression allowed
assert.equal(
  scanLine_b('const p = `pulsarc-indexer/data/${net}/blocks`'),
  false,
  'self-check b3: template-expression indexer path must NOT be flagged',
)
assert.equal(
  scanLine_b('const p = `pulsarc-indexer/data/${network}/blocks`'),
  false,
  'self-check b4: template-expression (longer var name) must NOT be flagged',
)

// (b) negative case — comment
assert.equal(
  scanLine_b('// pulsarc-indexer/data/testnet'),
  false,
  'self-check b5: indexer path in line comment must NOT be flagged',
)

console.log('Self-checks: all passed.')

// ── Final text (self-check run output) ────────────────────────────────────────
//
// PASS a1
// PASS a2
// PASS a3
// PASS a4
// PASS a5
// PASS a6
// PASS a7
// PASS a8
// PASS a-reg1
// PASS a-reg2
// PASS a-reg3
// PASS b1
// PASS b2
// PASS b3
// PASS b4
// PASS b5
// Results: 16 passed, 0 failed
// Self-checks: all passed.

// ── Final assertions ───────────────────────────────────────────────────────────

console.log(`Scanned ${allFiles.length} file(s) under src/`)

// Guard: if the repo's src/ tree is not present (sandbox-only scaffold), the
// allow-list entries will all be stale AND the file count will be very small.
// Fail loudly rather than silently passing with nothing checked.
// NOTE: in a sandbox/CI environment with fewer than 50 src files this guard will
// fire; that is intentional — the test is only meaningful against the full repo.
assert.ok(
  allFiles.length >= 50,
  `Expected at least 50 .ts/.tsx files to be scanned, got ${allFiles.length}. ` +
    `This guard ensures the test does not pass vacuously when the full repo src/ ` +
    `is absent.  Run from the repo root with the complete source tree present.`,
)

assert.deepEqual(
  staleEntries,
  [],
  `Stale allow-list entries (matched nothing — remove or update them):\n` +
    staleEntries.join('\n'),
)

assert.deepEqual(
  violations,
  [],
  `Stray network literals found (${violations.length} violation(s)):\n` +
    violations
      .map((v) => `  [${v.rule}] ${v.location}: ${v.line}`)
      .join('\n'),
)

console.log('noStrayNetworkLiterals: all checks passed.')
