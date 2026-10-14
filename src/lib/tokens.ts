/** Pure token helpers: our own grouping and the mapping from ArcScan's raw token rows. */
import { scaled } from './numberFormat.ts'
import { cleanDisplayText } from './displayText.ts'

export type TokenGroup = 'Stablecoin' | 'RWA' | 'LP & Vaults' | 'Other'

export interface ArcToken {
  address: string
  name: string
  symbol: string
  decimals: number
  holders: number
  supply: number
  group: TokenGroup
  iconUrl: string | null
  /** 24-hour USD volume from ArcScan. Null when not provided, non-numeric, NaN, negative, or Infinity. */
  volume24h: number | null
  /** Circulating market cap in USD from ArcScan. Null when not provided, non-numeric, NaN, negative, or Infinity. */
  marketCap: number | null
  /** USD price per token from ArcScan. Null when not provided, non-numeric, NaN, negative, or Infinity. */
  price: number | null
}

export interface RawToken {
  address_hash: string
  name: string | null
  symbol: string | null
  decimals: string | null
  holders_count: string | null
  total_supply: string | null
  icon_url: string | null
  /** volume_24h in USD, string or null (only ~5% of tokens have a non-null value). */
  volume_24h?: string | null
  /** circulating_market_cap in USD, string or null. */
  circulating_market_cap?: string | null
  /** exchange_rate (USD price per token), string or null. */
  exchange_rate?: string | null
}

/**
 * Parse a market number (USD volume, market cap, price) from a raw string field.
 * Returns null for: missing/undefined, empty string, non-numeric, NaN, negative, Infinity.
 */
export function parseMarketNum(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

const STABLE = /^(w|a|x)?(usdc|eurc|usdt)(\.a)?$/i

/** Our own labels, derived from names. ArcScan does not classify tokens. */
export function groupOf(name: string, symbol: string): TokenGroup {
  if (/^usyc$/i.test(symbol)) return 'RWA'
  if (STABLE.test(symbol) || /^(circle )?(usd coin|euro coin)$/i.test(name)) return 'Stablecoin'
  if (/\blp\b|-lp|lp$|vault|gauge|staked|pool/i.test(`${name} ${symbol}`)) return 'LP & Vaults'
  return 'Other'
}

export function toArcToken(t: RawToken): ArcToken {
  const decimals = Number(t.decimals ?? 0)
  const name   = (t.name == null ? 'Unnamed' : cleanDisplayText(t.name))
  const symbol = (t.symbol == null ? '—' : cleanDisplayText(t.symbol))
  return {
    address: t.address_hash,
    name,
    symbol,
    decimals,
    holders: Number(t.holders_count ?? 0),
    supply: scaled(t.total_supply, decimals),
    group: groupOf(cleanDisplayText(t.name), cleanDisplayText(t.symbol)),
    iconUrl: t.icon_url,
    volume24h: parseMarketNum(t.volume_24h),
    marketCap: parseMarketNum(t.circulating_market_cap),
    price: parseMarketNum(t.exchange_rate),
  }
}

/**
 * Union of two token lists by contract address (case-insensitive). Entries of `primary` win;
 * entries of `extra` are appended only when their address is not in `primary`.
 * Used to keep tokens the indexer knows (for example USYC) when ArcScan's list leaves them out.
 */
export function mergeTokenSources(primary: readonly ArcToken[], extra: readonly ArcToken[]): ArcToken[] {
  const seen = new Set(primary.map(t => t.address.toLowerCase()))
  const out = [...primary]
  for (const t of extra) {
    const k = t.address.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/**
 * Only verified tokens may be typed 'Stablecoin' or 'RWA'. groupOf guesses from the name and symbol,
 * which anyone can copy ("USDC" from a random contract), so an unverified token that guessed one of
 * those becomes 'Other'. Verified = lower-cased address in `verified`.
 */
export function restrictGroupsToVerified(tokens: readonly ArcToken[], verified: ReadonlySet<string>): ArcToken[] {
  return tokens.map(t =>
    (t.group === 'Stablecoin' || t.group === 'RWA') && !verified.has(t.address.toLowerCase())
      ? { ...t, group: 'Other' as const }
      : t,
  )
}
