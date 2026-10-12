/**
 * Answers pages — index (/answers) and detail (/answers/:slug).
 *
 * Route wiring (add to your router):
 *   <Route path="/answers" element={<Answers />} />
 *   <Route path="/answers/:slug" element={<AnswerPage />} />
 *
 * Runtime deps needed (install before use):
 *   bun add react-router-dom recharts
 */
import { useParams, Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { ExternalLink, ArrowLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useLatest } from '@/hooks/useLatest'
import { useSupply } from '@/hooks/useExtras'
import { ANSWERS, answerValue, answerSeries } from '@/lib/answers'
import type { AgentsFile } from '@/lib/answers'
import { parseBalances } from '@/lib/balances'
import type { BalancesDoc } from '@/lib/balances'
import { NETWORK } from '@/lib/chain'

// ── Network helper ─────────────────────────────────────────────────────────────

const net: 'mainnet' | 'testnet' = NETWORK.id === 5042 ? 'mainnet' : 'testnet'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

function sourceUrl(sourceFile: 'latest.json' | 'supply.json' | 'agents.json' | 'balances.json'): string {
  return `${BASE}/${net}/${sourceFile}`
}

function parseAgentsFile(json: unknown): AgentsFile | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  if (typeof j['count'] !== 'number' || !isFinite(j['count'])) return null
  if (!Array.isArray(j['agents'])) return null
  return json as AgentsFile
}

// agents.json is ~400 KB on mainnet but ~27 MB on testnet (and not caught up there),
// so the agent answers exist on mainnet only.
function hasAnswer(def: { sourceFile: string }, network: 'mainnet' | 'testnet'): boolean {
  return def.sourceFile !== 'agents.json' || network === 'mainnet'
}

function useAgentsFile(network: 'mainnet' | 'testnet') {
  return useQuery({
    enabled: network === 'mainnet',
    queryKey: ['agents-json', network],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<AgentsFile | null> => {
      const res = await fetch(`${BASE}/${network}/agents.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseAgentsFile(json)
    },
  })
}

function useBalancesFile(network: 'mainnet' | 'testnet') {
  return useQuery<BalancesDoc | null>({
    queryKey: ['balances-json', network],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<BalancesDoc | null> => {
      const res = await fetch(`${BASE}/${network}/balances.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseBalances(json)
    },
  })
}

// ── Loading placeholder ────────────────────────────────────────────────────────

function PulsePlaceholder() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="arc-card h-16 animate-pulse" />
      ))}
    </div>
  )
}

// ── Answers index page (/answers) ─────────────────────────────────────────────

export function Answers() {
  const { data: latest, isLoading: latestLoading } = useLatest(net)
  const { data: supply, isLoading: supplyLoading } = useSupply(net)
  const { data: agents, isLoading: agentsLoading } = useAgentsFile(net)
  const { data: balances, isLoading: balancesLoading } = useBalancesFile(net)

  const isLoading = latestLoading || supplyLoading || agentsLoading || balancesLoading

  return (
    <div className="space-y-14">
      {/* Header */}
      <section className="pt-4">
        <p className="arc-eyebrow mb-5">Answers</p>
        <h1 className="arc-display text-[clamp(34px,4.3vw,60px)] text-white">
          Arc by the numbers
        </h1>
        <p className="mt-6 max-w-[580px] text-lg font-light leading-relaxed text-[var(--muted)]">
          One question, one number, one method. Each answer pulls directly from
          the live indexer data (Arc {net}).
        </p>
      </section>

      {/* Cards */}
      {isLoading ? (
        <PulsePlaceholder />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ANSWERS.filter(def => hasAnswer(def, net)).map(def => {
            const result = answerValue(def.slug, latest ?? null, supply ?? null, agents ?? null, balances ?? null)
            return (
              <Link
                key={def.slug}
                to={`/answers/${def.slug}`}
                className="arc-card flex flex-col gap-3 px-5 py-5 transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--periwinkle)]"
              >
                <p className="text-xs uppercase tracking-wider text-[var(--faint)]">
                  {def.slug}
                </p>
                <p className="text-sm leading-snug text-[var(--muted)]">
                  {def.question}
                </p>
                {result ? (
                  <p className="font-['Geist_Mono'] text-2xl font-semibold text-white">
                    {result.value}
                  </p>
                ) : (
                  <p className="text-sm italic text-[var(--faint)]">
                    Data not available right now
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Answer detail page (/answers/:slug) ───────────────────────────────────────

export function AnswerPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: latest, isLoading: latestLoading } = useLatest(net)
  const { data: supply, isLoading: supplyLoading } = useSupply(net)
  const { data: agents, isLoading: agentsLoading } = useAgentsFile(net)
  const { data: balances, isLoading: balancesLoading } = useBalancesFile(net)

  const isLoading = latestLoading || supplyLoading || agentsLoading || balancesLoading

  const def = ANSWERS.find(a => a.slug === slug && hasAnswer(a, net))

  // Unknown slug
  if (!def) {
    return (
      <div className="space-y-8 pt-4">
        <p className="text-[var(--muted)]">No such answer.</p>
        <Link
          to="/answers"
          className="arc-btn-ghost inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All answers
        </Link>
      </div>
    )
  }

  const result = answerValue(def.slug, latest ?? null, supply ?? null, agents ?? null, balances ?? null)
  const series = answerSeries(def.slug, latest ?? null, supply ?? null, agents ?? null, balances ?? null)

  return (
    <div className="space-y-12">
      {/* Header */}
      <section className="pt-4">
        <p className="arc-eyebrow mb-5">Answers</p>
        <h1 className="arc-display text-[clamp(28px,3.8vw,52px)] text-white">
          {def.question}
        </h1>
        <p className="mt-4 max-w-[520px] text-base leading-relaxed text-[var(--muted)]">
          {def.short}
        </p>
      </section>

      {/* Big number */}
      {isLoading ? (
        <PulsePlaceholder />
      ) : (
        <div className="arc-card px-6 py-6">
          {result ? (
            <div>
              <p className="font-['Geist_Mono'] text-[clamp(36px,5vw,72px)] font-bold leading-none text-white">
                {result.value}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">{result.detail} · Arc {net}</p>
            </div>
          ) : (
            <p className="text-sm italic text-[var(--faint)]">
              Data not available right now
            </p>
          )}
        </div>
      )}

      {/* Chart */}
      {!isLoading && series && series.points.length > 0 && (
        <div className="arc-card px-4 py-5">
          <p className="arc-eyebrow mb-4">Last {series.points.length} hours</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart
              data={series.points}
              margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="0"
                stroke="rgba(170,196,234,0.1)"
                vertical={false}
              />
              <XAxis dataKey="label" hide />
              <YAxis hide width={0} />
              <Tooltip
                contentStyle={{ background: '#10213b', border: '1px solid rgba(170,196,234,0.28)', borderRadius: 12, color: '#eaf1fb' }}
                labelFormatter={v => String(v)}
                formatter={(v) => [v === null || v === undefined ? '—' : `${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 }).format(Number(v))} ${series.unit}`, 'value']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#a9c4ea"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-1 text-right text-xs text-[var(--faint)]">
            Unit: {series.unit}
          </p>
        </div>
      )}

      {/* Method */}
      <div className="arc-card px-5 py-5 space-y-3">
        <p className="arc-eyebrow">Method</p>
        <p className="text-sm leading-relaxed text-[var(--muted)]">{def.method}</p>
      </div>

      {/* Source link */}
      <div className="arc-card px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--faint)]">Source file</p>
        <a
          href={sourceUrl(def.sourceFile)}
          target="_blank"
          rel="noreferrer"
          className="arc-btn-ghost inline-flex items-center gap-2 text-sm"
        >
          {def.sourceFile}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Back link */}
      <Link
        to="/answers"
        className="arc-btn-ghost inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All answers
      </Link>
    </div>
  )
}
