import { useState, type ComponentType } from 'react'
import {
  NetworkAptos, NetworkArbitrumOne, NetworkAvalanche, NetworkBase, NetworkBinanceSmartChain, NetworkCodex,
  NetworkCronos, NetworkEthereum, NetworkHyperEvm, NetworkInjective, NetworkInk, NetworkLinea, NetworkMonad,
  NetworkOptimism, NetworkPlasma, NetworkPlume, NetworkPolygon, NetworkSeiNetwork, NetworkSolana, NetworkSonic,
  NetworkStarknet, NetworkStellar, NetworkSui, NetworkUnichain, NetworkWorld, NetworkXLayer, NetworkXdcNetwork,
  TokenBTC, TokenEURC, TokenUSDC,
} from '@web3icons/react'
import type { ArcApp } from '@/data/apps'
import { domainName } from '@/lib/bridgeFlow'
import { portIconKey, portInitials } from '@/lib/chainPorts'

type IconProps = { variant?: 'branded' | 'mono' | 'background'; size?: number | string; className?: string }
type Icon = ComponentType<IconProps>

/** Icon components by the key `portIconKey` returns: the only place keys meet components. */
const ICONS: Record<string, Icon> = {
  NetworkEthereum, NetworkAvalanche, NetworkOptimism, NetworkArbitrumOne, NetworkSolana, NetworkBase,
  NetworkPolygon, NetworkSui, NetworkAptos, NetworkUnichain, NetworkLinea, NetworkCodex, NetworkSonic,
  NetworkWorld, NetworkMonad, NetworkSeiNetwork, NetworkBinanceSmartChain, NetworkXdcNetwork, NetworkHyperEvm,
  NetworkInk, NetworkPlume, NetworkStarknet, NetworkStellar, NetworkInjective, NetworkCronos, NetworkPlasma,
  NetworkXLayer,
}

const MONO = "font-['Geist_Mono'] font-medium text-[var(--periwinkle-hi)]"

/** A chain's own branded symbol, or mono initials when @web3icons has none. */
export function PortFace({ domain, size }: { domain: number; size: number }) {
  const key = portIconKey(domain)
  const Icon = key ? ICONS[key] : undefined
  if (Icon) return <Icon variant="branded" size={Math.round(size * 0.72)} />
  return <span className={MONO} style={{ fontSize: Math.max(8, size * 0.3) }}>{portInitials(domainName(domain))}</span>
}

/** An app's face: branded token icon, portal logo, or three-letter initials. */
export function AppFace({ app, size }: { app: ArcApp; size: number }) {
  const [broken, setBroken] = useState(false)
  if (app.logoIcon === 'usdc') return <TokenUSDC variant="branded" size={Math.round(size * 0.72)} />
  if (app.logoIcon === 'eurc') return <TokenEURC variant="branded" size={Math.round(size * 0.72)} />
  if (app.logoIcon === 'btc') return <TokenBTC variant="branded" size={Math.round(size * 0.66)} />
  if (app.logo && !broken) {
    return (
      <img
        src={app.logo}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setBroken(true)}
        className={app.kind === 'asset' ? 'h-full w-full object-contain' : 'h-full w-full object-cover'}
      />
    )
  }
  return (
    <span className={MONO} style={{ fontSize: Math.max(8, size * 0.3) }}>
      {app.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}
    </span>
  )
}
