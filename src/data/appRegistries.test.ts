/**
 * Tests for appRegistries.ts
 * Run: node --experimental-strip-types --no-warnings src/data/appRegistries.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  TESTNET_APPS,
  MAINNET_APPS,
  appsForNetwork,
  type ArcApp,
} from './appRegistries.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load ground-truth JSON ───────────────────────────────────────────────────
interface JsonAnchor { address: string; kind: 'token' | 'contract'; usd?: boolean }
interface JsonApp    { id: string; anchors: JsonAnchor[] }
interface AppsJson   { apps: JsonApp[] }

function loadJson(relativePath: string): AppsJson {
  const abs = resolve(__dirname, relativePath)
  return JSON.parse(readFileSync(abs, 'utf-8')) as AppsJson
}

const mainnetJson  = loadJson('./fixtures/apps.mainnet.json')
const testnetJson  = loadJson('./fixtures/apps.testnet.json')

// ── Helpers ──────────────────────────────────────────────────────────────────
const HEX40 = /^0x[0-9a-fA-F]{40}$/

// ── 1. Mainnet identity set is exactly the 13 from JSON ──────────────────────
{
  const jsonIds    = new Set(mainnetJson.apps.map(a => a.id))
  const mainnetIds = new Set(MAINNET_APPS.map(a => a.id))

  assert.equal(MAINNET_APPS.length, 13,
    `MAINNET_APPS should have 13 entries, got ${MAINNET_APPS.length}`)

  for (const id of jsonIds) {
    assert.ok(mainnetIds.has(id), `MAINNET_APPS is missing id '${id}'`)
  }
  for (const id of mainnetIds) {
    assert.ok(jsonIds.has(id), `MAINNET_APPS has unexpected id '${id}' not in JSON`)
  }
  console.log('PASS: mainnet identity set matches JSON (13 apps)')
}

// ── 2. Every mainnet anchor address is valid 0x+40hex AND matches JSON exactly ─
{
  // Build a map: id → anchor addresses (lower-cased) from JSON
  const jsonMainnetMap = new Map<string, string[]>()
  for (const entry of mainnetJson.apps) {
    jsonMainnetMap.set(entry.id, entry.anchors.map(a => a.address.toLowerCase()))
  }

  for (const app of MAINNET_APPS) {
    for (const anchor of app.anchors) {
      assert.match(anchor.address, HEX40,
        `app '${app.id}': anchor address '${anchor.address}' is not valid 0x+40hex`)

      const expected = jsonMainnetMap.get(app.id) ?? []
      assert.ok(
        expected.includes(anchor.address.toLowerCase()),
        `app '${app.id}': address '${anchor.address}' not found in mainnet JSON`,
      )
    }
    // Verify count matches
    const jsonCount = (jsonMainnetMap.get(app.id) ?? []).length
    assert.equal(app.anchors.length, jsonCount,
      `app '${app.id}': expected ${jsonCount} anchors, got ${app.anchors.length}`)
  }
  console.log('PASS: all mainnet anchor addresses are valid hex and match JSON exactly')
}

// ── 3. Testnet list has 21 entries ───────────────────────────────────────────
{
  assert.equal(TESTNET_APPS.length, 21,
    `TESTNET_APPS should have 21 entries, got ${TESTNET_APPS.length}`)
  console.log('PASS: testnet list has 21 entries')
}

// ── 4. Testnet list contains no mainnet-only ids ─────────────────────────────
{
  const testnetIds  = new Set(testnetJson.apps.map((a: JsonApp) => a.id))
  const mainnetIds  = new Set(mainnetJson.apps.map((a: JsonApp) => a.id))
  // mainnet-only = in mainnet JSON but NOT in testnet JSON
  const mainnetOnly = [...mainnetIds].filter(id => !testnetIds.has(id))

  const testnetAppIds = new Set(TESTNET_APPS.map(a => a.id))
  for (const id of mainnetOnly) {
    assert.ok(!testnetAppIds.has(id),
      `TESTNET_APPS should not contain mainnet-only id '${id}'`)
  }
  console.log(`PASS: testnet list contains none of the ${mainnetOnly.length} mainnet-only ids (${mainnetOnly.join(', ')})`)
}

// ── 5. contractAddress === anchors[0].address for all entries ────────────────
{
  for (const app of [...MAINNET_APPS, ...TESTNET_APPS]) {
    assert.equal(app.contractAddress, app.anchors[0].address,
      `app '${app.id}': contractAddress !== anchors[0].address`)
  }
  console.log('PASS: contractAddress === anchors[0].address for all entries')
}

// ── 6. IDs are unique within each registry ────────────────────────────────────
{
  function checkUnique(apps: ArcApp[], label: string) {
    const seen = new Set<string>()
    for (const a of apps) {
      assert.ok(!seen.has(a.id), `${label}: duplicate id '${a.id}'`)
      seen.add(a.id)
    }
  }
  checkUnique(MAINNET_APPS, 'MAINNET_APPS')
  checkUnique(TESTNET_APPS, 'TESTNET_APPS')
  console.log('PASS: IDs are unique within each registry')
}

// ── 7. appsForNetwork routing ────────────────────────────────────────────────
{
  assert.deepEqual(appsForNetwork(5042), MAINNET_APPS,
    'appsForNetwork(5042) should return MAINNET_APPS')
  assert.deepEqual(appsForNetwork(5042002), TESTNET_APPS,
    'appsForNetwork(5042002) should return TESTNET_APPS')
  assert.deepEqual(appsForNetwork(1), TESTNET_APPS,
    'appsForNetwork(1) (unknown) should fall back to TESTNET_APPS')
  assert.deepEqual(appsForNetwork(0), TESTNET_APPS,
    'appsForNetwork(0) (unknown) should fall back to TESTNET_APPS')
  console.log('PASS: appsForNetwork routes correctly')
}

// ── 8. ASSET_IDS kind check ──────────────────────────────────────────────────
{
  const ASSET_ID_SET = new Set(['usdc', 'eurc', 'usyc', 'cirbtc', 'wusdc', 'arc-dollar'])
  for (const app of [...MAINNET_APPS, ...TESTNET_APPS]) {
    const expectedKind = ASSET_ID_SET.has(app.id) ? 'asset' : 'app'
    assert.equal(app.kind, expectedKind,
      `app '${app.id}': expected kind '${expectedKind}', got '${app.kind}'`)
  }
  console.log('PASS: ASSET ids have kind=asset, others have kind=app')
}

// ── 9. Anchor kind per JSON ──────────────────────────────────────────────────
// Mainnet anchors: kind in registry must match kind in JSON
{
  for (const entry of mainnetJson.apps) {
    const regApp = MAINNET_APPS.find(a => a.id === entry.id)
    assert.ok(regApp, `app '${entry.id}' missing from MAINNET_APPS`)
    for (let i = 0; i < entry.anchors.length; i++) {
      assert.equal(regApp.anchors[i].kind, entry.anchors[i].kind,
        `app '${entry.id}' anchor[${i}]: expected kind '${entry.anchors[i].kind}', got '${regApp.anchors[i].kind}'`)
    }
  }
  console.log('PASS: anchor kinds in MAINNET_APPS match JSON')
}

// ── Testnet registry must equal the original ARC_APPS (golden copy from before the split) ──
{
  const golden = JSON.parse(readFileSync(resolve(__dirname, './fixtures/testnet-apps.golden.json'), 'utf-8')) as Record<string, unknown>[]
  const keys = ['id', 'name', 'category', 'description', 'anchors', 'kind', 'contractAddress', 'verified', 'logoInitials']
  const actual = TESTNET_APPS.map(a => Object.fromEntries(keys.map(k => [k, (a as unknown as Record<string, unknown>)[k]])))
  assert.deepEqual(actual, golden, 'TESTNET_APPS differs from the original registry')
  console.log('PASS: TESTNET_APPS equals the original registry')
}

// ── Literal chain ids ──
assert.equal(appsForNetwork(5042), MAINNET_APPS)
assert.equal(appsForNetwork(5042002), TESTNET_APPS)
assert.equal(appsForNetwork(1), TESTNET_APPS)
assert.notEqual(MAINNET_APPS, TESTNET_APPS)

console.log('\nAll tests passed.')
