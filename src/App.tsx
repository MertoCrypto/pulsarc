import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { NetworkBar } from '@/components/layout/NetworkBar'
import { startSmoothScroll } from '@/lib/smoothScroll'
import { PageTransition } from '@/components/layout/PageTransition'
import { TipBox } from '@/components/interact/TipBox'
import { GmButton } from '@/components/interact/GmButton'
import { NewAndRising } from '@/components/shared/NewAndRising'
import { EcosystemDominance } from '@/components/shared/EcosystemDominance'
import { Rankings } from '@/pages/Rankings'
import { Network } from '@/pages/Network'
import { Tokens } from '@/pages/Tokens'
import { Wallets } from '@/pages/Wallets'
import { DeployStudio } from '@/pages/DeployStudio'
import { DApp } from '@/pages/DApp'
import { Compare } from '@/pages/Compare'
import { Trends } from '@/pages/Trends'
import { NFTs } from '@/pages/NFTs'
import { Agents } from '@/pages/Agents'
import { LeaderboardV2 } from '@/pages/LeaderboardV2'
import { WalletProfile } from '@/pages/WalletProfile'
import { Method } from '@/pages/Method'
import { Brand } from '@/pages/Brand'

function Layout() {
  useEffect(() => startSmoothScroll(), [])
  // the home hero runs edge to edge, so the sidebar starts underneath it
  const home = useLocation().pathname === '/'

  return (
    <div className="min-h-dvh">
      <NetworkBar />

      {/* Page content */}
      <main className="max-w-[1400px] mx-auto px-6 pt-[144px] pb-16 lg:pt-[100px]">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <PageTransition>
              {(location) => (
              <Routes location={location}>
                <Route path="/" element={<Rankings />} />
                <Route path="/dapp/:id" element={<DApp />} />
                <Route path="/network" element={<Network />} />
                <Route path="/tokens" element={<Tokens />} />
                <Route path="/wallets" element={<Wallets />} />
                <Route path="/deploy" element={<DeployStudio />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/trends" element={<Trends />} />
                <Route path="/nfts" element={<NFTs />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/leaderboard" element={<LeaderboardV2 />} />
                <Route path="/wallet/:address" element={<WalletProfile />} />
                <Route path="/method" element={<Method />} />
                <Route path="/brand" element={<Brand />} />
              </Routes>
              )}
            </PageTransition>
          </div>

          {/* Sidebar — hidden on mobile/tablet */}
          <aside className="hidden xl:block w-64 shrink-0" style={home ? { paddingTop: 'calc(var(--hero-h) + 2rem)' } : undefined}>
            <div className="sticky top-[92px] space-y-4">
              <GmButton variant="hero" />
              <EcosystemDominance />
              <NewAndRising />
              <TipBox />
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-8 text-[13px] leading-relaxed text-[var(--faint)] md:flex-row md:items-start md:justify-between">
          <p className="max-w-[640px]">
            Pulsarc is an independent project built on Arc Network. It is not affiliated with, endorsed by or sponsored by Circle Internet Group, Inc. Arc is a trademark of Circle Internet Group, Inc. and/or its affiliates. Other names and logos shown, such as those of apps and assets listed on Arc Portal, belong to their respective owners and imply no affiliation or endorsement.
          </p>
          <nav className="flex shrink-0 gap-5">
            <Link to="/method" className="transition-colors hover:text-white">Method</Link>
            <a href="https://github.com/MertoCrypto/pulsarc" target="_blank" rel="noreferrer" className="transition-colors hover:text-white">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
