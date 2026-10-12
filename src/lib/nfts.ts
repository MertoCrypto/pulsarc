/** Pure NFT-collection helpers: mapping ArcScan token rows and ordering collections. */

export type NftKind = 'ERC-721' | 'ERC-1155'

export interface NftCollection {
  address: string
  name: string
  symbol: string
  kind: NftKind
  holders: number
  items: number | null    // total minted, when the contract reports it
  transfers: number | null // all-time transfers
}

export interface RawNftToken {
  address_hash: string
  name: string | null
  symbol: string | null
  holders_count: string | null
  total_supply: string | null
}

export function toNftCollection(t: RawNftToken, kind: NftKind): NftCollection {
  return {
    address: t.address_hash,
    name: t.name ?? 'Unnamed collection',
    symbol: t.symbol ?? '—',
    kind,
    holders: Number(t.holders_count ?? 0),
    items: t.total_supply ? Number(t.total_supply) : null,
    transfers: null,
  }
}

/** Most holders first; equal holders keep their input order. Returns a new array. */
export function sortByHolders(collections: readonly NftCollection[]): NftCollection[] {
  return [...collections].sort((x, y) => y.holders - x.holders)
}
