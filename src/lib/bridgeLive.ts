/**
 * Pure decoders for ALL verified Arc bridge moves (CCTP, Circle Gateway, Across, Hyperlane warp,
 * LI.FI outbound, deBridge DLN). No network calls, no '@/' imports — plain node-compatible.
 *
 * Addresses and event signatures verified on Arc mainnet 2026-10-24
 * (context/src/reference/KOPRU-DOGRULAMA.md).
 */
import { decodeCctpLogs, type CctpNet, type CctpLogLike } from './cctpLive.ts'

// ── Types ─────────────────────────────────────────────────────────────────────

export type BridgeId = 'cctp' | 'gateway' | 'across' | 'hyperlane' | 'lifi' | 'debridge'

export interface BridgeMove {
  txHash: string
  bridge: BridgeId
  direction: 'in' | 'out'
  /** EVM chain id of the counterpart, or a synthetic negative id for non-EVM chains, or null. */
  chainId: number | null
  /** USDC amount (decimal), or null when the token is unknown or non-USDC. */
  usdc: number | null
  /** Inner bridge name (LI.FI) or 'LI.FI' when a lifi comet was absorbed by another bridge. */
  via?: string
}

/** Synthetic negative ids for non-EVM counterpart chains. */
export const NON_EVM: Readonly<Record<string, number>> = {
  solana: -5,
  stellar: -27,
  starknet: -25,
  sui: -8,
  aptos: -9,
  noble: -4,
  injective: -29,
}

/**
 * CCTP/Gateway domain → EVM chain id.
 * Sources: Circle developer docs + chainid.network.
 * Differences vs chainid.network noted in comments.
 * Non-EVM domains map to the NON_EVM synthetic ids above.
 */
export const DOMAIN_TO_CHAIN: Readonly<Record<number, number>> = {
  0:  1,      // Ethereum
  1:  43114,  // Avalanche
  2:  10,     // OP Mainnet
  3:  42161,  // Arbitrum One
  4:  NON_EVM.noble,    // Noble (Cosmos chain, no EVM id)
  5:  NON_EVM.solana,   // Solana
  6:  8453,   // Base
  7:  137,    // Polygon PoS
  8:  NON_EVM.sui,      // Sui
  9:  NON_EVM.aptos,    // Aptos
  10: 130,    // Unichain
  11: 59144,  // Linea
  // 12 = Codex: chainid.network shows no match → null below
  13: 146,    // Sonic
  14: 480,    // World Chain
  15: 143,    // Monad Testnet (chainid.network id for Monad is 143 on testnet; mainnet TBD → use as-is)
  16: 1329,   // Sei
  17: 56,     // BNB Smart Chain
  18: 50,     // XDC Network
  19: 999,    // HyperEVM (chainid.network shows 999 as "Wanchain Testnet" but Arc docs/report confirms 999 for HyperEVM)
  21: 57073,  // Ink
  22: 98866,  // Plume  (98866 per chainid.network)
  25: NON_EVM.starknet, // Starknet (no EVM chain id)
  26: 5042,   // Arc itself (excluded in gateway adapter)
  27: NON_EVM.stellar,  // Stellar
  28: null as unknown as number, // EDGE: not found on chainid.network → handled as null below
  29: NON_EVM.injective, // Injective
  30: null as unknown as number, // Morph: not found on chainid.network → null
  31: null as unknown as number, // Pharos: not found on chainid.network → null
  32: 25,     // Cronos
  33: 9745,   // Plasma
  37: 196,    // X Layer
}

/** Resolve a CCTP/Gateway domain to an EVM-compatible chain id; null for unknown/non-resolvable. */
function domainToChain(domain: number): number | null {
  if (!(domain in DOMAIN_TO_CHAIN)) return null
  const v = DOMAIN_TO_CHAIN[domain]
  return typeof v === 'number' ? v : null
}

// ── USDC addresses ────────────────────────────────────────────────────────────

/** USDC ERC-20 on Arc (6 decimals). */
export const ARC_USDC = '0x3600000000000000000000000000000000000000'

// ── Contract addresses (mainnet only) ────────────────────────────────────────

// Circle Gateway
const GATEWAY_WALLET  = '0x77777777dcc4d5a8b6e418fd04d8997ef11000ee'
const GATEWAY_MINTER  = '0x2222222d7164433c4c09b0b0d809a9b52c04c205'

// Across Protocol
const ACROSS_SPOKE    = '0x9b4a302a548c7e313c2b74c461db7b84d3074a84'

// LI.FI
const LIFI_DIAMOND    = '0xa4072583658fae592a3506a42431cb6316a8d40b'

// deBridge DLN
const DEBRIDGE_SRC    = '0xef4fb24ad0916217251f553c0596f8edc630eb66'
const DEBRIDGE_DST    = '0xe7351fd770a37282b91d153ee690b63579d6dd7f'

// Hyperlane warp routers (EvmHypCollateral/CrossCollateral USDC)
const HYPERLANE_ROUTERS: readonly string[] = [
  '0x56a255a080584de4433d0fe6587f4c0105715589',
  '0x879f13a642642e938151d79ec12e808b16e02e28',
  '0x2382899f9cad4344cc2b9dd054a2a07feee4b8d0',
  '0x16bf93e259ee7f7074453a2948379c35c6851b71',
  '0x6c07f25b23b5cab557e7df13f25d634f1491f146',
  '0x91c3ffe1e85a21b94ac45a50dd4ccc666f572f05',
]

// ── Combined address/topic lists for one eth_getLogs call ────────────────────

/** All contract addresses (lower-case) to include in one eth_getLogs call. */
export const BRIDGE_ADDRESSES: string[] = [
  // CCTP
  '0x28b5a0e9c621a5badaa536219b3a228c8168cf5d', // TokenMessengerV2 mainnet
  '0x81d40f21f12a8f0e3252bccb954d722d4c464b64', // MessageTransmitterV2 mainnet
  // Gateway
  GATEWAY_WALLET,
  GATEWAY_MINTER,
  // Across
  ACROSS_SPOKE,
  // Hyperlane
  ...HYPERLANE_ROUTERS,
  // LI.FI
  LIFI_DIAMOND,
  // deBridge
  DEBRIDGE_SRC,
  DEBRIDGE_DST,
]

// Topic0 constants
const DEPOSIT_FOR_BURN   = '0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5'
const MESSAGE_RECEIVED   = '0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c'
const MINT_AND_WITHDRAW  = '0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63'
const GATEWAY_BURNED     = '0x12ee2719e7e2dec9f2a0041286b66669153dff0d36719f692b8bbaa4dfe0aa87'
const ATTESTATION_USED   = '0xbb312ce0cc311b2cb0746e09ccd2f91fdb9e2ac755d2f11c65300eb0d0fffd63'
const FUNDS_DEPOSITED    = '0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3'
const FILLED_RELAY       = '0x44b559f101f8fbcc8a0ea43fa91a05a729a5ea6e14a7c75aa750374690137208'
const HL_SENT_REMOTE     = '0xd229aacb94204188fe8042965fa6b269c62dc5818b21238779ab64bdd17efeec'
const HL_RECEIVED_REMOTE = '0xba20947a325f450d232530e5f5fce293e7963499d5309a07cee84a269f2f15a6'
const LIFI_STARTED       = '0xcba69f43792f9f399347222505213b55af8e0b0b54b893085c2e27ecbe1644f1'
const DEBRIDGE_CREATED   = '0xfc8703fd57380f9dd234a89dce51333782d49c5902f307b02f03e014d18fe471'
const DEBRIDGE_FULFILLED = '0xc164aca37b9805a1c9027b6f32260a069723a82926f6e9ece4926e4dd3ea8ecf'

/** All topic0 values (unique, lower-case) for one eth_getLogs call. */
export const BRIDGE_TOPICS: string[] = [
  ...new Set([
    DEPOSIT_FOR_BURN,
    MESSAGE_RECEIVED,
    MINT_AND_WITHDRAW,
    GATEWAY_BURNED,
    ATTESTATION_USED,
    FUNDS_DEPOSITED,
    FILLED_RELAY,
    HL_SENT_REMOTE,
    HL_RECEIVED_REMOTE,
    LIFI_STARTED,
    DEBRIDGE_CREATED,
    DEBRIDGE_FULFILLED,
  ]),
]

// ── Shared helpers ────────────────────────────────────────────────────────────

const WORD = 64
const USDC6 = 1_000_000n
const USDC18 = 1_000_000_000_000_000_000n

export interface BridgeLogLike {
  address: string
  topics: readonly string[]
  data: string
  transactionHash: string | null | undefined
}

function readWords(data: string, count: number): bigint[] | null {
  const raw = data.startsWith('0x') || data.startsWith('0X') ? data.slice(2) : data
  if (raw.length < count * WORD || !/^[0-9a-fA-F]*$/.test(raw)) return null
  const words: bigint[] = []
  for (let i = 0; i < count; i++) words.push(BigInt(`0x${raw.slice(i * WORD, (i + 1) * WORD)}`))
  return words
}

function toUsdc6(raw: bigint): number {
  return Number(raw / USDC6) + Number(raw % USDC6) / Number(USDC6)
}

function toUsdc18(raw: bigint): number {
  return Number(raw / USDC18) + Number(raw % USDC18) / Number(USDC18)
}

/** Last 40 hex chars of a padded 32-byte topic (an address). Lower-case. */
function topicToAddr(t: string | undefined): string | null {
  if (!t || !/^0x[0-9a-fA-F]{64}$/.test(t)) return null
  return `0x${t.slice(-40).toLowerCase()}`
}

/** True when a bytes32 address-like word equals the ARC_USDC address. */
function isArcUsdc(word: bigint): boolean {
  // ARC_USDC = 0x3600000000000000000000000000000000000000
  // left-padded to bytes32: 0000000000000000000000003600000000000000000000000000000000000000
  return (word & 0xffffffffffffffffffffffffffffffffffffffffn) ===
    0x3600000000000000000000000000000000000000n
}



// ── Gateway adapter ───────────────────────────────────────────────────────────

function decodeGatewayLogs(logs: readonly BridgeLogLike[]): BridgeMove[] {
  const moves: BridgeMove[] = []
  for (const log of logs) {
    if (!log.transactionHash || log.topics.length === 0) continue
    const addr = log.address.toLowerCase()
    const t0 = log.topics[0].toLowerCase()

    if (addr === GATEWAY_WALLET && t0 === GATEWAY_BURNED) {
      // data words: [0]=destinationDomain, [1]=recipient, [2]=signer, [3]=value, [4]=fee, [5]=total, [6]=0
      const w = readWords(log.data, 7)
      if (!w) continue
      const domain = Number(w[0])
      if (domain === 26) continue // Arc→Arc: exclude
      const chain = domainToChain(domain)
      const usdc = toUsdc6(w[3]) // value field (word3); fee is word4
      moves.push({ txHash: log.transactionHash, bridge: 'gateway', direction: 'out', chainId: chain, usdc })

    } else if (addr === GATEWAY_MINTER && t0 === ATTESTATION_USED) {
      // data words: [0]=sourceDomain (inferred — proven for domain 5 and 26), [1]=sourceDepositor, [2]=sourceSigner, [3]=value
      const w = readWords(log.data, 4)
      if (!w) continue
      const domain = Number(w[0])
      if (domain === 26) continue // Arc→Arc: exclude
      const chain = domainToChain(domain)
      const usdc = toUsdc6(w[3])
      moves.push({ txHash: log.transactionHash, bridge: 'gateway', direction: 'in', chainId: chain, usdc })
    }
  }
  return moves
}

// ── Across adapter ────────────────────────────────────────────────────────────

function decodeAcrossLogs(logs: readonly BridgeLogLike[]): BridgeMove[] {
  const moves: BridgeMove[] = []
  for (const log of logs) {
    if (!log.transactionHash || log.topics.length < 4) continue
    const addr = log.address.toLowerCase()
    const t0 = log.topics[0].toLowerCase()

    if (addr === ACROSS_SPOKE && t0 === FUNDS_DEPOSITED) {
      // topic1 = destinationChainId (uint256 indexed)
      // data: [0]=inputToken (bytes32), [1]=outputToken, [2]=inputAmount, [3]=outputAmount, ...
      const chainId = Number(BigInt(log.topics[1]))
      const w = readWords(log.data, 4)
      if (!w) continue
      const inputToken = w[0]
      const usdc = isArcUsdc(inputToken) ? toUsdc6(w[2]) : null
      moves.push({ txHash: log.transactionHash, bridge: 'across', direction: 'out', chainId, usdc })

    } else if (addr === ACROSS_SPOKE && t0 === FILLED_RELAY) {
      // topic1 = originChainId (uint256 indexed)
      // data: [0]=inputToken, [1]=outputToken (on Arc), [2]=inputAmount, [3]=outputAmount, ...
      const chainId = Number(BigInt(log.topics[1]))
      const w = readWords(log.data, 4)
      if (!w) continue
      const outputToken = w[1]
      const usdc = isArcUsdc(outputToken) ? toUsdc6(w[3]) : null
      moves.push({ txHash: log.transactionHash, bridge: 'across', direction: 'in', chainId, usdc })
    }
  }
  return moves
}

// ── Hyperlane adapter ─────────────────────────────────────────────────────────

const HL_SET = new Set(HYPERLANE_ROUTERS)

function decodeHyperlaneLogs(logs: readonly BridgeLogLike[]): BridgeMove[] {
  const moves: BridgeMove[] = []
  for (const log of logs) {
    if (!log.transactionHash || log.topics.length < 3) continue
    const addr = log.address.toLowerCase()
    if (!HL_SET.has(addr)) continue
    const t0 = log.topics[0].toLowerCase()

    if (t0 === HL_SENT_REMOTE) {
      // SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amount)
      // topic1 = destination domain id (== EVM chain id for observed chains)
      const chainId = Number(BigInt(log.topics[1]))
      const w = readWords(log.data, 1)
      if (!w) continue
      const usdc = toUsdc6(w[0])
      moves.push({ txHash: log.transactionHash, bridge: 'hyperlane', direction: 'out', chainId, usdc })

    } else if (t0 === HL_RECEIVED_REMOTE) {
      // ReceivedTransferRemote(uint32 indexed origin, bytes32 indexed recipient, uint256 amount)
      // topic1 = origin domain id
      const chainId = Number(BigInt(log.topics[1]))
      const w = readWords(log.data, 1)
      if (!w) continue
      const usdc = toUsdc6(w[0])
      moves.push({ txHash: log.transactionHash, bridge: 'hyperlane', direction: 'in', chainId, usdc })
    }
  }
  return moves
}

// ── LI.FI adapter ─────────────────────────────────────────────────────────────

/**
 * Decode the ABI-encoded BridgeData struct from the LiFiTransferStarted data field.
 *
 * LiFiTransferStarted(BridgeData bridgeData) where BridgeData is:
 * tuple(bytes32 transactionId, string bridge, string integrator, address referrer,
 *       address sendingAssetId, address receiver, uint256 minAmount,
 *       uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall)
 *
 * The log data is ABI-encoded: word0 = offset to tuple = 0x20,
 * then the tuple starts at word1. Because it contains strings (dynamic), the
 * tuple is itself fully ABI-encoded. Layout after the outer 0x20 offset:
 *
 * word 0  (abs offset 1): transactionId (bytes32)
 * word 1  (abs offset 2): offset to `bridge` string (relative to start of tuple)
 * word 2  (abs offset 3): offset to `integrator` string
 * word 3  (abs offset 4): referrer (address, padded)
 * word 4  (abs offset 5): sendingAssetId (address, padded)
 * word 5  (abs offset 6): receiver (address, padded)
 * word 6  (abs offset 7): minAmount (uint256)
 * word 7  (abs offset 8): destinationChainId (uint256)
 * word 8  (abs offset 9): hasSourceSwaps (bool)
 * word 9  (abs offset 10): hasDestinationCall (bool)
 *
 * The dynamic string data follows the fixed section. To find string content we use
 * the offsets stored in words 1 and 2 (relative to the start of the tuple = abs word 1).
 */
function decodeLifiLog(log: BridgeLogLike): BridgeMove | null {
  if (!log.transactionHash) return null
  const raw = log.data.startsWith('0x') ? log.data.slice(2) : log.data
  // Need at least 11 words: outer offset + 10 fixed words of tuple
  if (raw.length < 11 * WORD) return null

  // word0 (outer offset) — should be 0x20 but we don't rely on it
  // The tuple starts at absolute word index 1 in the data.
  const TUPLE_START = 1 // word index

  const readWord = (i: number): bigint | null => {
    const start = i * WORD
    if (start + WORD > raw.length) return null
    return BigInt(`0x${raw.slice(start, start + WORD)}`)
  }

  // Offsets into tuple for dynamic fields are relative to the start of the tuple.
  const bridgeOffsetRaw = readWord(TUPLE_START + 1)
  const destinationChainIdRaw = readWord(TUPLE_START + 7)
  const minAmountRaw = readWord(TUPLE_START + 6)
  const sendingAssetIdRaw = readWord(TUPLE_START + 4)
  if (bridgeOffsetRaw === null || destinationChainIdRaw === null || minAmountRaw === null || sendingAssetIdRaw === null) return null

  const destinationChainId = Number(destinationChainIdRaw)
  // Filter out non-EVM Solana chain id from LI.FI (1151111081099710 → synthetic -5)
  let chainId: number | null = destinationChainId
  if (chainId === 1151111081099710) chainId = NON_EVM.solana

  // sendingAssetId is an address padded to 32 bytes
  const sendingAsset = `0x${(sendingAssetIdRaw & 0xffffffffffffffffffffffffffffffffffffffffn).toString(16).padStart(40, '0')}`
  const usdc = sendingAsset === ARC_USDC ? toUsdc6(minAmountRaw) : null

  // Decode `bridge` string: offset is relative to tuple start word in data (in bytes).
  // tupleBase in hex chars = TUPLE_START * WORD; bridgeStrOffset is bytes → hex = × 2.
  let bridgeName = ''
  const bridgeStrOffset = Number(bridgeOffsetRaw)
  const bLenHex = (TUPLE_START * WORD) + bridgeStrOffset * 2
  if (bLenHex + WORD > raw.length) return null
  const bLen = Number(BigInt(`0x${raw.slice(bLenHex, bLenHex + WORD)}`))
  if (bLen > 256 || bLen < 0) return null
  const bStrHex = bLenHex + WORD
  if (bStrHex + bLen * 2 > raw.length) return null
  try {
    bridgeName = Buffer.from(raw.slice(bStrHex, bStrHex + bLen * 2), 'hex').toString('utf8')
  } catch {
    bridgeName = ''
  }

  return {
    txHash: log.transactionHash,
    bridge: 'lifi',
    direction: 'out',
    chainId,
    usdc,
    via: bridgeName || undefined,
  }
}

function decodeLifiLogs(logs: readonly BridgeLogLike[]): BridgeMove[] {
  const moves: BridgeMove[] = []
  for (const log of logs) {
    if (!log.transactionHash || log.topics.length === 0) continue
    const addr = log.address.toLowerCase()
    const t0 = log.topics[0].toLowerCase()
    if (addr === LIFI_DIAMOND && t0 === LIFI_STARTED) {
      const m = decodeLifiLog(log)
      if (m) moves.push(m)
    }
  }
  return moves
}

// ── deBridge adapter ──────────────────────────────────────────────────────────

/**
 * Decode the Order tuple from CreatedOrder or FulfilledOrder data.
 *
 * FulfilledOrder(Order order, bytes32 orderId, uint256, address sender, address unlockAuthority)
 * CreatedOrder(Order order, bytes32 orderId, bytes affiliateFee, uint256 nativeFixFee,
 *              uint256 percentFee, uint32 referralCode, bytes metadata)
 *
 * Order tuple (ABI encoded, dynamic because of bytes fields):
 * Layout of the fixed part of Order (starting after outer ABI encoding):
 * The log data starts with: word0 = offset to Order struct.
 * Order struct (all fields including dynamic bytes):
 *   uint64 makerOrderNonce           (word 0)
 *   bytes makerSrc                   (word 1 = offset to dynamic bytes)
 *   uint256 giveChainId              (word 2)
 *   bytes giveTokenAddress           (word 3 = offset to dynamic bytes)
 *   uint256 giveAmount               (word 4)
 *   uint256 takeChainId              (word 5)
 *   bytes takeTokenAddress           (word 6 = offset to dynamic bytes)
 *   uint256 takeAmount               (word 7)
 *   bytes receiverDst                (word 8 = offset)
 *   ... (more fields, we only need through takeAmount)
 *
 * deBridge Solana chain id 7565164 → NON_EVM.solana (-5).
 */
function decodeDebridgeLog(log: BridgeLogLike, eventTopic: string): BridgeMove | null {
  if (!log.transactionHash) return null
  const raw = log.data.startsWith('0x') ? log.data.slice(2) : log.data
  // data word0 = offset to Order struct = 0xa0 (=160 bytes = 5 words) for FulfilledOrder
  // or 0xe0 (=224 bytes = 7 words) for CreatedOrder — we use the actual offset.
  if (raw.length < 2 * WORD) return null

  const readWord = (i: number): bigint | null => {
    const s = i * WORD
    if (s + WORD > raw.length) return null
    return BigInt(`0x${raw.slice(s, s + WORD)}`)
  }

  // Word 0 of raw data = offset to start of Order struct (in bytes).
  const orderOffsetRaw = readWord(0)
  if (orderOffsetRaw === null) return null
  const orderOffset = Number(orderOffsetRaw) / 32  // convert byte-offset to word-index

  // Order fixed-layout words (relative to orderOffset):
  // word0 = makerOrderNonce (uint64)
  // word1 = offset to makerSrc (bytes, dynamic) — relative to start of Order struct
  // word2 = giveChainId
  // word3 = offset to giveTokenAddress (bytes, dynamic)
  // word4 = giveAmount
  // word5 = takeChainId
  // word6 = offset to takeTokenAddress (bytes, dynamic)
  // word7 = takeAmount
  const giveChainIdRaw = readWord(orderOffset + 2)
  const giveAmountRaw  = readWord(orderOffset + 4)
  const takeChainIdRaw = readWord(orderOffset + 5)
  const takeAmountRaw  = readWord(orderOffset + 7)

  // For giveTokenAddress: it's a dynamic bytes field. word3 is an offset relative to the Order struct start.
  const giveTokenOffsetRelRaw = readWord(orderOffset + 3)
  const takeTokenOffsetRelRaw = readWord(orderOffset + 6)

  if (!giveChainIdRaw || !giveAmountRaw || !takeChainIdRaw || !takeAmountRaw ||
      !giveTokenOffsetRelRaw || !takeTokenOffsetRelRaw) return null

  let giveChainId = Number(giveChainIdRaw)
  let takeChainId = Number(takeChainIdRaw)

  // deBridge Solana chain id → synthetic
  if (giveChainId === 7565164) giveChainId = NON_EVM.solana
  if (takeChainId === 7565164) takeChainId = NON_EVM.solana

  // Read token address bytes (20 bytes = 40 hex): bytes field at orderOffset + giveTokenOffsetRel/32
  // Each dynamic bytes field: length word + padded data. Token address is 20 bytes.
  const readTokenAddr = (relOffset: bigint): string | null => {
    const absWord = orderOffset + Number(relOffset) / 32
    const lenWord = readWord(absWord)
    if (lenWord === null) return null
    const byteLen = Number(lenWord)
    if (byteLen === 0) return '0x' + '00'.repeat(20)  // native / zero address
    if (byteLen !== 20) return null
    const dataHex = raw.slice((absWord + 1) * WORD, (absWord + 1) * WORD + byteLen * 2)
    if (dataHex.length < byteLen * 2) return null
    return `0x${dataHex.toLowerCase().padStart(40, '0')}`
  }

  const giveToken = readTokenAddr(giveTokenOffsetRelRaw)
  const takeToken = readTokenAddr(takeTokenOffsetRelRaw)
  if (giveToken === null || takeToken === null) return null

  const giveIsNative = giveToken === '0x' + '00'.repeat(20)
  const takeIsNative = takeToken === '0x' + '00'.repeat(20)
  const giveIsUsdc   = giveToken.toLowerCase() === ARC_USDC

  // deBridge Solana chain id 7565164: giveToken is a Solana base58 address stored as bytes;
  // we can't easily verify. Use null for amount on Solana-originated gives.

  if (eventTopic === DEBRIDGE_FULFILLED) {
    // 'in' move to Arc: take side is Arc.
    // chainId = giveChainId (origin). usdc = takeAmount if takeToken is USDC (6 dec) or native (18 dec).
    let usdc: number | null = null
    if (takeIsNative || giveIsUsdc) {
      // Arc-side payment: takeAmount in native USDC (18 dec) or ERC-20 (6 dec)
      // In the observed fixture, take side is giveIsUsdc==false, takeIsNative==true (native Arc token 18 dec)
      // or takeToken==ARC_USDC (6 dec).
      if (takeIsNative) usdc = toUsdc18(takeAmountRaw)
      else usdc = toUsdc6(takeAmountRaw)
    } else if (takeToken.toLowerCase() === ARC_USDC) {
      usdc = toUsdc6(takeAmountRaw)
    }
    return { txHash: log.transactionHash, bridge: 'debridge', direction: 'in', chainId: giveChainId, usdc }

  } else if (eventTopic === DEBRIDGE_CREATED) {
    // 'out' move from Arc: give side is Arc.
    // chainId = takeChainId (destination). usdc = giveAmount using 18 dec if giveToken is native, 6 dec if USDC ERC-20.
    let usdc: number | null = null
    if (giveIsNative) usdc = toUsdc18(giveAmountRaw)
    else if (giveIsUsdc) usdc = toUsdc6(giveAmountRaw)
    return { txHash: log.transactionHash, bridge: 'debridge', direction: 'out', chainId: takeChainId, usdc }
  }

  return null
}

function decodeDebridgeLogs(logs: readonly BridgeLogLike[]): BridgeMove[] {
  const moves: BridgeMove[] = []
  for (const log of logs) {
    if (!log.transactionHash || log.topics.length === 0) continue
    const addr = log.address.toLowerCase()
    const t0 = log.topics[0].toLowerCase()
    if ((addr === DEBRIDGE_SRC && t0 === DEBRIDGE_CREATED) ||
        (addr === DEBRIDGE_DST && t0 === DEBRIDGE_FULFILLED)) {
      try {
        const m = decodeDebridgeLog(log, t0)
        if (m) moves.push(m)
      } catch {
        // malformed data: skip
      }
    }
  }
  return moves
}

// ── Combined decoder ──────────────────────────────────────────────────────────

/**
 * Deduplicate moves: key by txHash; priority cctp > gateway > debridge > hyperlane > across > lifi.
 * If a lifi move shares a tx with another bridge's move, absorb it (set via='LI.FI' on the kept move)
 * and drop the lifi move.
 */
export function dedupeMoves(moves: BridgeMove[]): BridgeMove[] {
  const PRIORITY: Record<BridgeId, number> = {
    cctp: 6, gateway: 5, debridge: 4, hyperlane: 3, across: 2, lifi: 1,
  }
  // Group by txHash
  const byHash = new Map<string, BridgeMove[]>()
  for (const m of moves) {
    const key = m.txHash.toLowerCase()
    const arr = byHash.get(key)
    if (arr) arr.push(m)
    else byHash.set(key, [m])
  }
  const out: BridgeMove[] = []
  for (const group of byHash.values()) {
    if (group.length === 1) { out.push(group[0]); continue }
    // Sort by priority desc
    group.sort((a, b) => PRIORITY[b.bridge] - PRIORITY[a.bridge])
    const winner = group[0]
    // Check if any lifi move exists alongside a higher-priority one
    const hasHigher = group.some(m => m.bridge !== 'lifi' && PRIORITY[m.bridge] > PRIORITY.lifi)
    const haslifi = group.some(m => m.bridge === 'lifi')
    if (hasHigher && haslifi) {
      // Absorb: set via='LI.FI' on the winner (if winner is not lifi)
      if (winner.bridge !== 'lifi') {
        out.push({ ...winner, via: winner.via ?? 'LI.FI' })
        // Also push any other non-lifi high-priority moves (dedup within)
        const seen = new Set<string>()
        seen.add(`${winner.txHash}:${winner.bridge}`)
        for (const m of group) {
          if (m.bridge === 'lifi') continue
          const k = `${m.txHash}:${m.bridge}`
          if (!seen.has(k)) { seen.add(k); out.push(m) }
        }
      }
    } else {
      // No lifi absorption needed: keep highest priority per tx
      out.push(winner)
    }
  }
  return out
}

/**
 * Decode all bridge logs into BridgeMove[], then dedup.
 * On testnet, only CCTP is active — all other adapters return [].
 */
export function decodeBridgeLogs(logs: readonly BridgeLogLike[], net: CctpNet): BridgeMove[] {
  // testnet: only CCTP
  if (net === 'testnet') {
    return decodeCctpLogs(logs as readonly CctpLogLike[], net).map(m => ({
      txHash: m.txHash,
      bridge: 'cctp' as BridgeId,
      direction: m.direction,
      chainId: domainToChain(m.domain),
      usdc: m.usdc,
    }))
  }

  // mainnet: all bridges
  const cctp: BridgeMove[] = decodeCctpLogs(logs as readonly CctpLogLike[], net).map(m => ({
    txHash: m.txHash,
    bridge: 'cctp' as BridgeId,
    direction: m.direction,
    chainId: domainToChain(m.domain),
    usdc: m.usdc,
  }))

  const all: BridgeMove[] = [
    ...cctp,
    ...decodeGatewayLogs(logs),
    ...decodeAcrossLogs(logs),
    ...decodeHyperlaneLogs(logs),
    ...decodeLifiLogs(logs),
    ...decodeDebridgeLogs(logs),
  ]

  return dedupeMoves(all)
}

// ── Summariser ────────────────────────────────────────────────────────────────

export interface BridgeDirectionStat {
  count: number
  usdc: number
}

export interface BridgeStat {
  in: BridgeDirectionStat
  out: BridgeDirectionStat
  /** Number of moves where usdc was null. */
  usdcUnknownCount: number
}

export type BridgeSummary = {
  byBridge: Record<BridgeId, BridgeStat>
  byChain: Record<number, { in: BridgeDirectionStat; out: BridgeDirectionStat }>
}

const BRIDGE_IDS: readonly BridgeId[] = ['cctp', 'gateway', 'across', 'hyperlane', 'lifi', 'debridge']

function emptyBridgeStat(): BridgeStat {
  return { in: { count: 0, usdc: 0 }, out: { count: 0, usdc: 0 }, usdcUnknownCount: 0 }
}

export function summarise(moves: readonly BridgeMove[]): BridgeSummary {
  const byBridge = Object.fromEntries(BRIDGE_IDS.map(id => [id, emptyBridgeStat()])) as Record<BridgeId, BridgeStat>
  const byChain: Record<number, { in: BridgeDirectionStat; out: BridgeDirectionStat }> = {}

  for (const m of moves) {
    const bs = byBridge[m.bridge]
    if (!bs) continue
    const dir = m.direction
    bs[dir].count++
    if (m.usdc !== null) bs[dir].usdc += m.usdc
    else bs.usdcUnknownCount++

    if (m.chainId !== null) {
      const cs = byChain[m.chainId] ?? { in: { count: 0, usdc: 0 }, out: { count: 0, usdc: 0 } }
      cs[dir].count++
      if (m.usdc !== null) cs[dir].usdc += m.usdc
      byChain[m.chainId] = cs
    }
  }

  return { byBridge, byChain }
}
