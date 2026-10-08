/**
 * The apps Pulsarc tracks on Arc Testnet.
 *
 * Every entry is a real, deployed contract set — addresses were checked against ArcScan
 * (is_contract, name, token metadata). An app is measured through its "anchors":
 *   - token anchors    → activity = transfers of that token (pools, vaults, stablecoins)
 *   - contract anchors → activity = transactions sent to that contract (infrastructure)
 *
 * `official` means the address is listed in Circle's Arc docs (docs.arc.io/arc/references/contract-addresses).
 * `usd` marks anchors whose token amount is a dollar amount, so volume can be summed in USD.
 */
import { APP_LOGOS } from './portal'

export type AppCategory = 'Stablecoin' | 'DeFi' | 'RWA' | 'Payments' | 'Agents' | 'Infra'

export interface Anchor {
  address: string
  kind: 'token' | 'contract'
  label: string
  usd?: boolean
}

export interface ArcApp {
  id: string
  name: string
  description: string
  category: AppCategory
  contractAddress: string // primary anchor, used for links
  anchors: Anchor[]
  verified: boolean       // official Circle / Arc infrastructure
  logoInitials: string
  logo?: string
  logoIcon?: 'usdc' | 'eurc' | 'btc'
  logoColor: string       // kept for the badge API; badges are neutral now
}

const NEUTRAL = '#a9c4ea'

function app(
  id: string, name: string, category: AppCategory, description: string,
  anchors: Anchor[], official = false,
): ArcApp {
  return {
    id, name, category, description, anchors,
    contractAddress: anchors[0].address,
    verified: official,
    logoInitials: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(),
    logo: APP_LOGOS[id]?.img,
    logoIcon: APP_LOGOS[id]?.icon,
    logoColor: NEUTRAL,
  }
}

const token = (address: string, label: string, usd = false): Anchor => ({ address, kind: 'token', label, usd })
const contract = (address: string, label: string): Anchor => ({ address, kind: 'contract', label })

export const ARC_APPS: ArcApp[] = [
  // ── Circle / Arc native ────────────────────────────────────────────────
  app('usdc', 'USDC', 'Stablecoin',
    "Circle's dollar stablecoin and the native gas token on Arc, with an ERC-20 interface.",
    [token('0x3600000000000000000000000000000000000000', 'USDC', true)], true),
  app('eurc', 'EURC', 'Stablecoin',
    "Circle's euro stablecoin.",
    [token('0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', 'EURC')], true),
  app('usyc', 'USYC', 'RWA',
    'US Yield Coin: a tokenized, yield-bearing treasury product from Circle.',
    [token('0x825Ae482558415310C71B7E03d2BbBe409345903', 'USYC')], true),
  app('cirbtc', 'cirBTC', 'DeFi',
    'Circle Wrapped Bitcoin.',
    [token('0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF', 'cirBTC')], true),
  app('stablefx', 'StableFX', 'Payments',
    'Onchain escrow for USDC ↔ EURC foreign-exchange settlement.',
    [contract('0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10', 'FxEscrow')], true),
  app('memo', 'Arc Memo', 'Payments',
    'Attach invoice and order references to payments, emitted as onchain events.',
    [contract('0x5294E9927c3306DcBaDb03fe70b92e01cCede505', 'Memo')], true),
  app('multicall', 'Multicall3From', 'Infra',
    'Batch many calls in one transaction while keeping the original sender.',
    [contract('0x522fAf9A91c41c443c66765030741e4AaCe147D0', 'Multicall3From')], true),
  app('cctp', 'CCTP v2', 'Infra',
    "Circle's cross-chain transfer protocol: burn USDC on one chain, mint on another.",
    [contract('0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA', 'TokenMessengerV2')], true),
  app('gateway', 'Circle Gateway', 'Infra',
    'A unified USDC balance usable across chains.',
    [contract('0x0077777d7EBA4688BDeF3E311b846F25870A19B9', 'GatewayWallet')], true),
  app('erc8004', 'ERC-8004 Identity', 'Agents',
    'Onchain identity registry for AI agents.',
    [contract('0x8004A818BFB912233c491871b3d84c89A494BD9e', 'IdentityRegistry')], true),
  app('erc8183', 'Agentic Commerce', 'Agents',
    'ERC-8183 jobs and escrow for agent-to-agent trade (testnet only).',
    [contract('0x0747EEf0706327138c69792bF28Cd525089e4583', 'AgenticCommerce')], true),

  // ── Stablecoin issuers and wrappers ────────────────────────────────────
  app('wusdc', 'Wrapped USDC', 'Stablecoin',
    'USDC wrapped as a plain ERC-20 with 18 decimals.',
    [token('0x911b4000D3422F482F4062a913885f7b035382Df', 'WUSDC', true)]),
  app('arc-dollar', 'Arc Dollar', 'Stablecoin',
    'A family of local-currency stablecoins: USD, staked USD, EUR, TRY and GBP.',
    [
      token('0xeD7cb772b49448027901546870425579596faaE1', 'aUSDC', true),
      token('0x3554D4d10682fdc680A2cb64ADa35f8E7a297a32', 'astUSDC'),
      token('0x429a1D105558f4727453d2a17dF17ac9d5be1EA9', 'aEURC'),
      token('0x8DD16a98A3f5d767d5D08bEECbEa1Cd8CF2832ee', 'aTRYC'),
      token('0x6374151C499DADc9A54650D25CdFF3B5688652Ba', 'aGBPC'),
    ]),

  // ── Community DeFi (found through ArcScan token data) ─────────────────
  app('xylonet', 'XyloNet', 'DeFi',
    'A stable AMM for USDC and EURC, plus an ERC-4626 USDC vault.',
    [
      token('0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1', 'USDC-EURC LP'),
      token('0x240Eb85458CD41361bd8C3773253a1D78054f747', 'USDC Vault'),
    ]),
  app('curve-usdc-eurc', 'Curve USDC/EURC', 'DeFi',
    'A Curve StableSwap pool for USDC and EURC, with its gauge.',
    [
      token('0x2D84D79C852f6842AbE0304b70bBaA1506AdD457', 'USDC/EURC pool'),
      token('0xCd4e6C8056608e7CA5b8cD126F32c56c43D92979', 'Gauge'),
    ]),
  app('swaparc', 'Swaparc', 'DeFi',
    'A USDC-paired swap protocol with several liquidity-pool tokens.',
    [
      token('0xBE7477BF91526FC9988C8f33e91B6db687119D45', 'SWPRC'),
      token('0x454f21b7738A446f79ea4ff00e71b9e8E9E6FEE9', 'SLP'),
      token('0xb81816d4fBB3D33b56c3efc04675d1cDed0f68b1', 'SLP'),
      token('0x2E2C7B48B2422223aD9628DA159f304192c24d3B', 'SLP'),
    ]),
  app('synthra', 'Synthra', 'DeFi',
    'The Synthra protocol token.',
    [token('0xC5124C846c6e6307986988dFb7e743327aA05F19', 'SYN')]),
  app('unitflow', 'UnitFlow', 'DeFi',
    'A lending market; this tracks its USDC deposit-share token.',
    [token('0x142ec8437F645Baef1B3683f2065f53A26285A7a', 'uUSDC')]),
  app('arcflow', 'ArcFlow', 'DeFi',
    'ArcFlow V25 pool token.',
    [token('0xFA61E1dE61DAf2EF4D8d9BAd4B99fa21C8EFAB8a', 'AFF-V25')]),
  app('axpha', 'Axpha', 'DeFi',
    'A lending protocol; this tracks its USDC share token.',
    [token('0xC0D12A7Cf565A004757c62cAF34Dd37467F57f0e', 'USDC.a')]),
  app('onmifun', 'Onmifun', 'DeFi',
    'Liquidity-pool tokens for the Onmifun launchpad.',
    [
      token('0x9a09B4685073D873Fb51a3D474A4559dB2f979d3', 'Onmi-LP'),
      token('0x95b0d01eBF734178e27eA8C44d654792e1cE9e29', 'Onmi-LP'),
    ]),
]

export const CATEGORIES: AppCategory[] = ['Stablecoin', 'DeFi', 'RWA', 'Payments', 'Agents', 'Infra']

export const appById = (id: string) => ARC_APPS.find(a => a.id === id)
