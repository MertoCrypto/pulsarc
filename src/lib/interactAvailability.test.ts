/**
 * Unit tests for interactAvailability.ts
 * Run with: node --experimental-strip-types --no-warnings src/lib/interactAvailability.test.ts
 */
import assert from 'node:assert/strict'
import {
  interactAvailable,
  TESTNET_CHAIN_ID,
  MAINNET_CHAIN_ID,
} from './interactAvailability.ts'

const VALID_ADDR = '0xac8bba07b3ee5df345aab5c4274837179c7d32b9'
const FULL_OVERRIDES: Record<string, string> = {
  VITE_ARC_VOTING_ADDRESS: VALID_ADDR,
  VITE_ARC_ATTESTATION_ADDRESS: VALID_ADDR,
  VITE_ARC_BOOST_ADDRESS: VALID_ADDR,
  VITE_ARC_WATCHLIST_NFT_ADDRESS: VALID_ADDR,
}

// ── Testnet always available ──────────────────────────────────────────────────
{
  const r = interactAvailable(TESTNET_CHAIN_ID, {})
  assert.equal(r.available, true, 'testnet: empty overrides → available')
}
{
  const r = interactAvailable(TESTNET_CHAIN_ID, FULL_OVERRIDES)
  assert.equal(r.available, true, 'testnet: full overrides → still available')
}

// ── Mainnet: all valid addresses present ──────────────────────────────────────
{
  const r = interactAvailable(MAINNET_CHAIN_ID, FULL_OVERRIDES)
  assert.equal(r.available, true, 'mainnet: all valid → available')
  assert.equal(r.reason, undefined, 'mainnet: all valid → no reason')
}

// ── Mainnet: one key missing ───────────────────────────────────────────────────
{
  const partial = { ...FULL_OVERRIDES }
  delete partial['VITE_ARC_BOOST_ADDRESS']
  const r = interactAvailable(MAINNET_CHAIN_ID, partial)
  assert.equal(r.available, false, 'mainnet: missing key → unavailable')
  assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'mainnet: missing key → reason set')
}

// ── Mainnet: one key empty string ─────────────────────────────────────────────
{
  const bad = { ...FULL_OVERRIDES, VITE_ARC_VOTING_ADDRESS: '' }
  const r = interactAvailable(MAINNET_CHAIN_ID, bad)
  assert.equal(r.available, false, 'mainnet: empty string → unavailable')
}

// ── Mainnet: one key whitespace-only ─────────────────────────────────────────
{
  const bad = { ...FULL_OVERRIDES, VITE_ARC_ATTESTATION_ADDRESS: '   ' }
  const r = interactAvailable(MAINNET_CHAIN_ID, bad)
  assert.equal(r.available, false, 'mainnet: whitespace-only → unavailable')
}

// ── Mainnet: one key is an invalid/truncated hex ──────────────────────────────
{
  const bad = { ...FULL_OVERRIDES, VITE_ARC_WATCHLIST_NFT_ADDRESS: '0xdeadbeef' }
  const r = interactAvailable(MAINNET_CHAIN_ID, bad)
  assert.equal(r.available, false, 'mainnet: truncated address → unavailable')
}

// ── Mainnet: one key is a non-hex string ─────────────────────────────────────
{
  const bad = { ...FULL_OVERRIDES, VITE_ARC_VOTING_ADDRESS: 'not-an-address' }
  const r = interactAvailable(MAINNET_CHAIN_ID, bad)
  assert.equal(r.available, false, 'mainnet: non-hex address → unavailable')
}

// ── Mainnet: all overrides empty ──────────────────────────────────────────────
{
  const r = interactAvailable(MAINNET_CHAIN_ID, {})
  assert.equal(r.available, false, 'mainnet: empty overrides → unavailable')
  assert.ok(r.reason?.includes('Arc Mainnet'), 'mainnet: empty overrides → reason mentions Arc Mainnet')
}

// ── Unknown network id ────────────────────────────────────────────────────────
{
  const r = interactAvailable(1, FULL_OVERRIDES)
  assert.equal(r.available, false, 'unknown id (1) → unavailable')
}
{
  const r = interactAvailable(0, {})
  assert.equal(r.available, false, 'unknown id (0) → unavailable')
}
{
  const r = interactAvailable(999999, {})
  assert.equal(r.available, false, 'unknown id (999999) → unavailable')
}

// ── Boundary: address with wrong prefix ───────────────────────────────────────
{
  // 40 hex chars but no 0x prefix
  const bad = { ...FULL_OVERRIDES, VITE_ARC_VOTING_ADDRESS: 'ac8bba07b3ee5df345aab5c4274837179c7d32b9' }
  const r = interactAvailable(MAINNET_CHAIN_ID, bad)
  assert.equal(r.available, false, 'mainnet: missing 0x prefix → unavailable')
}

// ── Boundary: undefined value in overrides ───────────────────────────────────
{
  const mixed: Record<string, string | undefined> = { ...FULL_OVERRIDES, VITE_ARC_ATTESTATION_ADDRESS: undefined }
  const r = interactAvailable(MAINNET_CHAIN_ID, mixed)
  assert.equal(r.available, false, 'mainnet: explicit undefined → unavailable')
}

// ── Literal ids, so renaming the constants cannot hide a regression ──────────
assert.equal(TESTNET_CHAIN_ID, 5042002)
assert.equal(MAINNET_CHAIN_ID, 5042)
assert.equal(interactAvailable(5042002, {}).available, true)
assert.equal(interactAvailable(5042, {}).available, false)
assert.equal(interactAvailable(5042, FULL_OVERRIDES).available, true)

// ── Unsupported network carries its own reason ───────────────────────────────
{
  const r = interactAvailable(1, FULL_OVERRIDES)
  assert.equal(r.available, false)
  assert.equal(r.reason, 'Unsupported network.')
}

// ── Address shape: anchored start, uppercase hex ok, padded value rejected ───
{
  const up = { ...FULL_OVERRIDES, VITE_ARC_VOTING_ADDRESS: '0xAC8BBA07B3EE5DF345AAB5C4274837179C7D32B9' }
  assert.equal(interactAvailable(5042, up).available, true, 'uppercase hex is a valid address')
  const lead = { ...FULL_OVERRIDES, VITE_ARC_VOTING_ADDRESS: 'x' + VALID_ADDR }
  assert.equal(interactAvailable(5042, lead).available, false, 'junk before 0x → unavailable')
  const pad = { ...FULL_OVERRIDES, VITE_ARC_VOTING_ADDRESS: ' ' + VALID_ADDR + ' ' }
  assert.equal(interactAvailable(5042, pad).available, false, 'padded address → unavailable (raw env is used elsewhere)')
}

console.log('All interactAvailability tests passed.')
