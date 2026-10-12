/**
 * WalletCheck — paste a wallet address to see its index history.
 * Shows plain facts only. No score, rank, or rating anywhere.
 *
 * Route wired externally by the caller (this file only exports the page).
 * Reads/writes query params:
 *   ?net=mainnet|testnet  (default: testnet)
 *   ?address=0x…          (pre-fills and auto-checks)
 */
import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWalletIndex } from '@/hooks/useWalletIndex'
import { WalletExtras } from '@/components/wallet/WalletExtras'
import { WalletPercentiles } from '@/components/wallet/WalletPercentiles'
import { WalletMilestones } from '@/components/wallet/WalletMilestones'
import { coverageNote } from '@/lib/walletIndex'
import { isAddress } from '@/lib/arcscan'

// ── Helpers ────────────────────────────────────────────────────────────────────

const LOCALE = 'en-US' as const

function fmtDate(d: Date): string {
  return d.toLocaleDateString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function fmtNum(n: number): string {
  return n.toLocaleString(LOCALE)
}

function fmtUsdc(n: number): string {
  return n.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

function fmtPct(share: number): string {
  return (share * 100).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

// ── Fact tile ─────────────────────────────────────────────────────────────────

function Fact({
  label,
  value,
  sub,
  loading,
}: {
  label: string
  value: string
  sub?: string
  loading?: boolean
}) {
  return (
    <div>
      <p className="arc-eyebrow !text-[10px]">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-white/[0.08]" />
      ) : (
        <>
          <p className="mt-2 text-[26px] font-light leading-none tracking-tight tabular-nums text-white">
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">{sub}</p>
          )}
        </>
      )}
    </div>
  )
}

// ── Skeleton loader ────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="arc-card p-6 sm:p-8">
      <div className="mb-6 h-4 w-40 animate-pulse rounded bg-white/[0.08]" />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i}>
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-white/[0.08]" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function WalletCheck() {
  const [params, setParams] = useSearchParams()

  // Network toggle: read from ?net= param
  const net = params.get('net') === 'mainnet' ? 'mainnet' : 'testnet'

  // Address from URL param (pre-fill)
  const addrParam = params.get('address') ?? ''

  // Local input state
  const [inputValue, setInputValue] = useState(addrParam)

  // The address we actually query — set on submit
  const [checkedAddress, setCheckedAddress] = useState<string | null>(
    isAddress(addrParam) ? addrParam : null,
  )

  // Sync input field when URL param changes externally
  useEffect(() => {
    setInputValue(addrParam)
    if (isAddress(addrParam)) {
      setCheckedAddress(addrParam)
    } else {
      setCheckedAddress(null)
    }
  }, [addrParam])

  // Input validation message (shown inline, not from the hook)
  const [validationMsg, setValidationMsg] = useState<string | null>(null)

  const handleSubmit = useCallback(() => {
    const v = inputValue.trim()
    if (!v) {
      setValidationMsg(null)
      setCheckedAddress(null)
      return
    }
    if (!isAddress(v)) {
      setValidationMsg(
        'That is not a wallet address. It should start with 0x and be 42 characters long.',
      )
      setCheckedAddress(null)
      return
    }
    setValidationMsg(null)
    setCheckedAddress(v)
    // Update URL so the result is linkable
    const next = new URLSearchParams(params)
    next.set('address', v)
    setParams(next, { replace: true })
  }, [inputValue, params, setParams])

  function handleNetToggle(newNet: 'mainnet' | 'testnet') {
    const next = new URLSearchParams(params)
    next.set('net', newNet)
    setParams(next, { replace: true })
  }

  // Hook — validate address before passing (only pass a valid address)
  const queryAddress = checkedAddress && isAddress(checkedAddress) ? checkedAddress : null
  const { state, meta, record, summary, apps, errorMessage } = useWalletIndex(queryAddress, net)

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <p className="arc-eyebrow mb-3">Wallet checker</p>
        <h1 className="text-3xl font-light tracking-tight text-white">
          Wallet checker
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Pulsarc's wallet index · closed days only · plain facts
        </p>
      </div>

      {/* Input card */}
      <section className="arc-card p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Address input */}
          <div className="flex-1">
            <label htmlFor="wallet-address-input" className="arc-eyebrow mb-2 block !text-[10px]">
              Wallet address
            </label>
            <input
              id="wallet-address-input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className="w-full rounded-lg border border-[var(--line)] bg-white/[0.05] px-4 py-3 font-['Geist_Mono'] text-sm text-white placeholder-[var(--muted)] outline-none focus:border-[var(--periwinkle)] focus:ring-0 transition-colors"
              placeholder="0x…"
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value)
                setValidationMsg(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSubmit()
              }}
            />
            {validationMsg && (
              <p className="mt-2 text-xs text-[var(--muted)]">{validationMsg}</p>
            )}
          </div>

          {/* Network toggle */}
          <div className="flex flex-col gap-2">
            <p className="arc-eyebrow !text-[10px]">Network</p>
            <div className="flex gap-2">
              <button
                className={net === 'testnet' ? 'arc-btn text-sm' : 'arc-btn-ghost text-sm'}
                onClick={() => handleNetToggle('testnet')}
              >
                Testnet
              </button>
              <button
                className={net === 'mainnet' ? 'arc-btn text-sm' : 'arc-btn-ghost text-sm'}
                onClick={() => handleNetToggle('mainnet')}
              >
                Mainnet
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button className="arc-btn" onClick={handleSubmit}>
            Check
          </button>
          {/* Link to full profile — only when a valid address is checked */}
          {checkedAddress && isAddress(checkedAddress) && (
            <Link
              to={`/wallet/${checkedAddress}`}
              className="text-sm text-[var(--muted)] transition-colors hover:text-white underline underline-offset-2"
            >
              Open full profile
            </Link>
          )}
        </div>

        {/* Idle explainer */}
        {state === 'idle' && !validationMsg && (
          <p className="mt-5 text-sm text-[var(--muted)]">
            Enter a wallet address above to look up its on-chain history from
            Pulsarc's wallet index. The checker shows facts — first active day,
            transaction counts, USDC flows, apps used, and more — but no scores
            or ratings.
          </p>
        )}
      </section>

      {/* Loading */}
      {state === 'loading' && <SkeletonGrid />}

      {/* Unpublished */}
      {state === 'unpublished' && (
        <section className="arc-card p-6 sm:p-8">
          <p className="text-sm text-[var(--muted)]">
            The wallet index for this network has not been published yet.
          </p>
        </section>
      )}

      {/* Not found */}
      {state === 'not-found' && (
        <section className="arc-card p-6 sm:p-8">
          <p className="text-sm text-[var(--muted)]">
            No activity recorded for this address in the closed days covered.
          </p>
          {meta && (
            <p className="mt-3 text-xs text-[var(--faint)]">{coverageNote(meta)}</p>
          )}
        </section>
      )}

      {/* Error */}
      {state === 'error' && (
        <section className="arc-card p-6 sm:p-8">
          <p className="text-sm text-[var(--muted)]">
            {errorMessage ?? 'Could not load the wallet index. Please try again.'}
          </p>
        </section>
      )}

      {/* Found */}
      {state === 'found' && summary && meta && (
        <>
        <section className="arc-card p-6 sm:p-8">
          <p className="arc-eyebrow mb-6 !text-[10px]">
            {net === 'mainnet' ? 'Arc Mainnet' : 'Arc Testnet'} · wallet history
          </p>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            <Fact
              label="First seen"
              value={fmtDate(summary.firstSeen)}
            />
            <Fact
              label="Last active"
              value={fmtDate(summary.lastActive)}
            />
            <Fact
              label="Age"
              value={`${fmtNum(summary.ageDays)} days`}
            />
            <Fact
              label="Active days"
              value={fmtNum(summary.activeDays)}
              sub={`longest streak ${fmtNum(summary.longestStreak)} day${summary.longestStreak === 1 ? '' : 's'}`}
            />
            <Fact
              label="Active share"
              value={fmtPct(summary.activeShare)}
            />
            <Fact
              label="Transactions sent"
              value={fmtNum(summary.tx)}
              sub={summary.partial ? 'may be incomplete' : undefined}
            />
            <Fact
              label="Failed"
              value={
                summary.failedShare !== null
                  ? `${fmtNum(summary.failed)} (${fmtPct(summary.failedShare)})`
                  : `${fmtNum(summary.failed)}`
              }
              sub={summary.partial ? 'may be incomplete' : undefined}
            />
            <Fact
              label="Fees paid"
              value={`${fmtUsdc(summary.feesUsdc)} USDC`}
              sub={summary.partial ? 'may be incomplete' : undefined}
            />
            <Fact
              label="USDC sent"
              value={`$${fmtUsdc(summary.usdcSent)}`}
            />
            <Fact
              label="USDC received"
              value={`$${fmtUsdc(summary.usdcReceived)}`}
            />
            <Fact
              label="Bridge"
              value={`${fmtNum(summary.bridgeOut)} out / ${fmtNum(summary.bridgeIn)} in`}
            />

            {/* Apps used — full width */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <p className="arc-eyebrow !text-[10px]">Apps used</p>
              {summary.apps.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">None recorded</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {summary.apps.map(id => (
                    <span
                      key={id}
                      className="rounded border border-[var(--line)] bg-white/[0.05] px-2.5 py-1 font-['Geist_Mono'] text-xs text-white"
                    >
                      {/* Rendered as React text; never injected as HTML */}
                      {id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Coverage note */}
          <p className="mt-8 border-t border-[var(--line)] pt-5 text-xs text-[var(--faint)]">
            {coverageNote(meta)}
          </p>

          {/* Partial (lite) caveat */}
          {summary.partial && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Mainnet history before live indexing is rebuilt from USDC transfers:
              transactions, failures and fees may be incomplete.
            </p>
          )}
        </section>
        {record && (
          <div className="mt-6">
            <WalletMilestones record={record} through={meta.through} summary={summary} />
          </div>
        )}
        {queryAddress && (
          <div className="mt-6 space-y-6">
            <WalletPercentiles net={net} summary={summary} />
            <WalletExtras address={queryAddress} net={net} summary={summary} apps={apps} coverage={coverageNote(meta)} />
          </div>
        )}
        </>
      )}
    </div>
  )
}
