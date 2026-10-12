/**
 * WalletExtras — four additional fact panels for the Pulsarc wallet checker.
 *
 * Panels:
 *   (a) Balances now     — live ERC-20 balances for USDC, EURC, USYC
 *   (b) Arc checklist    — every tracked app as a chip, used ones highlighted
 *   (c) Registered agents — ERC-8004 agents owned by this wallet
 *   (d) Share card       — SVG preview + "Download PNG" button
 *
 * Props match the shape already available on the WalletCheck page.
 * Wire-in:
 *   <WalletExtras address={checkedAddress} net={net} summary={summary} apps={appsConfig} coverage={coverageNote(meta)} />
 */
import { useRef, useState } from 'react'
import type { WalletSummary, AppsConfig } from '@/lib/walletIndex'
import { useAgentsIndex } from '@/hooks/useAgentsIndex'
import { useWalletBalances } from '@/hooks/useWalletBalances'
import { checklist, agentsOwnedBy, formatBalance, shareCardSvg } from '@/lib/walletExtras'
import { svgToPngDataUrl, triggerDownload, downloadFileName } from '@/lib/download'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TokenSpec {
  id: string
  address: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract token anchors (kind === 'token') for the given ids from apps config. */
function tokenSpecsFromApps(
  apps: AppsConfig | null,
  ids: string[],
): TokenSpec[] {
  if (!apps) return []
  const result: TokenSpec[] = []
  for (const id of ids) {
    const app = apps.apps.find(a => a.id === id)
    if (!app) continue
    const anchors = app.anchors as Array<{ address: string; kind: string }>
    const tokenAnchor = anchors.find(a => a.kind === 'token')
    if (tokenAnchor) result.push({ id, address: tokenAnchor.address })
  }
  return result
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="arc-eyebrow mb-4 !text-[10px]">{children}</p>
  )
}

// ── (a) Balances now ───────────────────────────────────────────────────────────

interface BalancesPanelProps {
  address: string
  net: 'mainnet' | 'testnet'
  tokens: TokenSpec[]
  // Pre-computed set of token ids that have a known address
  knownIds: Set<string>
}

function BalancesPanel({ address, net, tokens, knownIds }: BalancesPanelProps) {
  const { data, isLoading, isError } = useWalletBalances(address, net, tokens)

  const TOKEN_LABELS: Record<string, string> = {
    usdc: 'USDC',
    eurc: 'EURC',
    usyc: 'USYC',
  }

  const ALL_IDS = ['usdc', 'eurc', 'usyc']

  return (
    <section className="arc-card p-6 sm:p-8">
      <SectionHeading>Balances now</SectionHeading>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ALL_IDS.map(id => {
          if (!knownIds.has(id)) return null

          const label = TOKEN_LABELS[id] ?? id.toUpperCase()
          const entry = data?.find(b => b.id === id)

          let valueNode: React.ReactNode

          if (isLoading) {
            valueNode = (
              <div className="mt-2 h-7 w-28 animate-pulse rounded bg-white/[0.08]" />
            )
          } else if (isError || (data && !entry)) {
            valueNode = (
              <p className="mt-2 text-sm text-[var(--muted)]">unavailable</p>
            )
          } else if (entry) {
            valueNode = (
              <p className="mt-2 text-[22px] font-light leading-none tracking-tight tabular-nums text-white">
                {formatBalance(entry.raw, entry.decimals)}
              </p>
            )
          } else {
            valueNode = (
              <p className="mt-2 text-sm text-[var(--muted)]">unavailable</p>
            )
          }

          return (
            <div key={id}>
              <p className="arc-eyebrow !text-[10px]">{label}</p>
              {valueNode}
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-[var(--faint)]">
        Live on-chain balance at time of page load. Refresh to update.
      </p>
    </section>
  )
}

// ── (b) Arc checklist ──────────────────────────────────────────────────────────

interface ChecklistPanelProps {
  usedAppIds: string[]
  apps: AppsConfig | null
}

function ChecklistPanel({ usedAppIds, apps }: ChecklistPanelProps) {
  if (!apps) {
    return (
      <section className="arc-card p-6 sm:p-8">
        <SectionHeading>Arc checklist</SectionHeading>
        <p className="text-sm text-[var(--muted)]">Apps config not available.</p>
      </section>
    )
  }

  const items = checklist(usedAppIds, apps.apps)
  const usedCount = items.filter(i => i.used).length
  const totalCount = items.length

  return (
    <section className="arc-card p-6 sm:p-8">
      <SectionHeading>Arc checklist</SectionHeading>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <span
            key={item.id}
            className={
              item.used
                ? 'rounded border border-[var(--periwinkle)] bg-white/[0.08] px-2.5 py-1 font-[\'Geist_Mono\'] text-xs text-white'
                : 'rounded border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 font-[\'Geist_Mono\'] text-xs text-[var(--muted)]'
            }
          >
            {item.id}
          </span>
        ))}
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">
        {usedCount} of {totalCount} tracked apps used
      </p>
    </section>
  )
}

// ── (c) Registered agents ──────────────────────────────────────────────────────

interface AgentsPanelProps {
  address: string
  net: 'mainnet' | 'testnet'
}

function AgentsPanel({ address, net }: AgentsPanelProps) {
  const { data, isPending, isError } = useAgentsIndex(net)

  if (isPending) {
    return (
      <section className="arc-card p-6 sm:p-8">
        <SectionHeading>Registered agents</SectionHeading>
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-5 w-48 animate-pulse rounded bg-white/[0.07]" />
          ))}
        </div>
      </section>
    )
  }

  if (isError || !data) {
    return (
      <section className="arc-card p-6 sm:p-8">
        <SectionHeading>Registered agents</SectionHeading>
        <p className="text-sm text-[var(--muted)]">Could not load agent registry.</p>
      </section>
    )
  }

  const owned = agentsOwnedBy(address, data.agents)

  return (
    <section className="arc-card p-6 sm:p-8">
      <SectionHeading>Registered agents</SectionHeading>
      {owned.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No registered agent owned by this wallet.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {owned.map(agent => (
              <li key={agent.id} className="flex items-baseline gap-2">
                <span className="font-['Geist_Mono'] text-xs text-[var(--muted)]">
                  #{agent.id}
                </span>
                <span className="text-sm text-white">
                  {agent.name ?? <span className="text-[var(--muted)]">(unnamed)</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-[var(--faint)]">
            Measured by owner wallet; an agent&apos;s own transaction wallet is not visible here.
          </p>
        </>
      )}
    </section>
  )
}

// ── (d) Share card ─────────────────────────────────────────────────────────────

interface ShareCardPanelProps {
  address: string
  net: 'mainnet' | 'testnet'
  summary: WalletSummary
  apps: AppsConfig | null
  coverage: string
}

function ShareCardPanel({ address, net, summary, apps, coverage }: ShareCardPanelProps) {
  const svgRef = useRef<HTMLDivElement>(null)
  const [pngError, setPngError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const appsTracked = apps?.apps.length ?? 0

  const LOCALE = 'en-US' as const
  const firstSeenStr = summary.firstSeen.toLocaleDateString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

  const svgString = shareCardSvg({
    address,
    net,
    firstSeen: firstSeenStr,
    activeDays: summary.activeDays,
    tx: summary.tx,
    usdcSent: summary.usdcSent,
    usdcReceived: summary.usdcReceived,
    appsUsed: summary.apps.length,
    appsTracked,
    coverage,
  })

  async function handleDownload() {
    if (!svgRef.current) return
    const svgEl = svgRef.current.querySelector('svg')
    if (!svgEl) {
      setPngError('SVG element not found.')
      return
    }
    setIsDownloading(true)
    setPngError(null)
    try {
      const dataUrl = await svgToPngDataUrl(svgEl as SVGSVGElement)
      triggerDownload(dataUrl, downloadFileName('wallet-card', net, new Date(), 'png'))
    } catch (err) {
      setPngError(err instanceof Error ? err.message : 'PNG export failed.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <section className="arc-card p-6 sm:p-8">
      <SectionHeading>Share card</SectionHeading>

      {/* SVG preview — explicit CSS max-w-full so it scales in narrow containers */}
      <div
        ref={svgRef}
        className="max-w-full overflow-hidden rounded-lg"
        style={{ lineHeight: 0 }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svgString }}
      />

      <div className="mt-4 flex items-center gap-4">
        <button
          className="arc-btn text-sm"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? 'Exporting…' : 'Download PNG'}
        </button>
        {pngError && (
          <p className="text-xs text-[var(--muted)]">{pngError}</p>
        )}
      </div>
    </section>
  )
}

// ── WalletExtras (named export) ────────────────────────────────────────────────

export interface WalletExtrasProps {
  address: string
  net: 'mainnet' | 'testnet'
  summary: WalletSummary
  apps: AppsConfig | null
  coverage: string
}

export function WalletExtras({ address, net, summary, apps, coverage }: WalletExtrasProps) {
  const TOKEN_IDS = ['usdc', 'eurc', 'usyc']
  const tokenSpecs = tokenSpecsFromApps(apps, TOKEN_IDS)
  const knownIds = new Set(tokenSpecs.map(t => t.id))

  return (
    <div className="space-y-6">
      <BalancesPanel
        address={address}
        net={net}
        tokens={tokenSpecs}
        knownIds={knownIds}
      />
      <ChecklistPanel usedAppIds={summary.apps} apps={apps} />
      <AgentsPanel address={address} net={net} />
      <ShareCardPanel
        address={address}
        net={net}
        summary={summary}
        apps={apps}
        coverage={coverage}
      />
    </div>
  )
}
