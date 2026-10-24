/**
 * Pure decoder for live CCTP v2 moves on Arc: burns that leave (outbound) and mints that arrive
 * (inbound), read from TokenMessengerV2 / MessageTransmitterV2 logs. No '@/' imports, no network.
 * Constants and decoding rules are the ones our indexer runs in production.
 */

export type CctpNet = 'mainnet' | 'testnet'

/** The USDC ERC-20 interface on Arc (same address on both networks). */
export const CCTP_USDC = '0x3600000000000000000000000000000000000000'

export const TOKEN_MESSENGER_V2: Record<CctpNet, string> = {
  testnet: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
  mainnet: '0x28b5a0e9c621a5badaa536219b3a228c8168cf5d',
}

export const MESSAGE_TRANSMITTER_V2: Record<CctpNet, string> = {
  testnet: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
  mainnet: '0x81d40f21f12a8f0e3252bccb954d722d4c464b64',
}

/** DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, …) */
export const DEPOSIT_FOR_BURN_TOPIC = '0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5'
/** MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, …) */
export const MESSAGE_RECEIVED_TOPIC = '0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c'
/** MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected) */
export const MINT_AND_WITHDRAW_TOPIC = '0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63'

/** The three topic0 values to ask eth_getLogs for. */
export const CCTP_TOPICS: string[] = [DEPOSIT_FOR_BURN_TOPIC, MESSAGE_RECEIVED_TOPIC, MINT_AND_WITHDRAW_TOPIC]

/** The two contracts to ask eth_getLogs about. */
export function cctpAddresses(net: CctpNet): string[] {
  return [TOKEN_MESSENGER_V2[net], MESSAGE_TRANSMITTER_V2[net]]
}

/** The fields of an eth_getLogs entry this decoder reads. */
export interface CctpLogLike {
  address: string
  topics: readonly string[]
  data: string
  transactionHash: string | null | undefined
}

export interface CctpMove {
  txHash: string
  direction: 'in' | 'out'
  /** The other side's CCTP domain; −1 when an arrival's source is unknown. */
  domain: number
  /** USDC moved, or null when the amount is unknown or the token is not USDC. */
  usdc: number | null
}

const WORD_HEX = 64
const UNKNOWN_DOMAIN = -1
const MAX_UINT32 = 0xffffffffn
const USDC_UNIT = 1_000_000n

/** The first `count` 32-byte words of log data, or null when the data is too short or not hex. */
function readWords(data: string, count: number): bigint[] | null {
  const raw = data.startsWith('0x') || data.startsWith('0X') ? data.slice(2) : data
  if (raw.length < count * WORD_HEX || !/^[0-9a-fA-F]+$/.test(raw)) return null
  const words: bigint[] = []
  for (let i = 0; i < count; i++) words.push(BigInt(`0x${raw.slice(i * WORD_HEX, (i + 1) * WORD_HEX)}`))
  return words
}

/** Raw 6-decimal USDC → number, keeping the fraction exact until the last step. */
function toUsdc(raw: bigint): number {
  return Number(raw / USDC_UNIT) + Number(raw % USDC_UNIT) / Number(USDC_UNIT)
}

/** A padded 32-byte topic holding an address → that address, lower-cased. */
function topicAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null
  return `0x${topic.slice(-40)}`.toLowerCase()
}

const isUsdc = (topic: string | undefined) => topicAddress(topic) === CCTP_USDC

interface Mint { pos: number; usdc: number }
interface Received { pos: number; domain: number; used: boolean }
interface TxGroup { hash: string; first: number; mints: Mint[]; received: Received[] }

/**
 * Turns the logs of one tick into CCTP moves, oldest first.
 *  - Outbound: one per DepositForBurn (amount = word 0, destinationDomain = word 2). The amount counts
 *    only when the indexed burnToken (topic 1) is USDC; any other token gives usdc null.
 *  - Inbound: per transaction, every USDC MintAndWithdraw (amount = word 0; topic 2 is the mint token)
 *    is paired with the next unused MessageReceived after it (sourceDomain = word 0). A mint with no
 *    MessageReceived keeps domain −1; a MessageReceived left without a mint is an inbound with usdc null.
 *  - Logs from other contracts, other events, or with short or malformed data are skipped.
 */
export function decodeCctpLogs(logs: readonly CctpLogLike[], net: CctpNet): CctpMove[] {
  const messenger = TOKEN_MESSENGER_V2[net]
  const transmitter = MESSAGE_TRANSMITTER_V2[net]
  const found: Array<{ pos: number; move: CctpMove }> = []
  const groups = new Map<string, TxGroup>()
  const group = (hash: string, pos: number): TxGroup => {
    const key = hash.toLowerCase()
    let g = groups.get(key)
    if (!g) { g = { hash, first: pos, mints: [], received: [] }; groups.set(key, g) }
    return g
  }

  logs.forEach((log, pos) => {
    if (!log.transactionHash || log.topics.length === 0) return
    const address = log.address.toLowerCase()
    const topic0 = log.topics[0].toLowerCase()

    if (address === messenger && topic0 === DEPOSIT_FOR_BURN_TOPIC) {
      const w = readWords(log.data, 6)
      if (!w || w[2] > MAX_UINT32) return
      found.push({
        pos,
        move: { txHash: log.transactionHash, direction: 'out', domain: Number(w[2]), usdc: isUsdc(log.topics[1]) ? toUsdc(w[0]) : null },
      })
    } else if (address === messenger && topic0 === MINT_AND_WITHDRAW_TOPIC) {
      if (!isUsdc(log.topics[2])) return
      const w = readWords(log.data, 2)
      if (!w) return
      group(log.transactionHash, pos).mints.push({ pos, usdc: toUsdc(w[0]) })
    } else if (address === transmitter && topic0 === MESSAGE_RECEIVED_TOPIC) {
      const w = readWords(log.data, 1)
      if (!w || w[0] > MAX_UINT32) return
      group(log.transactionHash, pos).received.push({ pos, domain: Number(w[0]), used: false })
    }
  })

  for (const g of groups.values()) {
    for (const mint of g.mints) {
      const match = g.received.find(r => !r.used && r.pos > mint.pos)
      if (match) match.used = true
      found.push({
        pos: mint.pos,
        move: { txHash: g.hash, direction: 'in', domain: match ? match.domain : UNKNOWN_DOMAIN, usdc: mint.usdc },
      })
    }
    for (const r of g.received) {
      if (!r.used) found.push({ pos: r.pos, move: { txHash: g.hash, direction: 'in', domain: r.domain, usdc: null } })
    }
  }

  return found.sort((a, b) => a.pos - b.pos).map(f => f.move)
}

// ── Running totals since the page opened ────────────────────────────────────

export interface PortStat { inCount: number; outCount: number; inUsdc: number; outUsdc: number }
export interface CctpStats {
  inCount: number
  outCount: number
  /** Known USDC only: a move with an unknown amount adds to the count but not here. */
  inUsdc: number
  outUsdc: number
  /** Per other-network CCTP domain; arrivals from an unknown source count only in the totals. */
  ports: Record<number, PortStat>
}

export const EMPTY_CCTP_STATS: CctpStats = { inCount: 0, outCount: 0, inUsdc: 0, outUsdc: 0, ports: {} }

/** A new stats object with `moves` added; the input is not changed. */
export function addMoves(stats: CctpStats, moves: readonly CctpMove[]): CctpStats {
  if (moves.length === 0) return stats
  const next: CctpStats = { ...stats, ports: { ...stats.ports } }
  for (const m of moves) {
    const inbound = m.direction === 'in'
    const usdc = m.usdc ?? 0
    if (inbound) { next.inCount++; next.inUsdc += usdc } else { next.outCount++; next.outUsdc += usdc }
    if (m.domain === UNKNOWN_DOMAIN) continue
    const prev = next.ports[m.domain] ?? { inCount: 0, outCount: 0, inUsdc: 0, outUsdc: 0 }
    next.ports[m.domain] = inbound
      ? { ...prev, inCount: prev.inCount + 1, inUsdc: prev.inUsdc + usdc }
      : { ...prev, outCount: prev.outCount + 1, outUsdc: prev.outUsdc + usdc }
  }
  return next
}

/** The chains that moved the most USDC (in plus out), biggest first; chains with no known amount are left out. */
export function topChains(stats: CctpStats, n = 3): Array<{ domain: number; usdc: number }> {
  return Object.entries(stats.ports)
    .map(([domain, s]) => ({ domain: Number(domain), usdc: s.inUsdc + s.outUsdc }))
    .filter(c => c.usdc > 0)
    .sort((a, b) => b.usdc - a.usdc || a.domain - b.domain)
    .slice(0, n)
}
