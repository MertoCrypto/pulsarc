/**
 * WalletLiveFacts — what the chain says right now (balance, sent transactions) plus the extra
 * activity facts the indexer has counted from live blocks (deployments, tokens, contracts, time of day).
 */
import { useWalletLive } from '@/hooks/useWalletLive'
import { formatLiveBalance, liveKind } from '@/lib/walletLive'
import type { WalletRecord } from '@/lib/walletIndex'

const SET_CAP = 64
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
const HOURS = ['00–06', '06–12', '12–18', '18–24'] as const

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="arc-eyebrow !text-[10px]">{label}</p>
      <p className="mt-2 text-[22px] font-light leading-none tracking-tight tabular-nums text-white">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-[var(--muted)]">{sub}</p>}
    </div>
  )
}

const setValue = (list: string[] | undefined) => {
  const n = list?.length ?? 0
  return n >= SET_CAP ? `${SET_CAP}+` : fmt(n)
}

export function WalletLiveFacts({ address, net, record }: { address: string; net: 'mainnet' | 'testnet'; record: WalletRecord | null }) {
  const { data: live, isLoading } = useWalletLive(address, net)
  const ext = record?.ext
  if (!live && !ext && !isLoading) return null

  const hours = ext?.h
  const hoursTotal = hours ? hours.reduce((a, b) => a + b, 0) : 0

  return (
    <section className="arc-card p-6 sm:p-8">
      <p className="arc-eyebrow mb-6 !text-[10px]">Live on-chain · {net === 'mainnet' ? 'Arc Mainnet' : 'Arc Testnet'}</p>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Tile label="Balance" value={live ? `${formatLiveBalance(live.balanceUsdc)} USDC` : isLoading ? '…' : '—'} />
        <Tile label="Sent transactions" value={live ? fmt(live.sentTxCount) : isLoading ? '…' : '—'} sub="from the live node count" />
        <Tile label="Address type" value={live ? liveKind(live) : isLoading ? '…' : '—'} />
        <Tile label="Token transfers" value={ext?.tt !== undefined ? fmt(ext.tt) : '—'} sub={ext ? 'ERC-20 and NFT, live-indexed' : undefined} />
      </div>

      {ext && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Tile label="Contracts deployed" value={fmt(ext.dp ?? 0)} />
            <Tile label="Contracts called" value={setValue(ext.uc)} sub="that emitted events" />
            <Tile label="Tokens touched" value={setValue(ext.ut)} sub="distinct ERC-20" />
            <Tile label="NFT collections" value={setValue(ext.un)} sub="distinct ERC-721" />
          </div>

          {hours && hoursTotal > 0 && (
            <div className="mt-8">
              <p className="arc-eyebrow mb-3 !text-[10px]">Time of day (UTC)</p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {hours.map((n, i) => (
                  <li key={HOURS[i]} className="flex items-center justify-between rounded border border-[var(--line)] px-3 py-2 text-sm text-white">
                    <span>{HOURS[i]}</span>
                    <span className="font-['Geist_Mono'] text-xs tabular-nums">{fmt(n)} ({Math.round((n / hoursTotal) * 100)}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-6 text-xs text-[var(--muted)]">
            Deployments, tokens, contracts and time of day are counted from live indexing only, so they cover recent days, not the full history.
          </p>
        </>
      )}
    </section>
  )
}
