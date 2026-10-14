/**
 * pageMeta.ts — pure, no React, no DOM.
 * Maps a pathname to { title, description } for every Pulsarc route.
 */

// Verbatim from index.html
const DEFAULT_TITLE = 'Pulsarc · Analytics for the Arc Network'
const DEFAULT_DESCRIPTION =
  'Pulsarc is an independent analytics project for the Arc Network: live rankings of apps, tokens and wallets, ranked by verified on-chain activity.'

/** Normalise a pathname: lowercase, strip one trailing slash except for "/". */
function normalise(pathname: string): string {
  let p = pathname.toLowerCase()
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1)
  }
  return p
}

interface PageMeta {
  title: string
  description: string
}

/** Exact-match table for known routes. */
const EXACT: Record<string, PageMeta> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  '/network': {
    title: 'Network · Pulsarc',
    description:
      'Arc Network fees in dollars, block times and payment memos, read straight from the chain.',
  },
  '/tokens': {
    title: 'Tokens · Pulsarc',
    description:
      'The 200 most-held ERC-20 tokens on Arc, from ArcScan. A price is shown only when the explorer has one.',
  },
  '/wallets': {
    title: 'Wallets · Pulsarc',
    description:
      'Watch the balance and activity of wallet addresses you choose. Your list stays in this browser.',
  },
  '/deploy': {
    title: 'Deploy · Pulsarc',
    description:
      'Deploy standard OpenZeppelin contracts on Arc from your own wallet. No owner keys, no hidden mint.',
  },
  '/deploy-local': {
    title: 'Local deploy · Pulsarc',
    description:
      'Development-only page for deploying Pulsarc contracts from your own wallet. Not part of the production site.',
  },
  '/compare': {
    title: 'Compare · Pulsarc',
    description:
      'Compare up to several Arc apps on one shared timeline, so the lines mean the same thing.',
  },
  '/trends': {
    title: 'Trends · Pulsarc',
    description:
      'How busy the whole Arc chain has been day by day, and which kinds of apps the activity flows into.',
  },
  '/nfts': {
    title: 'NFTs · Pulsarc',
    description:
      'The most-held ERC-721 and ERC-1155 collections on Arc, from ArcScan. No floor prices.',
  },
  '/agents': {
    title: 'Agents · Pulsarc',
    description:
      'AI agents with an onchain identity (ERC-8004) on Arc, read from the registry contracts themselves.',
  },
  '/leaderboard': {
    title: 'Leaderboard · Pulsarc',
    description:
      'Community votes, I-used-this attestations and USDC boosts recorded by Pulsarc contracts on Arc.',
  },
  '/method': {
    title: 'Method · Pulsarc',
    description:
      'Where every Pulsarc figure comes from, what is estimated, and how it is built, so you can check it.',
  },
  '/brand': {
    title: 'Brand · Pulsarc',
    description:
      'Pulsarc logo options shown as profile picture, banner, header lockup and favicon, with downloads.',
  },
  '/digest': {
    title: 'Digest · Pulsarc',
    description:
      'Arc\'s last 7 days compared with the 7 days before, counted in transactions from hourly indexer data.',
  },
  '/status': {
    title: 'Status · Pulsarc',
    description:
      'Live state of the Pulsarc indexer and the freshness of every published data file.',
  },
  '/discover': {
    title: 'Discover · Pulsarc',
    description:
      'The busiest Arc contracts of the last 24 hours that Pulsarc does not rank yet. Not all are apps.',
  },
  '/check': {
    title: 'Check · Pulsarc',
    description:
      'Plain facts about any wallet address on Arc from Pulsarc\'s wallet index, closed days only.',
  },
  '/answers': {
    title: 'Answers · Pulsarc',
    description:
      'Short, sourced answers about Arc, each read live from Pulsarc\'s indexer data with its method.',
  },
}

/** Prefix rules, checked in order. First match wins. */
const PREFIX_RULES: Array<{ prefix: string; meta: PageMeta }> = [
  {
    prefix: '/dapp/',
    meta: {
      title: 'App · Pulsarc',
      description:
        'Activity of one app on Arc: transactions, wallets and USDC, read from its real contracts.',
    },
  },
  {
    prefix: '/wallet/',
    meta: {
      title: 'Wallet · Pulsarc',
      description:
        'Balance and on-chain activity of one wallet address on Arc.',
    },
  },
  {
    prefix: '/answers/',
    meta: {
      title: 'Answers · Pulsarc',
      description:
        'One question about Arc, answered with a live number, its method and its source file.',
    },
  },
]

const DEFAULT_META: PageMeta = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
}

/**
 * Return the title and meta description for a given pathname.
 * Normalises the pathname before matching (lowercase, trailing slash stripped
 * except for "/").
 */
export function metaFor(pathname: string): PageMeta {
  const p = normalise(pathname)

  // Exact match
  if (Object.prototype.hasOwnProperty.call(EXACT, p)) {
    return EXACT[p]
  }

  // Prefix match
  for (const rule of PREFIX_RULES) {
    if (p.startsWith(rule.prefix)) {
      return rule.meta
    }
  }

  return DEFAULT_META
}

export { DEFAULT_TITLE, DEFAULT_DESCRIPTION }
