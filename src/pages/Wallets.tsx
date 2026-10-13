import { TIP_ADDRESS } from '@/lib/tip'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, ArrowUpRight, Plus, Receipt, Wallet, X } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { MAX_WALLETS, useTrackedWallets, useWalletSnapshots } from '@/hooks/useTrackedWallets'
import { useWalletSnapshotsMainnet } from '@/hooks/useWalletSnapshotsMainnet'
import { compact, explorerAddress, timeAgo } from '@/lib/arcscan'
import { balanceShares } from '@/lib/shares'
import { walletTotals } from '@/lib/pageTotals'
import { NETWORK } from '@/lib/chain'
import { MAINNET_APPS } from '@/data/appRegistries'
import { walletExamples } from '@/lib/walletExamples'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

const TESTNET_EXAMPLES = [
  { label: 'Memo contract', address: '0x5294E9927c3306DcBaDb03fe70b92e01cCede505' },
  { label: 'Pulsarc tip wallet', address: TIP_ADDRESS },
]

const EXAMPLES = walletExamples(NETWORK.id, MAINNET_APPS, TESTNET_EXAMPLES)

const MESSAGES: Record<string, string> = {
  invalid: 'That is not a wallet address. It should start with 0x and be 42 characters long.',
  duplicate: 'You are already tracking that wallet.',
  full: `You can track up to ${MAX_WALLETS} wallets.`,
}

// ─── Testnet-only: wallet list with ArcScan data ──────────────────────────────

interface WalletsContentProps {
  wallets: ReturnType<typeof useTrackedWallets>['wallets']
  add: ReturnType<typeof useTrackedWallets>['add']
  remove: ReturnType<typeof useTrackedWallets>['remove']
}

function WalletsContent({ wallets, add, remove }: WalletsContentProps) {
  const snaps = useWalletSnapshots(wallets.map(w => w.address))

  const rows = wallets.map((w, i) => ({ wallet: w, q: snaps[i] }))
  const loaded = rows.filter(r => r.q?.data)
  const { totalBalance, active24h, txns24h } = walletTotals(loaded.map(r => r.q.data))
  const anyLoading = rows.some(r => r.q?.isLoading)

  const shares = balanceShares(loaded
    .map(r => ({ key: r.wallet.address, name: r.wallet.label || short(r.wallet.address), value: r.q.data?.balance ?? 0 })))

  if (wallets.length === 0) {
    return (
      <Reveal>
        <div className="arc-card px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line-strong)]">
            <Wallet className="h-5 w-5 text-[var(--periwinkle)]" />
          </span>
          <p className="mt-6 text-2xl font-light text-white">Nothing tracked yet</p>
          <p className="mx-auto mt-3 max-w-[420px] text-[var(--muted)]">
            Add a wallet above, or start with one of these to see how it looks.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {EXAMPLES.map(ex => (
              <button key={ex.address} className="arc-btn-ghost" onClick={() => add(ex.address, ex.label)}>
                {ex.label} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      </Reveal>
    )
  }

  return (
    <>
      <section>
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Wallets tracked" value={wallets.length} format={n => Math.round(n).toString()}
            subValue={`of ${MAX_WALLETS} allowed`} icon={Wallet} />
          <StatCard label="USDC held" value={totalBalance} format={n => `$${compact(n, 2)}`}
            subValue="native balance, all tracked" icon={Receipt} isLoading={anyLoading && loaded.length === 0} />
          <StatCard label="Active in 24h" value={active24h} format={n => Math.round(n).toString()}
            subValue="wallets with a transaction" icon={Activity} isLoading={anyLoading && loaded.length === 0} />
          <StatCard label="Transactions · 24h" value={txns24h} format={n => Math.round(n).toString()}
            subValue="latest 50 per wallet" icon={Activity} isLoading={anyLoading && loaded.length === 0} />
        </Reveal>
      </section>

      {shares.length > 1 && (
        <section>
          <Reveal className="arc-card p-5">
            <p className="arc-eyebrow mb-4">Where the USDC sits</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/6">
              {shares.map((s, i) => (
                <div
                  key={s.key}
                  title={`${s.name} · ${s.pct.toFixed(1)}%`}
                  className="h-full border-r border-[#0b182c] last:border-r-0"
                  style={{ width: `${s.pct}%`, background: `rgba(169,196,234,${Math.max(0.22, 1 - i * 0.18)})` }}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-[var(--muted)]">
              {shares.slice(0, 5).map(s => (
                <span key={s.key}><span className="text-white">{s.name}</span> {s.pct.toFixed(1)}%</span>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      <section>
        <Reveal className="arc-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {['Wallet', 'USDC balance', 'Txns 24h', 'Total txns', 'Last active', ''].map((h, i) => (
                    <th key={i} className={`arc-eyebrow !text-[10px] px-5 py-3.5 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ wallet, q }) => {
                  const d = q?.data
                  return (
                    <tr key={wallet.address} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                      <td className="px-5 py-4">
                        <Link to={`/wallet/${wallet.address}`} className="block">
                          <p className="text-[15px] text-white">{wallet.label || d?.name || 'Unlabeled'}</p>
                          <p className="font-['Geist_Mono'] text-[11px] text-[var(--muted)]">
                            {short(wallet.address)}{d?.isContract && ' · contract'}
                          </p>
                        </Link>
                      </td>
                      {q?.isError ? (
                        <td colSpan={4} className="px-5 py-4 text-right text-sm text-[var(--muted)]">
                          Could not read this wallet right now. <button className="underline hover:text-white" onClick={() => void q.refetch()}>Retry</button>
                        </td>
                      ) : !d ? (
                        <td colSpan={4} className="px-5 py-4"><div className="ml-auto h-4 w-48 animate-pulse rounded bg-white/6" /></td>
                      ) : (
                        <>
                          <td className="px-5 py-4 text-right text-sm tabular-nums text-white">${compact(d.balance, 2)}</td>
                          <td className="px-5 py-4 text-right text-sm tabular-nums text-[var(--muted)]">
                            {d.txns24h}{d.txns24hCapped && '+'}
                          </td>
                          <td className="px-5 py-4 text-right text-sm tabular-nums text-[var(--muted)]">{d.txCount.toLocaleString()}</td>
                          <td className="px-5 py-4 text-right text-sm text-[var(--muted)]">{timeAgo(d.lastActive)}</td>
                        </>
                      )}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-3">
                          <a href={explorerAddress(wallet.address)} target="_blank" rel="noreferrer"
                            className="text-[var(--muted)] transition-colors hover:text-white" title="Open in ArcScan">
                            <ArrowUpRight className="h-4 w-4" />
                          </a>
                          <button onClick={() => remove(wallet.address)}
                            className="text-[var(--faint)] transition-colors hover:text-white" title="Stop tracking">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="mt-4 max-w-[640px] text-sm leading-relaxed text-[var(--faint)]">
          Balance is the native USDC balance (the gas token on Arc). "Txns 24h" counts the wallet's latest 50 transactions, so a "+" means it is at least that many. Prices are not shown because testnet USDC has no market price.
        </p>
      </section>
    </>
  )
}

// ─── Mainnet: wallet list from RPC + wallet index (no ArcScan) ────────────────

function WalletsContentMainnet({ wallets, add, remove }: WalletsContentProps) {
  const snaps = useWalletSnapshotsMainnet(wallets.map(w => w.address))

  const rows = wallets.map((w, i) => ({ wallet: w, q: snaps[i] }))
  const loaded = rows.filter(r => r.q?.data)
  const anyLoading = rows.some(r => r.q?.isLoading)

  const totalBalance = loaded.reduce((sum, r) => sum + (r.q.data?.balance ?? 0), 0)

  const shares = balanceShares(loaded
    .map(r => ({ key: r.wallet.address, name: r.wallet.label || short(r.wallet.address), value: r.q.data?.balance ?? 0 })))

  if (wallets.length === 0) {
    return (
      <Reveal>
        <div className="arc-card px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line-strong)]">
            <Wallet className="h-5 w-5 text-[var(--periwinkle)]" />
          </span>
          <p className="mt-6 text-2xl font-light text-white">Nothing tracked yet</p>
          <p className="mx-auto mt-3 max-w-[420px] text-[var(--muted)]">
            Add a wallet above, or start with one of these to see how it looks.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {EXAMPLES.map(ex => (
              <button key={ex.address} className="arc-btn-ghost" onClick={() => add(ex.address, ex.label)}>
                {ex.label} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      </Reveal>
    )
  }

  return (
    <>
      <section>
        {/* Txns 24h and Active in 24h StatCards are hidden on mainnet — data not available */}
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Wallets tracked" value={wallets.length} format={n => Math.round(n).toString()}
            subValue={`of ${MAX_WALLETS} allowed`} icon={Wallet} />
          <StatCard label="USDC held" value={totalBalance} format={n => `$${compact(n, 2)}`}
            subValue="native balance, all tracked" icon={Receipt} isLoading={anyLoading && loaded.length === 0} />
        </Reveal>
      </section>

      {shares.length > 1 && (
        <section>
          <Reveal className="arc-card p-5">
            <p className="arc-eyebrow mb-4">Where the USDC sits</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/6">
              {shares.map((s, i) => (
                <div
                  key={s.key}
                  title={`${s.name} · ${s.pct.toFixed(1)}%`}
                  className="h-full border-r border-[#0b182c] last:border-r-0"
                  style={{ width: `${s.pct}%`, background: `rgba(169,196,234,${Math.max(0.22, 1 - i * 0.18)})` }}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-[var(--muted)]">
              {shares.slice(0, 5).map(s => (
                <span key={s.key}><span className="text-white">{s.name}</span> {s.pct.toFixed(1)}%</span>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      <section>
        <Reveal className="arc-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {/* 'Txns 24h' column removed on mainnet */}
                  {['Wallet', 'USDC balance', 'Sent txns', 'Last active', ''].map((h, i) => (
                    <th key={i} className={`arc-eyebrow !text-[10px] px-5 py-3.5 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ wallet, q }) => {
                  const d = q?.data
                  return (
                    <tr key={wallet.address} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                      <td className="px-5 py-4">
                        <Link to={`/wallet/${wallet.address}`} className="block">
                          <p className="text-[15px] text-white">{wallet.label || 'Unlabeled'}</p>
                          <p className="font-['Geist_Mono'] text-[11px] text-[var(--muted)]">
                            {short(wallet.address)}{d?.isContract && ' · contract'}
                          </p>
                        </Link>
                      </td>
                      {q?.isError ? (
                        <td colSpan={3} className="px-5 py-4 text-right text-sm text-[var(--muted)]">
                          Could not read this wallet right now. <button className="underline hover:text-white" onClick={() => void q.refetch()}>Retry</button>
                        </td>
                      ) : !d ? (
                        <td colSpan={3} className="px-5 py-4"><div className="ml-auto h-4 w-48 animate-pulse rounded bg-white/6" /></td>
                      ) : (
                        <>
                          <td className="px-5 py-4 text-right text-sm tabular-nums text-white">${compact(d.balance, 2)}</td>
                          <td className="px-5 py-4 text-right text-sm tabular-nums text-[var(--muted)]">{d.txCount.toLocaleString()}</td>
                          <td className="px-5 py-4 text-right text-sm text-[var(--muted)]">
                            {d.lastActive ? timeAgo(d.lastActive) : <span className="text-[var(--faint)]">—</span>}
                          </td>
                        </>
                      )}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => remove(wallet.address)}
                            className="text-[var(--faint)] transition-colors hover:text-white" title="Stop tracking">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="mt-4 max-w-[640px] text-sm leading-relaxed text-[var(--faint)]">
          Balance is the native USDC balance from the live Arc Mainnet node. "Sent txns" is the address nonce (transactions sent from this address). "Last active" comes from the wallet index (indexed days only).
        </p>
      </section>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Wallets() {
  const { wallets, add, remove } = useTrackedWallets()
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const isMainnet = NETWORK.id === 5042

  function submit(e: FormEvent) {
    e.preventDefault()
    const result = add(address.trim(), label)
    if (result === 'ok') { setAddress(''); setLabel(''); setProblem(null) }
    else setProblem(MESSAGES[result])
  }

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">{`Wallets · ${NETWORK.name}`}</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[{ text: 'Follow any wallet,' }, { text: 'no account needed.', className: 'text-[var(--periwinkle)]' }]}
          />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            Paste addresses to watch their balance and activity. Your list lives in this browser only — nothing is uploaded.
          </p>
        </section>
      </Reveal>

      <section>
        <Reveal>
          <form onSubmit={submit} className="arc-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Wallet address (0x…)"
              aria-label="Wallet address"
              spellCheck={false}
              className="arc-panel min-w-0 flex-1 px-4 py-3 font-['Geist_Mono'] text-sm text-white outline-none placeholder:font-sans placeholder:text-[var(--faint)] focus:border-[var(--periwinkle)]"
            />
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (optional)"
              aria-label="Wallet label (optional)"
              maxLength={32}
              className="arc-panel px-4 py-3 text-sm text-white outline-none placeholder:text-[var(--faint)] focus:border-[var(--periwinkle)] sm:w-[200px]"
            />
            <button type="submit" className="arc-btn shrink-0">
              <Plus className="h-4 w-4" /> Track
            </button>
          </form>
          {problem && <p className="mt-3 text-sm text-[var(--muted)]">{problem}</p>}
        </Reveal>
      </section>

      {isMainnet ? (
        <WalletsContentMainnet wallets={wallets} add={add} remove={remove} />
      ) : (
        <WalletsContent wallets={wallets} add={add} remove={remove} />
      )}
    </div>
  )
}
