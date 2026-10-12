/**
 * Drift-protection test: CATALOG (dataCatalog.ts) vs public/llms.txt
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/llms.test.ts
 *
 * Collects ALL violations before failing once with the full list, so a single
 * run reveals every piece of drift.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CATALOG, DATA_BASE } from './dataCatalog.ts'

// ── Load llms.txt ──────────────────────────────────────────────────────────

const llmsTxtPath = path.join(process.cwd(), 'public/llms.txt')
const llmsTxt = readFileSync(llmsTxtPath, 'utf8')

// ── Parse the "## Files" section ──────────────────────────────────────────

/**
 * Locate the "## Files" section (everything from that heading to the next
 * "## " heading or end-of-file).
 */
function extractFilesSection(txt: string): string {
  const start = txt.indexOf('\n## Files')
  if (start === -1) throw new Error('llms.txt: "## Files" section not found')
  // Find the next level-2 heading after the section opener.
  const afterHeading = start + 1
  const nextH2 = txt.indexOf('\n## ', afterHeading + 1)
  return nextH2 === -1 ? txt.slice(afterHeading) : txt.slice(afterHeading, nextH2)
}

const filesSection = extractFilesSection(llmsTxt)

/**
 * Extract every "### <name>" heading from the Files section.
 * Returns the name portion (everything up to the first " —" or end-of-line).
 */
function parseH3Names(section: string): string[] {
  const names: string[] = []
  for (const line of section.split('\n')) {
    if (!line.startsWith('### ')) continue
    // Strip the "### " prefix, then take up to the first " —" or " -"
    const rest = line.slice(4).trimEnd()
    const dashIdx = rest.indexOf(' —')
    const hyphenIdx = rest.indexOf(' -')
    let name: string
    if (dashIdx !== -1 && (hyphenIdx === -1 || dashIdx <= hyphenIdx)) {
      name = rest.slice(0, dashIdx).trim()
    } else if (hyphenIdx !== -1) {
      name = rest.slice(0, hyphenIdx).trim()
    } else {
      name = rest.trim()
    }
    names.push(name)
  }
  return names
}

/**
 * For a given heading name (e.g. "fx.json"), return all text that follows
 * its "### " line up to the next "### " or "## " line (its "section body").
 */
function sectionBodyFor(name: string, section: string): string {
  const lines = section.split('\n')
  let inside = false
  const body: string[] = []
  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inside) break           // reached the next ### heading — done
      const rest = line.slice(4)
      const dashIdx = rest.indexOf(' —')
      const hyphenIdx = rest.indexOf(' -')
      let parsedName: string
      if (dashIdx !== -1 && (hyphenIdx === -1 || dashIdx <= hyphenIdx)) {
        parsedName = rest.slice(0, dashIdx).trim()
      } else if (hyphenIdx !== -1) {
        parsedName = rest.slice(0, hyphenIdx).trim()
      } else {
        parsedName = rest.trim()
      }
      if (parsedName === name) inside = true
      continue
    }
    if (line.startsWith('## ') && inside) break  // next level-2 section
    if (inside) body.push(line)
  }
  return body.join('\n')
}

const llmsH3Names = parseH3Names(filesSection)

// ── Collect violations ────────────────────────────────────────────────────

const violations: string[] = []

// ── Assertion 1: every CATALOG entry's `file` appears in llms.txt as a "### " heading ──

for (const entry of CATALOG) {
  const found = llmsH3Names.includes(entry.file)
  if (!found) {
    violations.push(
      `[A1] CATALOG entry "${entry.file}" has no matching "### ${entry.file}" heading in llms.txt. ` +
      `llms.txt has these ### names: [${llmsH3Names.map(n => `"${n}"`).join(', ')}]. ` +
      `Fix: add "### ${entry.file} — ${entry.title}" under "## Files" in public/llms.txt.`
    )
  }
}

// ── Assertion 2: every "### <name>" in llms.txt exists in CATALOG (no stale entries) ──

const catalogFiles = new Set(CATALOG.map(e => e.file))

for (const name of llmsH3Names) {
  if (!catalogFiles.has(name)) {
    violations.push(
      `[A2] llms.txt has "### ${name}" but no CATALOG entry with file === "${name}" exists. ` +
      `Fix: remove the "### ${name}" section from public/llms.txt, ` +
      `or add a matching entry to CATALOG in src/lib/dataCatalog.ts.`
    )
  }
}

// ── Assertion 3: single-net entries are described as limited to that network ──

for (const entry of CATALOG) {
  if (entry.nets.length !== 1) continue   // both-network entries are unrestricted
  const singleNet = entry.nets[0]          // 'mainnet' | 'testnet'

  // Only check if A1 already confirmed the heading exists (avoid double-noise).
  if (!llmsH3Names.includes(entry.file)) continue

  const body = sectionBodyFor(entry.file, filesSection)
  // The heading line itself also counts — grab the full heading text.
  const headingLine = filesSection
    .split('\n')
    .find(l => {
      if (!l.startsWith('### ')) return false
      const rest = l.slice(4)
      const dashIdx = rest.indexOf(' —')
      const hyphenIdx = rest.indexOf(' -')
      let parsed: string
      if (dashIdx !== -1 && (hyphenIdx === -1 || dashIdx <= hyphenIdx)) {
        parsed = rest.slice(0, dashIdx).trim()
      } else if (hyphenIdx !== -1) {
        parsed = rest.slice(0, hyphenIdx).trim()
      } else {
        parsed = rest.trim()
      }
      return parsed === entry.file
    }) ?? ''

  const fullText = headingLine + '\n' + body
  const containsNetwork = fullText.toLowerCase().includes(singleNet)

  if (!containsNetwork) {
    violations.push(
      `[A3] CATALOG entry "${entry.file}" is ${singleNet}-only (nets: ["${singleNet}"]) ` +
      `but its section in llms.txt does not contain the word "${singleNet}" (case-insensitive). ` +
      `Fix: add a ${singleNet}-limitation note to the "### ${entry.file}" section in public/llms.txt.`
    )
  }
}

// ── Assertion 4: required global strings are present ──────────────────────

if (!llmsTxt.includes('NOT affiliated')) {
  violations.push(
    `[A4] llms.txt is missing the independence disclaimer string "NOT affiliated". ` +
    `Fix: restore it in public/llms.txt (e.g. "Pulsarc is NOT affiliated with Circle...").`
  )
}

if (!llmsTxt.includes(DATA_BASE)) {
  violations.push(
    `[A4] llms.txt is missing DATA_BASE string "${DATA_BASE}". ` +
    `Fix: ensure the base URL appears verbatim in public/llms.txt.`
  )
}

// ── Assertion 5: no file listed twice ────────────────────────────────────

const seen = new Map<string, number>()
for (const name of llmsH3Names) {
  seen.set(name, (seen.get(name) ?? 0) + 1)
}
for (const [name, count] of seen) {
  if (count > 1) {
    violations.push(
      `[A5] "${name}" appears ${count} times as a "### " heading in the ## Files section of llms.txt. ` +
      `Fix: remove the duplicate entry from public/llms.txt.`
    )
  }
}

// ── Final assertion ───────────────────────────────────────────────────────

assert.deepEqual(
  violations,
  [],
  `llms.txt / dataCatalog.ts drift detected — ${violations.length} violation(s):\n\n` +
  violations.map((v, i) => `  ${i + 1}. ${v}`).join('\n\n')
)

console.log(
  `✓ llms.txt drift check passed — ` +
  `${CATALOG.length} CATALOG entries, ` +
  `${llmsH3Names.length} ### headings in llms.txt, ` +
  `all assertions clean.`
)
