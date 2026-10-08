import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { Zap, Loader2, X } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { arcBoostAbi, ARC_BOOST_ADDRESS, ARC_USDC_ADDRESS, erc20ApproveAbi } from '@/contracts/abis'
import { requireChain } from '@/onchain-facts'
import { parseUsdc, formatUsdc } from '@/onchain-money'

import { CHAIN_ID } from '@/lib/chain'
const BOOST_PRESETS = [0.01, 0.10, 0.50, 1.00]

interface Props {
  dappId: string
  dappName: string
  className?: string
}

export function BoostButton({ dappId, dappName, className }: Props) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<number>(0.10)
  const [step, setStep] = useState<'idle' | 'approving' | 'boosting'>('idle')
  const explorerChain = requireChain(CHAIN_ID)

  const { data: totalBoost, refetch } = useReadContract({
    address: ARC_BOOST_ADDRESS,
    abi: arcBoostAbi,
    functionName: 'getTotalBoost',
    args: [dappId],
    chainId: CHAIN_ID,
  })

  const { data: allowance } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20ApproveAbi,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', ARC_BOOST_ADDRESS],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const { writeContract: approveFn, data: approveHash, isPending: isApprovePending } = useWriteContract()
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: boostFn, data: boostHash, isPending: isBoostPending } = useWriteContract()
  const { isLoading: isBoostConfirming, isSuccess: isBoostSuccess } = useWaitForTransactionReceipt({ hash: boostHash })

  const isLoading = isApprovePending || isApproveConfirming || isBoostPending || isBoostConfirming

  function handleBoost() {
    if (!isConnected) { toast.error('Connect your wallet to boost.'); return }
    if (chainId !== CHAIN_ID) { switchChain({ chainId: CHAIN_ID }); return }

    const rawAmount: bigint = parseUsdc(selected.toString())
    const needsApproval = !allowance || (allowance) < rawAmount

    function doBoost() {
      boostFn(
        {
          address: ARC_BOOST_ADDRESS,
          abi: arcBoostAbi,
          functionName: 'boost',
          args: [dappId, rawAmount],
          chainId: CHAIN_ID,
        },
        {
          onSuccess: () => {
            toast.success(`Boosted ${dappName} with ${selected} USDC!`)
            void refetch()
            setOpen(false)
            setStep('idle')
          },
          onError: (err) => { setStep('idle'); handleError(err) },
        }
      )
    }

    if (needsApproval) {
      setStep('approving')
      approveFn(
        {
          address: ARC_USDC_ADDRESS,
          abi: erc20ApproveAbi,
          functionName: 'approve',
          args: [ARC_BOOST_ADDRESS, rawAmount],
          chainId: CHAIN_ID,
        },
        {
          onSuccess: () => { setStep('boosting'); doBoost() },
          onError: (err) => { setStep('idle'); handleError(err) },
        }
      )
    } else {
      setStep('boosting')
      doBoost()
    }
  }

  function handleError(err: Error) {
    const msg = err.message?.toLowerCase() ?? ''
    if (msg.includes('user rejected') || msg.includes('denied')) toast.error('Transaction cancelled.')
    else toast.error('Boost failed. Try again.')
  }

  const totalFormatted = totalBoost !== undefined ? formatUsdc(totalBoost) : null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={clsx('arc-act', className)}
      data-on={isBoostSuccess}
      >
        <Zap className="w-3.5 h-3.5" />
        <span>Boost</span>
        {totalFormatted !== null && <span className="text-[var(--faint)]">${totalFormatted}</span>}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-56 rounded-xl bg-[#10213b] border border-[var(--line)] shadow-2xl p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-white">Boost {dappName}</p>
            <button onClick={() => setOpen(false)}><X className="w-3.5 h-3.5 text-[var(--faint)] hover:text-white" /></button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {BOOST_PRESETS.map(v => (
              <button
                key={v}
                onClick={() => setSelected(v)}
                className={clsx(
                  'py-1.5 rounded-lg text-xs font-["Geist_Mono"] tabular-nums transition-all border',
                  selected === v
                    ? 'text-[var(--periwinkle)] border-[var(--periwinkle)]/40 bg-[var(--periwinkle)]/10'
                    : 'text-[var(--muted)] border-[var(--line)] hover:text-white'
                )}
              >
                ${v.toFixed(2)}
              </button>
            ))}
          </div>

          <button
            onClick={handleBoost}
            disabled={isLoading}
            className={clsx(
              'w-full py-2 rounded-lg text-xs font-semibold transition-all',
              isLoading
                ? 'bg-[var(--periwinkle)]/20 text-[var(--periwinkle)] cursor-wait'
                : 'bg-[var(--periwinkle)]/20 text-[var(--periwinkle)] hover:bg-[var(--periwinkle)]/30'
            )}
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5 justify-center">
                <Loader2 className="w-3 h-3 animate-spin" />
                {step === 'approving' ? 'Approving...' : 'Boosting...'}
              </span>
            ) : (
              `Boost $${selected.toFixed(2)} USDC`
            )}
          </button>

          {boostHash && (
            <a
              href={`${explorerChain.explorerBase}/tx/${boostHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-[10px] text-[var(--periwinkle)] hover:text-[var(--periwinkle)] mt-2"
            >
              View transaction ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}
