import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { NetworkBar } from '@/components/layout/NetworkBar'
import { startSmoothScroll } from '@/lib/smoothScroll'
import { PageTransition } from '@/components/layout/PageTransition'
import { TipBox } from '@/components/interact/TipBox'
import { NewAndRising } from '@/components/shared/NewAndRising'
import { EcosystemDominance } from '@/components/shared/EcosystemDominance'
import { Rankings } from '@/pages/Rankings'
import { Network } from '@/pages/Network'
import { Tokens } from '@/pages/Tokens'
import { Wallets } from '@/pages/Wallets'
import { DeployStudio } from '@/pages/DeployStudio'
import { GmButton } from '@/components/interact/GmButton'
import { DApp } from '@/pages/DApp'
import { Compare } from '@/pages/Compare'
import { Trends } from '@/pages/Trends'
import { NFTs } from '@/pages/NFTs'
import { Agents } from '@/pages/Agents'
import { LeaderboardV2 } from '@/pages/LeaderboardV2'
import { WalletProfile } from '@/pages/WalletProfile'
import { Method } from '@/pages/Method'

function Layout() {
  useEffect(() => startSmoothScroll(), [])

  return (
    <div className="min-h-dvh">
      <NetworkBar />

      {/* Page content */}
      <main className="max-w-[1400px] mx-auto px-6 pt-[136px] pb-16 lg:pt-[92px]">
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
              </Routes>
              )}
            </PageTransition>
          </div>

          {/* Sidebar — hidden on mobile/tablet */}
          <aside className="hidden xl:block w-64 shrink-0">
            <div className="sticky top-[92px] space-y-4">
              <GmButton variant="hero" />
              <EcosystemDominance />
              <NewAndRising />
              <TipBox />
            </div>
          </aside>
        </div>
      </main>
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
