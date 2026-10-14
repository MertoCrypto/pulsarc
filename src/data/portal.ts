/** Apps and assets listed on Arc Portal (portal.arc.io/discover). */
export const PORTAL = 'https://portal.arc.io'
/** Logos are self-hosted under public/portal-assets (copied from the portal): ad blockers and shields block hotlinks to it. */
export const portalLogo = (path: string) => `/portal-assets/${path}`

export interface PortalApp {
  key: string
  name: string
  note: string
  logo: string
}

/** Onchain apps from the portal that Pulsarc does not measure yet (centralized exchanges are left out). */
export const PORTAL_APPS: PortalApp[] = [
  { key: 'uniswap', name: 'Uniswap', note: 'Decentralized exchange', logo: portalLogo('discover/uniswap.png') },
  { key: 'aave', name: 'Aave', note: 'Lending and borrowing', logo: portalLogo('discover/aave.png') },
  { key: 'morpho', name: 'Morpho', note: 'Lending network', logo: portalLogo('discover/morpho.png') },
  { key: 'maple', name: 'Maple', note: 'Onchain credit marketplace', logo: portalLogo('discover/maple.png') },
  { key: 'stargate', name: 'Stargate', note: 'Cross-chain transfers', logo: portalLogo('discover/stargate.png') },
  { key: 'across', name: 'Across', note: 'Cross-chain bridge', logo: portalLogo('discover/across.png') },
  { key: 'aerodrome', name: 'Aerodrome', note: 'Liquidity and trading', logo: portalLogo('discover/aerodrome.png') },
  { key: 'hibachi', name: 'Hibachi', note: 'Onchain perpetuals', logo: portalLogo('discover/hibachi.png') },
]

/** Logos for apps Pulsarc already tracks. Circle-issued assets use the shared token icons. */
export const APP_LOGOS: Record<string, { img?: string; icon?: 'usdc' | 'eurc' | 'btc' }> = {
  xylonet: { img: portalLogo('discover/xylonet.webp') },
  synthra: { img: portalLogo('discover/synthra.png') },
  uniswap: { img: portalLogo('discover/uniswap.png') },
  across: { img: portalLogo('discover/across.png') },
  weth: { img: portalLogo('tokens/weth.svg') },
  usyc: { img: portalLogo('tokens/usyc.svg') },
  // Arc-native contracts use the Arc symbol (arc.io); ERC-8004 uses its GitHub organisation's profile image.
  memo: { img: portalLogo('apps/arc.svg') },
  multicall: { img: portalLogo('apps/arc.svg') },
  erc8004: { img: portalLogo('apps/erc8004.png') },
  usdc: { icon: 'usdc' },
  eurc: { icon: 'eurc' },
  cirbtc: { icon: 'btc' },
}
