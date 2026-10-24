// Run: node --experimental-strip-types src/lib/cctpLive.test.ts
import assert from 'node:assert/strict'
import {
  CCTP_TOPICS,
  CCTP_USDC,
  EMPTY_CCTP_STATS,
  DEPOSIT_FOR_BURN_TOPIC,
  MESSAGE_RECEIVED_TOPIC,
  MESSAGE_TRANSMITTER_V2,
  MINT_AND_WITHDRAW_TOPIC,
  TOKEN_MESSENGER_V2,
  addMoves,
  cctpAddresses,
  decodeCctpLogs,
  topChains,
  type CctpLogLike,
} from './cctpLive.ts'

// ── fixture builders ────────────────────────────────────────────────────────
const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0')
const pad = (addr: string) => `0x${addr.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`
const DEPOSITOR = '0x00000000000000000000000000000000000000d1'
const OTHER_TOKEN = '0x00000000000000000000000000000000000000e2'

const TM = TOKEN_MESSENGER_V2.mainnet
const MT = MESSAGE_TRANSMITTER_V2.mainnet

/** DepositForBurn: data = amount, mintRecipient, destinationDomain, destinationTokenMessenger, destinationCaller, maxFee. */
function burn(tx: string, burnToken: string, rawAmount: bigint, destination: number, address = TM): CctpLogLike {
  return {
    address,
    topics: [DEPOSIT_FOR_BURN_TOPIC, pad(burnToken), pad(DEPOSITOR), `0x${word(1000)}`],
    data: `0x${word(rawAmount)}${word(7)}${word(destination)}${word(8)}${word(0)}${word(0)}`,
    transactionHash: tx,
  }
}
/** MintAndWithdraw: topics = mintRecipient, mintToken; data = amount, feeCollected. */
function mint(tx: string, mintToken: string, rawAmount: bigint, fee = 0n, address = TM): CctpLogLike {
  return {
    address,
    topics: [MINT_AND_WITHDRAW_TOPIC, pad(DEPOSITOR), pad(mintToken)],
    data: `0x${word(rawAmount)}${word(fee)}`,
    transactionHash: tx,
  }
}
/** MessageReceived: data starts with sourceDomain. */
function received(tx: string, sourceDomain: number, address = MT): CctpLogLike {
  return {
    address,
    topics: [MESSAGE_RECEIVED_TOPIC, pad(DEPOSITOR), `0x${word(99)}`],
    data: `0x${word(sourceDomain)}${word(5)}${word(6)}`,
    transactionHash: tx,
  }
}

const T1 = '0x' + '11'.repeat(32)
const T2 = '0x' + '22'.repeat(32)
const T3 = '0x' + '33'.repeat(32)

// ── constants ───────────────────────────────────────────────────────────────
assert.equal(CCTP_USDC, '0x3600000000000000000000000000000000000000')
assert.deepEqual(CCTP_TOPICS, [DEPOSIT_FOR_BURN_TOPIC, MESSAGE_RECEIVED_TOPIC, MINT_AND_WITHDRAW_TOPIC])
assert.equal(DEPOSIT_FOR_BURN_TOPIC, '0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5')
assert.equal(MESSAGE_RECEIVED_TOPIC, '0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c')
assert.equal(MINT_AND_WITHDRAW_TOPIC, '0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63')
assert.deepEqual(cctpAddresses('mainnet'), ['0x28b5a0e9c621a5badaa536219b3a228c8168cf5d', '0x81d40f21f12a8f0e3252bccb954d722d4c464b64'])
assert.deepEqual(cctpAddresses('testnet'), ['0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa', '0xe737e5cebeeba77efe34d4aa090756590b1ce275'])

// ── outbound ────────────────────────────────────────────────────────────────
// Base (domain 6), 5_200_000_000 raw at 6 decimals = 5,200 USDC.
assert.deepEqual(
  decodeCctpLogs([burn(T1, CCTP_USDC, 5_200_000_000n, 6)], 'mainnet'),
  [{ txHash: T1, direction: 'out', domain: 6, usdc: 5200 }],
  'outbound to Base: 5,200 USDC',
)
// Fractions stay exact: 1_234_567 raw = 1.234567 USDC, to Solana (5).
assert.deepEqual(
  decodeCctpLogs([burn(T1, CCTP_USDC, 1_234_567n, 5)], 'mainnet'),
  [{ txHash: T1, direction: 'out', domain: 5, usdc: 1.234567 }],
)
// A burn token that is not USDC keeps the move but not the amount.
assert.deepEqual(
  decodeCctpLogs([burn(T1, OTHER_TOKEN, 5_200_000_000n, 6)], 'mainnet'),
  [{ txHash: T1, direction: 'out', domain: 6, usdc: null }],
  'non-USDC burnToken → usdc null',
)
// Mixed-case USDC topic still counts.
const upper = burn(T1, CCTP_USDC, 800_000_000n, 5)
upper.topics = [upper.topics[0], `0x${'0'.repeat(24)}${CCTP_USDC.slice(2).toUpperCase()}`, ...upper.topics.slice(2)]
assert.deepEqual(decodeCctpLogs([upper], 'mainnet'), [{ txHash: T1, direction: 'out', domain: 5, usdc: 800 }])

// ── inbound ─────────────────────────────────────────────────────────────────
// Mint 1_500_000 raw (1.5 USDC, fee 300) paired with a MessageReceived from Solana (5).
assert.deepEqual(
  decodeCctpLogs([mint(T1, CCTP_USDC, 1_500_000n, 300n), received(T1, 5)], 'mainnet'),
  [{ txHash: T1, direction: 'in', domain: 5, usdc: 1.5 }],
  'inbound pair: Solana, 1.5 USDC',
)
// A mint without a MessageReceived has an unknown source.
assert.deepEqual(
  decodeCctpLogs([mint(T1, CCTP_USDC, 2_000_000n)], 'mainnet'),
  [{ txHash: T1, direction: 'in', domain: -1, usdc: 2 }],
  'mint without MessageReceived → domain −1',
)
// A MessageReceived in a different transaction is not borrowed.
assert.deepEqual(
  decodeCctpLogs([mint(T1, CCTP_USDC, 2_000_000n), received(T2, 6)], 'mainnet'),
  [
    { txHash: T1, direction: 'in', domain: -1, usdc: 2 },
    { txHash: T2, direction: 'in', domain: 6, usdc: null },
  ],
)
// A MessageReceived with no mint is an inbound with no amount.
assert.deepEqual(
  decodeCctpLogs([received(T1, 0)], 'mainnet'),
  [{ txHash: T1, direction: 'in', domain: 0, usdc: null }],
  'MessageReceived without a mint → usdc null',
)
// Two inbound in one transaction pair in order: Base (6) then Ethereum (0).
assert.deepEqual(
  decodeCctpLogs(
    [mint(T1, CCTP_USDC, 2_000_000n), received(T1, 6), mint(T1, CCTP_USDC, 3_500_000n), received(T1, 0)],
    'mainnet',
  ),
  [
    { txHash: T1, direction: 'in', domain: 6, usdc: 2 },
    { txHash: T1, direction: 'in', domain: 0, usdc: 3.5 },
  ],
  'two inbound in one tx, paired in order',
)
// A mint of another token does not count; its MessageReceived is an inbound with no amount.
assert.deepEqual(
  decodeCctpLogs([mint(T1, OTHER_TOKEN, 9_000_000n), received(T1, 7)], 'mainnet'),
  [{ txHash: T1, direction: 'in', domain: 7, usdc: null }],
  'non-USDC mint is ignored',
)

// ── malformed data is skipped ───────────────────────────────────────────────
const shortBurn = burn(T1, CCTP_USDC, 5_000_000n, 6)
shortBurn.data = `0x${word(5_000_000n)}${word(7)}${word(6)}` // only three words
const emptyReceived = received(T2, 6)
emptyReceived.data = '0x'
const shortMint = mint(T3, CCTP_USDC, 5_000_000n)
shortMint.data = `0x${word(5_000_000n)}` // fee word missing
const notHex = received(T3, 6)
notHex.data = '0xzz'
assert.deepEqual(decodeCctpLogs([shortBurn, emptyReceived, shortMint, notHex], 'mainnet'), [], 'malformed short data → skipped')
// A malformed log never hides its well-formed neighbours.
assert.deepEqual(
  decodeCctpLogs([shortBurn, burn(T2, CCTP_USDC, 10_000_000n, 3)], 'mainnet'),
  [{ txHash: T2, direction: 'out', domain: 3, usdc: 10 }],
)
// Logs without a transaction hash or topics are skipped.
assert.deepEqual(decodeCctpLogs([{ ...burn(T1, CCTP_USDC, 1_000_000n, 3), transactionHash: null }], 'mainnet'), [])
assert.deepEqual(decodeCctpLogs([{ ...burn(T1, CCTP_USDC, 1_000_000n, 3), topics: [] }], 'mainnet'), [])
assert.deepEqual(decodeCctpLogs([], 'mainnet'), [])

// ── addresses and networks ──────────────────────────────────────────────────
assert.deepEqual(decodeCctpLogs([burn(T1, CCTP_USDC, 1_000_000n, 3)], 'testnet'), [], 'mainnet contract on testnet is ignored')
assert.deepEqual(
  decodeCctpLogs([burn(T1, CCTP_USDC, 1_000_000n, 3, TOKEN_MESSENGER_V2.testnet)], 'testnet'),
  [{ txHash: T1, direction: 'out', domain: 3, usdc: 1 }],
)
assert.deepEqual(
  decodeCctpLogs([burn(T1, CCTP_USDC, 1_000_000n, 3, TM.toUpperCase().replace('0X', '0x'))], 'mainnet'),
  [{ txHash: T1, direction: 'out', domain: 3, usdc: 1 }],
  'address match is case-insensitive',
)

// ── ordering ────────────────────────────────────────────────────────────────
// Results follow log order, whichever kind comes first.
assert.deepEqual(
  decodeCctpLogs(
    [burn(T1, CCTP_USDC, 1_000_000n, 6), mint(T2, CCTP_USDC, 2_000_000n), received(T2, 5), burn(T3, CCTP_USDC, 3_000_000n, 0)],
    'mainnet',
  ),
  [
    { txHash: T1, direction: 'out', domain: 6, usdc: 1 },
    { txHash: T2, direction: 'in', domain: 5, usdc: 2 },
    { txHash: T3, direction: 'out', domain: 0, usdc: 3 },
  ],
)

// ── running totals ──────────────────────────────────────────────────────────
assert.equal(addMoves(EMPTY_CCTP_STATS, []), EMPTY_CCTP_STATS, 'nothing added, same object')
const s1 = addMoves(EMPTY_CCTP_STATS, [
  { txHash: T1, direction: 'in', domain: 6, usdc: 5200 },
  { txHash: T2, direction: 'out', domain: 5, usdc: 800 },
  { txHash: T3, direction: 'in', domain: 6, usdc: null },
  { txHash: T3, direction: 'in', domain: -1, usdc: 100 },
])
assert.deepEqual(s1, {
  inCount: 3, outCount: 1, inUsdc: 5300, outUsdc: 800,
  ports: {
    6: { inCount: 2, outCount: 0, inUsdc: 5200, outUsdc: 0 },
    5: { inCount: 0, outCount: 1, inUsdc: 0, outUsdc: 800 },
  },
})
assert.deepEqual(EMPTY_CCTP_STATS, { inCount: 0, outCount: 0, inUsdc: 0, outUsdc: 0, ports: {} }, 'input never mutated')
const s2 = addMoves(s1, [{ txHash: T1, direction: 'out', domain: 5, usdc: 300 }, { txHash: T2, direction: 'out', domain: 0, usdc: 900 }])
assert.deepEqual(s2.ports[5], { inCount: 0, outCount: 2, inUsdc: 0, outUsdc: 1100 })
assert.equal(s1.ports[5].outCount, 1, 'earlier snapshot unchanged')
assert.deepEqual(topChains(s2), [{ domain: 6, usdc: 5200 }, { domain: 5, usdc: 1100 }, { domain: 0, usdc: 900 }])
assert.deepEqual(topChains(s2, 2).map(c => c.domain), [6, 5])
assert.deepEqual(topChains(EMPTY_CCTP_STATS), [])
assert.deepEqual(topChains(addMoves(EMPTY_CCTP_STATS, [{ txHash: T1, direction: 'in', domain: 6, usdc: null }])), [], 'no known amount, no row')

console.log('cctpLive.test.ts: all assertions passed')
