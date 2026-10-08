/**
 * GmButton — says GM onchain via the GmBoard contract.
 * Shows streak, total GMs, cooldown timer, and last sender.
 */
import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { Sun, Loader2, Flame, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { buildTxExplorerUrl } from '@/onchain-facts'

import { CHAIN_ID } from '@/lib/chain'
// Deployed on Arc Testnet by Arc Studio (see contracts/contract-metadata/GmBoard.json); the env var overrides it.
const GM_BOARD_ADDRESS = (import.meta.env.VITE_GM_BOARD_ADDRESS ?? '0x5683dfa3f97aaafa72f1eb2db95acb41878a520f') as `0x${string}`

const gmBoardAbi = [
  {
    name: 'gm',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'getRecord',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [
      { name: 'lastGm', type: 'uint64' },
      { name: 'streak', type: 'uint32' },
      { name: 'total', type: 'uint32' },
    ],
  },
  {
    name: 'cooldownRemaining',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    name: 'totalGms',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'lastGmSender',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'Gm',
    type: 'event',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'streak', type: 'uint32', indexed: false },
      { name: 'total', type: 'uint32', indexed: false },
      { name: 'ts', type: 'uint64', indexed: false },
    ],
  },
] as const

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds)
  useEffect(() => {
    setRemaining(seconds)
    if (seconds <= 0) return
    const iv = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(iv); return 0 }
        return r - 1
      })
    }, 1_000)
    return () => clearInterval(iv)
  }, [seconds])
  return remaining
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

interface Props {
  variant?: 'hero' | 'compact'
}

export function GmButton({ variant = 'hero' }: Props) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const notDeployed = GM_BOARD_ADDRESS === '0x0000000000000000000000000000000000000000'

  const { data: record, refetch: refetchRecord } = useReadContract({
    address: GM_BOARD_ADDRESS,
    abi: gmBoardAbi,
    functionName: 'getRecord',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: !!address && !notDeployed },
  })

  const { data: cooldownRaw, refetch: refetchCooldown } = useReadContract({
    address: GM_BOARD_ADDRESS,
    abi: gmBoardAbi,
    functionName: 'cooldownRemaining',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: !!address && !notDeployed },
  })

  const { data: totalGms } = useReadContract({
    address: GM_BOARD_ADDRESS,
    abi: gmBoardAbi,
    functionName: 'totalGms',
    chainId: CHAIN_ID,
    query: { enabled: !notDeployed },
  })

  const { data: lastSender } = useReadContract({
    address: GM_BOARD_ADDRESS,
    abi: gmBoardAbi,
    functionName: 'lastGmSender',
    chainId: CHAIN_ID,
    query: { enabled: !notDeployed },
  })

  const cooldownSecs = Number(cooldownRaw ?? 0n)
  const countdown = useCountdown(cooldownSecs)
  const onCooldown = countdown > 0

  const streak = record ? Number(record[1]) : 0
  const totalPersonal = record ? Number(record[2]) : 0

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      toast.success('GM sent onchain', {
        description: hash ? (
          <a
            href={buildTxExplorerUrl(CHAIN_ID, hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View on Explorer
          </a>
        ) : undefined,
      })
      void refetchRecord()
      void refetchCooldown()
    }
  }, [isSuccess, hash, refetchRecord, refetchCooldown])

  function handleGm() {
    if (!isConnected) { toast.error('Connect your wallet to say GM.'); return }
    if (chainId !== CHAIN_ID) { switchChain({ chainId: CHAIN_ID }); return }
    if (notDeployed) { toast.error('GmBoard contract not yet deployed.'); return }

    writeContract(
      {
        address: GM_BOARD_ADDRESS,
        abi: gmBoardAbi,
        functionName: 'gm',
        chainId: CHAIN_ID,
      },
      {
        onError: (err) => {
          const msg = err.message?.toLowerCase() ?? ''
          if (msg.includes('cooldownnotover') || msg.includes('cooldown')) {
            toast.error('Already said GM today! Come back tomorrow.')
          } else if (msg.includes('user rejected') || msg.includes('denied')) {
            toast.error('Cancelled.')
          } else {
            toast.error('GM failed. Try again.')
          }
        },
      }
    )
  }

  const isLoading = isPending || isConfirming

  if (variant === 'compact') {
    const idle = !isLoading && !onCooldown && !notDeployed && !isSuccess
    return (
      <button
        onClick={handleGm}
        disabled={isLoading || onCooldown || notDeployed}
        title={streak > 0 ? `${streak}-day streak · ${totalPersonal} GMs from you` : 'Say GM onchain, once a day'}
        className={clsx(
          'inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-[var(--line-strong)] bg-white/[0.03] px-3.5 py-2.5 sm:px-4 text-[15px] text-white transition-colors hover:border-[var(--periwinkle)] hover:bg-white/[0.07]',
          idle && 'arc-gm-live',
          (onCooldown || notDeployed) && 'cursor-not-allowed opacity-60',
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isSuccess ? (
          <CheckCircle2 className="h-4 w-4 text-[var(--periwinkle)]" />
        ) : (
          <Sun className={clsx('h-4 w-4 text-[var(--periwinkle)]', idle && 'arc-sun-spin')} />
        )}
        {onCooldown ? fmtDuration(countdown) : isSuccess ? 'GM sent' : 'GM'}
        {streak > 0 && !onCooldown && !isSuccess && (
          <span className="flex items-center gap-1 text-xs text-[var(--muted)]"><Flame className="h-3 w-3" />{streak}</span>
        )}
      </button>
    )
  }

  const hasLast = lastSender && lastSender !== '0x0000000000000000000000000000000000000000'

  // Hero variant
  return (
    <div className="arc-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="arc-eyebrow">Daily check-in</p>
          <p className="mt-3 text-[22px] font-light leading-none tracking-tight text-white">Say GM</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Once a day, recorded onchain.</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line-strong)]">
          <Sun className="h-4 w-4 text-[var(--periwinkle)]" />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-[var(--line)] rounded-[12px] border border-[var(--line)]">
        {[
          ['Yours', String(totalPersonal)],
          ['Streak', String(streak)],
          ['Everyone', totalGms ? totalGms.toLocaleString() : '—'],
        ].map(([label, value]) => (
          <div key={label} className="px-3 py-3 text-center">
            <p className="arc-eyebrow !text-[9px] !tracking-[0.16em]">{label}</p>
            <p className="mt-1.5 text-lg tabular-nums text-white">{value}</p>
          </div>
        ))}
      </div>

      <button
        onClick={handleGm}
        disabled={isLoading || onCooldown || notDeployed}
        className={clsx(
          'mt-4 w-full',
          notDeployed || onCooldown ? 'arc-btn-ghost cursor-not-allowed justify-center opacity-60' : 'arc-btn arc-btn-live',
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {isPending ? 'Confirm in wallet…' : 'Confirming…'}
          </>
        ) : isSuccess ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            GM sent
          </>
        ) : onCooldown ? (
          `Back in ${fmtDuration(countdown)}`
        ) : notDeployed ? (
          'Not live yet'
        ) : (
          <>
            <Sun className="h-4 w-4" />
            GM
          </>
        )}
      </button>

      {streak > 0 && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--muted)]">
          <Flame className="h-3.5 w-3.5 text-[var(--periwinkle)]" /> {streak}-day streak
        </p>
      )}
      {hasLast && (
        <p className="mt-2 text-center font-['Geist_Mono'] text-[10px] text-[var(--faint)]">
          Last GM from {lastSender.slice(0, 6)}…{lastSender.slice(-4)}
        </p>
      )}
      {notDeployed && (
        <p className="mt-3 text-center text-xs text-[var(--faint)]">
          The GM contract has not been deployed yet.
        </p>
      )}
    </div>
  )
}
