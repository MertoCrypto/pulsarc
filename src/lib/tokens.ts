/** Pure token helpers: our own grouping and the mapping from ArcScan's raw token rows. */
import { scaled } from './numberFormat.ts'

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
}

export interface RawToken {
  address_hash: string
  name: string | null
  symbol: string | null
  decimals: string | null
  holders_count: string | null
  total_supply: string | null
  icon_url: string | null
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
  return {
    address: t.address_hash,
    name: t.name ?? 'Unnamed',
    symbol: t.symbol ?? '—',
    decimals,
    holders: Number(t.holders_count ?? 0),
    supply: scaled(t.total_supply, decimals),
    group: groupOf(t.name ?? '', t.symbol ?? ''),
    iconUrl: t.icon_url,
  }
}
