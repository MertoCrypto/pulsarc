import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, Copy, Plus } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { AppLogoBadge, CategoryBadge } from '@/components/shared/Badge'
import { useWalletProfile } from '@/hooks/useWalletProfile'
import { useTrackedWallets, useWalletSnapshots } from '@/hooks/useTrackedWallets'
import { compact, explorerAddress, isAddress, timeAgo } from '@/lib/arcscan'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

function Fact({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div>
      <p className="arc-eyebrow !text-[10px]">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-white/8" />
      ) : (
        <p className="mt-2 text-[28px] font-light leading-none tracking-tight tabular-nums text-white">{value}</p>
      )}
    </div>
  )
}

export function WalletProfile() {
  const { address = '' } = useParams<{ address: string }>()
  const valid = isAddress(address)
  const { profile } = useWalletProfile(valid ? address : null)
  const [snap] = useWalletSnapshots(valid ? [address] : [])
  const { wallets, add, remove } = useTrackedWallets()
  const [copied, setCopied] = useState(false)

  if (!valid) {
    return (
      <div className="flex flex-col items-center gap-4 py-32 text-center">
        <p className="text-xl font-light text-white">That is not a wallet address.</p>
        <Link to="/wallets" className="arc-btn-ghost">Back to Wallets</Link>
      </div>
    )
  }

  const tracked = wallets.some(w => w.address.toLowerCase() === address.toLowerCase())
  const d = snap?.data

  function copy() {
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="space-y-10">
      <Link to="/wallets" className="inline-flex items-center gap-2 text-sm text-[var(--muted)] transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Wallets
      </Link>

      <Reveal>
        <section className="arc-card p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="arc-eyebrow mb-3">{d?.isContract ? 'Contract' : 'Wallet'} · Arc Testnet</p>
              <div className="flex items-center gap-3">
                <h1 className="font-['Geist_Mono'] text-xl text-white sm:text-2xl">{short(address)}</h1>
                <button onClick={copy} className="text-[var(--muted)] transition-colors hover:text-white" title="Copy address">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              {d?.name && <p className="mt-2 text-[var(--muted)]">{d.name}</p>}
            </div>

            <div className="flex gap-3">
              <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="arc-btn-ghost">
                ArcScan <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
              {tracked ? (
                <button className="arc-btn-ghost" onClick={() => remove(address)}>Stop tracking</button>
              ) : (
                <button className="arc-btn" onClick={() => add(address, '')}>
                  <Plus className="h-4 w-4" /> Track
                </button>
              )}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-6 border-t border-[var(--line)] pt-6 lg:grid-cols-4">
            <Fact label="USDC balance" value={d ? `$${compact(d.balance, 2)}` : '—'} loading={snap?.isLoading} />
            <Fact label="Transactions" value={d ? d.txCount.toLocaleString() : '—'} loading={snap?.isLoading} />
            <Fact label="Token transfers" value={d ? d.transferCount.toLocaleString() : '—'} loading={snap?.isLoading} />
            <Fact label="Last active" value={d ? timeAgo(d.lastActive) : '—'} loading={snap?.isLoading} />
          </div>
          {snap?.isError && <p className="mt-5 text-sm text-[var(--muted)]">ArcScan did not answer for this address.</p>}
        </section>
      </Reveal>

      <Reveal delay={0.05}>
        <section>
          <p className="arc-eyebrow mb-4">dApp activity</p>
          <div className="arc-card overflow-hidden">
            {profile?.isLoading && (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-10 animate-pulse rounded bg-white/6" />)}
              </div>
            )}

            {profile && !profile.isLoading && profile.topApps.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-[var(--muted)]">None of this wallet's recent activity touches an app we track.</p>
              </div>
            )}

            {profile && !profile.isLoading && profile.topApps.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      {['App', 'Interactions', 'Sent', 'Received'].map((h, i) => (
                        <th key={h} className={`arc-eyebrow !text-[10px] px-5 py-3.5 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profile.topApps.map(entry => (
                      <tr key={entry.app.id} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                        <td className="px-5 py-3.5">
                          <Link to={`/dapp/${entry.app.id}`} className="flex items-center gap-3">
                            <AppLogoBadge initials={entry.app.logoInitials} color={entry.app.logoColor} logo={entry.app.logo} logoIcon={entry.app.logoIcon} size="sm" />
                            <div>
                              <p className="text-[15px] text-white">{entry.app.name}</p>
                              <CategoryBadge category={entry.app.category} size="xs" />
                            </div>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{entry.txCount.toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-white">${entry.volumeOut.toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-white">${entry.volumeIn.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {profile?.error && <p className="p-5 text-center text-sm text-[var(--muted)]">{profile.error}</p>}
          </div>
          {profile && !profile.isLoading && !profile.error && (
            <p className="mt-4 text-sm text-[var(--faint)]">Based on the wallet's latest {profile.scanned.toLocaleString()} transactions and token transfers.</p>
          )}
        </section>
      </Reveal>
    </div>
  )
}
