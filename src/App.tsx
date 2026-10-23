import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { NetworkBar } from '@/components/layout/NetworkBar'
import { startSmoothScroll } from '@/lib/smoothScroll'
import { usePageMeta } from '@/hooks/usePageMeta'
import { PageTransition } from '@/components/layout/PageTransition'
import { RouteErrorBoundary } from '@/components/layout/RouteErrorBoundary'
import { TipBox } from '@/components/interact/TipBox'
import { GmButton } from '@/components/interact/GmButton'
import { NewAndRising } from '@/components/shared/NewAndRising'
import { EcosystemDominance } from '@/components/shared/EcosystemDominance'

// Each page is its own chunk, so the first visit only downloads the page it opens.
const Rankings    = lazy(() => import('@/pages/Rankings').then(m => ({ default: m.Rankings })))
const Network     = lazy(() => import('@/pages/Network').then(m => ({ default: m.Network })))
const Tokens      = lazy(() => import('@/pages/Tokens').then(m => ({ default: m.Tokens })))
const Wallets     = lazy(() => import('@/pages/Wallets').then(m => ({ default: m.Wallets })))
const DeployStudio = lazy(() => import('@/pages/DeployStudio').then(m => ({ default: m.DeployStudio })))
// Local-only: the import is behind import.meta.env.DEV so production builds never bundle it.
const LocalDeploy = import.meta.env.DEV ? lazy(() => import('@/pages/LocalDeploy').then(m => ({ default: m.LocalDeploy }))) : null
const DApp        = lazy(() => import('@/pages/DApp').then(m => ({ default: m.DApp })))
const Compare     = lazy(() => import('@/pages/Compare').then(m => ({ default: m.Compare })))
const Trends      = lazy(() => import('@/pages/Trends').then(m => ({ default: m.Trends })))
const MapPage     = lazy(() => import('@/pages/Map').then(m => ({ default: m.MapPage })))
const Defi        = lazy(() => import('@/pages/Defi').then(m => ({ default: m.Defi })))
const NFTs        = lazy(() => import('@/pages/NFTs').then(m => ({ default: m.NFTs })))
const Agents      = lazy(() => import('@/pages/Agents').then(m => ({ default: m.Agents })))
const LeaderboardV2 = lazy(() => import('@/pages/LeaderboardV2').then(m => ({ default: m.LeaderboardV2 })))
const WalletProfile = lazy(() => import('@/pages/WalletProfile').then(m => ({ default: m.WalletProfile })))
const WalletCheck = lazy(() => import('@/pages/WalletCheck').then(m => ({ default: m.WalletCheck })))
const Method      = lazy(() => import('@/pages/Method').then(m => ({ default: m.Method })))
const Brand       = lazy(() => import('@/pages/Brand').then(m => ({ default: m.Brand })))
const Digest      = lazy(() => import('@/pages/Digest').then(m => ({ default: m.Digest })))
const Status      = lazy(() => import('@/pages/Status').then(m => ({ default: m.Status })))
const Discover    = lazy(() => import('@/pages/Discover').then(m => ({ default: m.Discover })))
const Answers     = lazy(() => import('@/pages/Answers').then(m => ({ default: m.Answers })))
const AnswerPage  = lazy(() => import('@/pages/Answers').then(m => ({ default: m.AnswerPage })))
const NotFound    = lazy(() => import('@/pages/NotFound').then(m => ({ default: m.NotFound })))

function Layout() {
  usePageMeta()
  useEffect(() => startSmoothScroll(), [])
  // the home hero runs edge to edge, so the sidebar starts underneath it
  const home = useLocation().pathname === '/'

  return (
    <div className="min-h-dvh">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--periwinkle)] focus:px-4 focus:py-2 focus:text-sm focus:text-[#0a1424]">Skip to content</a>
      <NetworkBar />

      {/* Page content */}
      <main id="main-content" tabIndex={-1} className="max-w-[1400px] mx-auto px-6 pt-[144px] pb-16 sm:pt-[156px] lg:pt-[112px]">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <PageTransition>
              {(location) => (
              <RouteErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={
                <div className="min-h-[40vh]">
                  <div className="arc-card h-24 animate-pulse" />
                </div>
              }>
                <Routes location={location}>
                  <Route path="/" element={<Rankings />} />
                  <Route path="/dapp/:id" element={<DApp />} />
                  <Route path="/network" element={<Network />} />
                  <Route path="/tokens" element={<Tokens />} />
                  <Route path="/wallets" element={<Wallets />} />
                  <Route path="/deploy" element={<DeployStudio />} />
                  {LocalDeploy && <Route path="/deploy-local" element={<LocalDeploy />} />}
                  <Route path="/compare" element={<Compare />} />
                  <Route path="/trends" element={<Trends />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/defi" element={<Defi />} />
                  <Route path="/nfts" element={<NFTs />} />
                  <Route path="/agents" element={<Agents />} />
                  <Route path="/leaderboard" element={<LeaderboardV2 />} />
                  <Route path="/wallet/:address" element={<WalletProfile />} />
                  <Route path="/method" element={<Method />} />
                  <Route path="/brand" element={<Brand />} />
                  <Route path="/digest" element={<Digest />} />
                  <Route path="/status" element={<Status />} />
                  <Route path="/discover" element={<Discover />} />
                  <Route path="/check" element={<WalletCheck />} />
                  <Route path="/answers" element={<Answers />} />
                  <Route path="/answers/:slug" element={<AnswerPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </RouteErrorBoundary>
              )}
            </PageTransition>
          </div>

          {/* Sidebar — hidden on mobile/tablet */}
          <aside className="hidden xl:block w-64 shrink-0" style={home ? { paddingTop: 'calc(var(--hero-h) + 2rem)' } : undefined}>
            <div className="sticky top-[104px] space-y-4">
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
