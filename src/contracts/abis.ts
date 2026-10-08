// ABIs for Pulsarc platform contracts — Arc Testnet
// Addresses loaded from import.meta.env

// Fallbacks are the platform contracts deployed on Arc Testnet (see contracts/contract-metadata/*.json),
// so the app works without a local .env.
export const ARC_VOTING_ADDRESS = (import.meta.env.VITE_ARC_VOTING_ADDRESS ?? '0xac8bba07b3ee5df345aab5c4274837179c7d32b9') as `0x${string}`
export const ARC_ATTESTATION_ADDRESS = (import.meta.env.VITE_ARC_ATTESTATION_ADDRESS ?? '0x231f98aecfcfd740e418af29b2ac7587b2d9e471') as `0x${string}`
export const ARC_BOOST_ADDRESS = (import.meta.env.VITE_ARC_BOOST_ADDRESS ?? '0x3b673daac8f336e2b3f0582a25239bb8bcaa961a') as `0x${string}`
export const ARC_WATCHLIST_NFT_ADDRESS = (import.meta.env.VITE_ARC_WATCHLIST_NFT_ADDRESS ?? '0xf751a0e96c18dac8c82f4972827bb8cd657f7648') as `0x${string}`
export const ARC_USDC_ADDRESS = (import.meta.env.VITE_ARC_USDC_ADDRESS ?? '0x3600000000000000000000000000000000000000') as `0x${string}`

export const arcVotingAbi = [
  {
    name: 'vote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'dappId', type: 'string' }],
    outputs: [],
  },
  {
    name: 'getVoteCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dappId', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'canVote',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'voter', type: 'address' }, { name: 'dappId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getLastVoteTime',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'voter', type: 'address' }, { name: 'dappId', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'Voted',
    type: 'event',
    inputs: [
      { name: 'voter', type: 'address', indexed: true },
      { name: 'dappId', type: 'string', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const

export const arcAttestationAbi = [
  {
    name: 'attest',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'dappId', type: 'string' }],
    outputs: [],
  },
  {
    name: 'getAttestationCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dappId', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'hasAttested',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'dappId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'Attested',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'dappId', type: 'string', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const

export const arcBoostAbi = [
  {
    name: 'boost',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'dappId', type: 'string' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getTotalBoost',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dappId', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getBoostCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dappId', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'Boosted',
    type: 'event',
    inputs: [
      { name: 'booster', type: 'address', indexed: true },
      { name: 'dappId', type: 'string', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const

export const arcWatchlistNftAbi = [
  {
    name: 'mintWatchlist',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'dappId', type: 'string' }],
    outputs: [],
  },
  {
    name: 'hasWatchlisted',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'dappId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getTokensOfOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'getDappIdForToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export const erc20ApproveAbi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const
