/** Pure step of the wallet balance read: keep the tokens that were read, drop the ones whose call failed. */

export interface TokenBalance {
  id: string
  raw: bigint
  decimals: number
}

export function keepReadBalances(
  tokens: readonly { id: string }[],
  results: readonly PromiseSettledResult<TokenBalance>[],
): TokenBalance[] {
  return results
    .map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { id: tokens[i].id, raw: null as unknown as bigint, decimals: 0, error: true },
    )
    .filter((r): r is TokenBalance => (r as { error?: boolean }).error !== true)
}
