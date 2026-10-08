import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, ArrowUpRight, Plus, Receipt, Wallet, X } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { StatCard } from '@/components/shared/StatCard'
import { MAX_WALLETS, useTrackedWallets, useWalletSnapshots } from '@/hooks/useTrackedWallets'
import { compact, explorerAddress, timeAgo } from '@/lib/arcscan'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

const EXAMPLES = [
  { label: 'Memo contract', address: '0x5294E9927c3306DcBaDb03fe70b92e01cCede505' },
  { label: 'Pulsarc tip wallet', address: '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42' },
]

const MESSAGES: Record<string, string> = {
  invalid: 'That is not a wallet address. It should start with 0x and be 42 characters long.',
  duplicate: 'You are already tracking that wallet.',
  full: `You can track up to ${MAX_WALLETS} wallets.`,
}

export function Wallets() {
  const { wallets, add, remove } = useTrackedWallets()
  const snaps = useWalletSnapshots(wallets.map(w => w.address))
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const result = add(address.trim(), label)
    if (result === 'ok') { setAddress(''); setLabel(''); setProblem(null) }
    else setProblem(MESSAGES[result])
  }

  const rows = wallets.map((w, i) => ({ wallet: w, q: snaps[i] }))
  const loaded = rows.filter(r => r.q?.data)
  const totalBalance = loaded.reduce((s, r) => s + (r.q.data?.balance ?? 0), 0)
  const active24h = loaded.filter(r => (r.q.data?.txns24h ?? 0) > 0).length
  const txns24h = loaded.reduce((s, r) => s + (r.q.data?.txns24h ?? 0), 0)
  const anyLoading = rows.some(r => r.q?.isLoading)

  const shares = useMemo(() => {
    const items = loaded
      .map(r => ({ key: r.wallet.address, name: r.wallet.label || short(r.wallet.address), value: r.q.data?.balance ?? 0 }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value)
    const total = items.reduce((s, x) => s + x.value, 0)
    return items.map(x => ({ ...x, pct: total ? (x.value / total) * 100 : 0 }))
  }, [loaded])

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Wallets · Arc Testnet</p>
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
              spellCheck={false}
              className="arc-panel min-w-0 flex-1 px-4 py-3 font-['Geist_Mono'] text-sm text-white outline-none placeholder:font-sans placeholder:text-[var(--faint)] focus:border-[var(--periwinkle)]"
            />
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (optional)"
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

      {wallets.length === 0 ? (
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
      ) : (
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
              Balance is the native USDC balance (Arc's gas token). "Txns 24h" counts the wallet's latest 50 transactions, so a "+" means it is at least that many. Prices are not shown because testnet USDC has no market price.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
