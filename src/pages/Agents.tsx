import { useMemo, useState } from 'react'
import { ArrowUpRight, Bot, Briefcase, ShieldCheck, Users } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { AGENTIC_COMMERCE, IDENTITY_REGISTRY, VALIDATION_REGISTRY, useAgents } from '@/hooks/useAgents'
import { count, explorerAddress } from '@/lib/arcscan'
import { Link } from 'react-router-dom'
import { NETWORK } from '@/lib/chain'
import { useAgentsIndex } from '@/hooks/useAgentsIndex'
import { useAppsLatest } from '@/hooks/useAppsLatest'
import { AgentsIndexSection, AgentsIndexSkeleton } from '@/components/agents/AgentsIndexSection'
import { RegistryActivityTiles } from '@/components/agents/RegistryActivityTiles'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

const net = NETWORK.id === 5042 ? 'mainnet' : 'testnet'

export function Agents() {
  const { data, isLoading, error } = useAgents()
  const [onlyProfiles, setOnlyProfiles] = useState(true)

  // Indexer data — called unconditionally (rules of hooks)
  const { data: indexData, isLoading: indexLoading } = useAgentsIndex(net)
  const { data: appsSnap } = useAppsLatest(net)

  const agents = useMemo(
    () => (data?.agents ?? []).filter(a => !onlyProfiles || a.name || a.description),
    [data, onlyProfiles],
  )

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Agents · Arc Testnet</p>
          <SplitLines as="h1" className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[{ text: 'The agent economy,' }, { text: 'read from the registry.', className: 'text-[var(--periwinkle)]' }]} />
          <p className="mt-6 max-w-[580px] text-lg font-light leading-relaxed text-[var(--muted)]">
            AI agents that register an onchain identity (ERC-8004) and get paid in USDC. Every number below comes from the registry contracts themselves.
          </p>
        </section>
      </Reveal>

      {/* ── Existing stat cards (ArcScan) ── */}
      <section>
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Agents registered" value={data?.newestId ?? 0} format={n => count(n, 2)} subValue="highest agent ID so far" icon={Bot} isLoading={isLoading} />
          <StatCard label="Owners" value={data?.owners ?? 0} format={n => count(n, 1)} subValue="wallets holding an agent" icon={Users} isLoading={isLoading} />
          <StatCard label="Validations" value={data?.validationTxs ?? 0} format={n => count(n, 1)} subValue="calls to the validation registry" icon={ShieldCheck} isLoading={isLoading} />
          <StatCard label="Agent jobs" value={data?.commerceTxs ?? 0} format={n => count(n, 1)} subValue="calls to ERC-8183 commerce" icon={Briefcase} isLoading={isLoading} />
        </Reveal>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
          {([['Identity registry', IDENTITY_REGISTRY], ['Validation registry', VALIDATION_REGISTRY], ['Agentic commerce', AGENTIC_COMMERCE]] as const).map(([label, addr]) => (
            <a key={addr} href={explorerAddress(addr)} target="_blank" rel="noreferrer" className="arc-btn-ghost !px-3 !py-1.5 !text-xs">
              {label} <ArrowUpRight className="h-3 w-3" />
            </a>
          ))}
          <Link to="/dapp/erc8004" className="arc-btn-ghost !px-3 !py-1.5 !text-xs">Registry activity <ArrowUpRight className="h-3 w-3" /></Link>
        </div>
      </section>

      {/* ── Registry activity tiles (indexer) ── */}
      <RegistryActivityTiles snap={appsSnap} />

      {/* ── Existing latest registrations (ArcScan) ── */}
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="arc-eyebrow">Latest registrations</p>
          <button className="arc-chip" data-active={onlyProfiles} onClick={() => setOnlyProfiles(v => !v)}>Only agents with a profile</button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="arc-card h-[170px] animate-pulse" />)}</div>
        ) : error ? (
          <p className="arc-panel px-4 py-3 text-sm text-[var(--muted)]">ArcScan did not answer. It will retry on its own.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {agents.slice(0, 24).map(a => (
              <Reveal key={a.id} className="arc-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[19px] font-light text-white">{a.name ?? `Agent #${a.id}`}</p>
                    <p className="arc-eyebrow mt-1 !text-[10px] !normal-case">#{a.id} · {short(a.owner)}</p>
                  </div>
                  <span className="flex shrink-0 gap-2 text-[11px] text-[var(--muted)]">
                    {a.x402 && <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5">x402</span>}
                    {a.active === false && <span className="rounded-full border border-[var(--line)] px-2 py-0.5">inactive</span>}
                  </span>
                </div>
                {a.description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[var(--muted)]">{a.description}</p>}
                {a.services.length > 0 && (
                  <p className="mt-3 text-xs text-[var(--faint)]">Services: {a.services.map(s => s.name).join(' · ')}</p>
                )}
                {a.tags.length > 0 && (
                  <p className="mt-auto pt-4 font-['Geist_Mono'] text-[11px] text-[var(--faint)]">{a.tags.map(t => `#${t}`).join('  ')}</p>
                )}
              </Reveal>
            ))}
          </div>
        )}
        <p className="mt-4 max-w-[640px] text-sm leading-relaxed text-[var(--faint)]">
          Profiles are written by whoever registers the agent and are not verified — treat them as claims, not facts. Many registrations have no profile at all, which is why that filter is on by default.
        </p>
      </section>

      {/* ── Registered agents (indexer) ── */}
      {indexLoading ? (
        <AgentsIndexSkeleton />
      ) : indexData ? (
        <AgentsIndexSection data={indexData} />
      ) : null}
    </div>
  )
}
