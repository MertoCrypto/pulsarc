import { useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useChainStats } from '@/hooks/useChainStats'
import { ConnectKitButton } from 'connectkit'
import { ChevronDown, Radio } from 'lucide-react'
import { ArcPulse } from '@/components/pulse/ArcPulse'
import { GlobalSearch } from '@/components/shared/GlobalSearch'

interface NavItem {
  to: string
  label: string
  match: (p: string) => boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'DApps', match: p => p === '/' || p.startsWith('/dapp/') },
  { to: '/tokens', label: 'Tokens', match: p => p.startsWith('/tokens') },
  { to: '/nfts', label: 'NFTs', match: p => p.startsWith('/nfts') },
  { to: '/agents', label: 'Agents', match: p => p.startsWith('/agents') },
  { to: '/network', label: 'Network', match: p => p.startsWith('/network') },
  { to: '/wallets', label: 'Wallets', match: p => p.startsWith('/wallet') },
]

const MORE: NavItem[] = [
  { to: '/leaderboard', label: 'Engagement', match: p => p.startsWith('/leaderboard') },
  { to: '/compare', label: 'Compare', match: p => p.startsWith('/compare') },
  { to: '/trends', label: 'Trends', match: p => p.startsWith('/trends') },
  { to: '/deploy', label: 'Deploy', match: p => p.startsWith('/deploy') },
  { to: '/method', label: 'Method', match: p => p.startsWith('/method') },
]

const ALL_NAV = [...NAV, ...MORE]

function ArcMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      {/* The arch is Arc; the beat running through it is the pulse. */}
      <path d="M4 28 C 4 14, 10 4, 16 4 C 22 4, 28 14, 28 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M9.5 21 H13 L15.5 12.5 L18.5 25 L20.5 21 H22.5" stroke="var(--periwinkle)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MoreMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)
  const active = MORE.some(i => i.match(pathname))
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        aria-expanded={open}
        className={clsx(
          'flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[15px] transition-all',
          active
            ? 'border-[var(--periwinkle)]/70 bg-white/[0.06] text-white shadow-[0_0_0_3px_rgba(169,196,234,0.12)]'
            : 'border-transparent text-[var(--muted)] hover:text-white',
        )}
      >
        More
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 pt-2">
          <div className="arc-card min-w-[180px] overflow-hidden bg-[#0f2038] p-1.5">
            {MORE.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={clsx(
                  'block rounded-lg px-3.5 py-2.5 text-[15px] transition-colors',
                  item.match(pathname) ? 'bg-white/[0.07] text-white' : 'text-[var(--muted)] hover:bg-white/[0.04] hover:text-white',
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function NetworkBar() {
  const { blockNumber } = useChainStats()
  const [pulseOpen, setPulseOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-[var(--line)] bg-[#0b182c]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[64px] max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 text-white shrink-0">
          <ArcMark className="w-7 h-7" />
          <span className="text-[19px] font-light tracking-tight sm:text-[22px]">
            Puls<span className="font-normal text-[var(--periwinkle)]">arc</span>
          </span>
        </Link>

        <nav className="hidden lg:flex flex-1 items-center justify-center gap-1">
          {NAV.map(item => {
            const active = item.match(pathname)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={clsx(
                  'px-4 py-2 rounded-xl text-[15px] transition-all border',
                  active
                    ? 'text-white border-[var(--periwinkle)]/70 bg-white/[0.06] shadow-[0_0_0_3px_rgba(169,196,234,0.12)]'
                    : 'text-[var(--muted)] border-transparent hover:text-white'
                )}
              >
                {item.label}
              </NavLink>
            )
          })}
          <MoreMenu pathname={pathname} />
        </nav>
        <div className="flex-1 lg:hidden" />

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--line)]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--positive)] opacity-70" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--positive)]" />
          </span>
          <span className="text-xs text-[var(--muted)]">Arc Testnet</span>
          {blockNumber !== null && (
            <span className="text-xs font-['Geist_Mono'] text-[var(--faint)] tabular-nums">
              #{blockNumber.toString()}
            </span>
          )}
        </div>

        <div className="hidden xl:block"><GlobalSearch /></div>

        <button onClick={() => setPulseOpen(true)} className="arc-btn-ghost hidden sm:inline-flex" title="Open Arc Pulse">
          <Radio className="w-3.5 h-3.5 text-[var(--periwinkle)]" />
          Pulse
        </button>

        <ConnectKitButton />
      </div>

      {/* Mobile nav — horizontally scrollable so every section stays reachable */}
      <nav className="flex gap-1 overflow-x-auto border-t border-[var(--line)] px-4 py-2 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ALL_NAV.map(item => {
          const active = item.match(pathname)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={clsx(
                'shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors',
                active ? 'bg-white/[0.08] text-white' : 'text-[var(--muted)]',
              )}
            >
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {pulseOpen && <ArcPulse onClose={() => setPulseOpen(false)} />}
    </header>
  )
}
