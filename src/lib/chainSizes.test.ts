// Run: node --experimental-strip-types src/lib/chainSizes.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  LLAMA_BY_DOMAIN,
  parseChainAssets,
  parseChainDex,
  chainWeight,
  bodyRadius,
  buildChainSizes,
  type WeightContext,
} from './chainSizes.ts'
import { PORT_DOMAINS } from './chainPorts.ts'

// ── Load real fixtures ────────────────────────────────────────────────────────

const fixtureDir = resolve(import.meta.dirname ?? '.', 'fixtures/llama')

const chainsJson: unknown = JSON.parse(
  readFileSync(resolve(fixtureDir, 'chains.json'), 'utf8'),
)
const metaJson: unknown = JSON.parse(
  readFileSync(resolve(fixtureDir, 'appMetadata-chains.json'), 'utf8'),
)

const assetsMap = parseChainAssets(chainsJson)
const dexMap = parseChainDex(metaJson)

// ── parseChainAssets ──────────────────────────────────────────────────────────
assert.ok(assetsMap.size > 0, 'chains parsed')
assert.ok((assetsMap.get('Ethereum') ?? 0) > 1e9, 'Ethereum has a large asset figure')
assert.equal(assetsMap.get('Noble'), undefined, 'Noble is not in chains.json')
assert.equal(assetsMap.get('EDGE'), undefined, 'EDGE is not in chains.json')

// ── parseChainDex ─────────────────────────────────────────────────────────────
assert.ok(dexMap.size > 0, 'appMetadata parsed')
const ethDex = dexMap.get('ethereum')
assert.ok(typeof ethDex === 'number' && (ethDex ?? 0) > 1e8, 'Ethereum dex 24h is large')
// Noble has empty dimAgg → null
assert.equal(dexMap.get('noble'), null, 'Noble dex → null')
// Pharos and Codex have empty dimAgg → null
assert.equal(dexMap.get('pharos'), null, 'Pharos dex → null')
assert.equal(dexMap.get('codex'), null, 'Codex dex → null')

// ── chainWeight ───────────────────────────────────────────────────────────────
const ctx: WeightContext = { assets: [1e9, 1e11, 1e7], dex: [1e9, 5e8, 1e6] }

// Max assets AND max dex → weight close to 1
const maxAssets = Math.max(...ctx.assets)
const maxDex = Math.max(...ctx.dex)
const wMax = chainWeight(maxAssets, maxDex, ctx)
assert.ok(wMax > 0.9, `weight at max should be near 1, got ${wMax}`)

// null/0 → weight 0
const wNull = chainWeight(null, null, ctx)
assert.equal(wNull, 0, 'null assets and dex → weight 0')

// Partial: only assets
const wAssets = chainWeight(maxAssets, null, ctx)
assert.ok(wAssets > 0 && wAssets <= 0.6 + 1e-9, `assets only weight ${wAssets}`)

// ── bodyRadius ────────────────────────────────────────────────────────────────
assert.ok(bodyRadius(0, false) >= 14, 'desktop min radius')
assert.ok(bodyRadius(1, false) <= 46, 'desktop max radius')
assert.ok(bodyRadius(0, true) >= 10, 'mobile min radius')
assert.ok(bodyRadius(1, true) <= 30 + 1e-9, 'mobile max radius')
assert.equal(bodyRadius(0, false), 14, 'weight 0 desktop = 14')
assert.equal(bodyRadius(1, false), 46, 'weight 1 desktop = 46')
assert.equal(bodyRadius(0, true), 10, 'weight 0 mobile = 10')
assert.equal(bodyRadius(1, true), 30, 'weight 1 mobile = 30')

// ── buildChainSizes with real fixtures ───────────────────────────────────────
const sizes = buildChainSizes(assetsMap, dexMap)

// Every PORT_DOMAIN has an entry
assert.equal(sizes.length, PORT_DOMAINS.length, 'one entry per port domain')
for (const d of PORT_DOMAINS) {
  assert.ok(sizes.some(s => s.domain === d), `domain ${d} has a size entry`)
}

// Ethereum has the largest weight
const ethSize = sizes.find(s => s.domain === 0)! // domain 0 = Ethereum
const allWeights = sizes.map(s => s.weight)
assert.ok(ethSize.weight === Math.max(...allWeights), `Ethereum (domain 0) has max weight, got ${ethSize.weight}`)

// Solana > Linea by weight
const solSize = sizes.find(s => s.domain === 5)! // Solana
const lineaSize = sizes.find(s => s.domain === 11)! // Linea
assert.ok(solSize.weight > lineaSize.weight, `Solana weight ${solSize.weight} > Linea weight ${lineaSize.weight}`)

// Noble (domain 4): assets null (not in chains.json)
const nobleSize = sizes.find(s => s.domain === 4)!
assert.equal(nobleSize.assets, null, 'Noble assets null')

// EDGE (domain 28): both null → weight 0 → radius 14
const edgeSize = sizes.find(s => s.domain === 28)!
assert.equal(edgeSize.assets, null, 'EDGE assets null')
assert.equal(edgeSize.dex24h, null, 'EDGE dex null')
assert.equal(edgeSize.weight, 0, 'EDGE weight 0')
assert.equal(edgeSize.radius, 14, 'EDGE radius 14 (min)')

// Radius bounds
for (const s of sizes) {
  assert.ok(s.radius >= 14 && s.radius <= 46, `radius in [14,46] for domain ${s.domain}: ${s.radius}`)
  assert.ok(s.radiusMobile >= 10 && s.radiusMobile <= 30, `mobile radius in [10,30] for domain ${s.domain}: ${s.radiusMobile}`)
}

// Every non-Arc CCTP domain in CCTP_DOMAINS has an entry in LLAMA_BY_DOMAIN
for (const d of PORT_DOMAINS) {
  assert.ok(d in LLAMA_BY_DOMAIN, `LLAMA_BY_DOMAIN has entry for domain ${d}`)
}

console.log('chainSizes.test.ts: all assertions passed')
