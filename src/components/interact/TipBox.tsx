import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { erc20ApproveAbi, ARC_USDC_ADDRESS } from '@/contracts/abis'
import { requireChain } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'
import { CHAIN_ID } from '@/lib/chain'
// parseUsdc returns bigint directly

import { TIP_ADDRESS } from '@/lib/tip'

const PLATFORM_ADDRESS = TIP_ADDRESS
const TIP_PRESETS = [0.01, 0.10, 1.00]

export function TipBox() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const [selected, setSelected] = useState<number>(0.10)
  const [lastTipper, setLastTipper] = useState<string | null>(null)
  const explorerChain = requireChain(CHAIN_ID)

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isLoading = isPending || isConfirming

  function handleTip() {
    if (!isConnected) { toast.error('Connect your wallet to tip.'); return }
    if (chainId !== CHAIN_ID) { switchChain({ chainId: CHAIN_ID }); return }

    const rawAmount: bigint = parseUsdc(selected.toString())
    writeContract(
      {
        address: ARC_USDC_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: 'transfer',
        args: [PLATFORM_ADDRESS, rawAmount],
        chainId: CHAIN_ID,
      },
      {
        onSuccess: () => {
          toast.success(`Thank you for the ${selected} USDC tip!`)
          setLastTipper(address ?? null)
        },
        onError: (err) => {
          const msg = err.message?.toLowerCase() ?? ''
          if (msg.includes('user rejected') || msg.includes('denied')) toast.error('Transaction cancelled.')
          else toast.error('Tip failed. Try again.')
        },
      }
    )
  }

  return (
    <div className="arc-card p-5">
      <p className="arc-eyebrow">Support</p>
      <p className="mt-3 text-[17px] font-light leading-snug text-white">Pulsarc is free. Tips in USDC go straight to the team.</p>

      <div className="mb-3 mt-5 flex gap-2">
        {TIP_PRESETS.map(v => (
          <button
            key={v}
            onClick={() => setSelected(v)}
            className={clsx(
              'flex-1 rounded-[10px] border py-2 text-xs tabular-nums transition-all',
              selected === v
                ? 'border-[var(--periwinkle)] bg-[var(--periwinkle)] text-[#0a1424]'
                : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-white'
            )}
          >
            ${v.toFixed(2)}
          </button>
        ))}
      </div>

      {isSuccess ? (
        <div className="w-full rounded-[10px] border border-[var(--line-strong)] py-2.5 text-center text-xs text-[var(--periwinkle)]">
          Thanks for the support!{' '}
          {hash && (
            <a
              href={`${explorerChain.explorerBase}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline opacity-70 hover:opacity-100"
            >
              View TX
            </a>
          )}
        </div>
      ) : (
        <button
          onClick={handleTip}
          disabled={isLoading}
          className={clsx(
            'w-full rounded-[10px] py-2.5 text-[13px] font-medium transition-all',
            isLoading
              ? 'cursor-wait bg-[var(--periwinkle)]/40 text-[#0a1424]/60'
              : 'bg-[var(--periwinkle)] text-[#0a1424] hover:bg-[var(--periwinkle-hi)]'
          )}
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-1.5 justify-center">
              <Loader2 className="w-3 h-3 animate-spin" />
              {isPending ? 'Confirm in wallet...' : 'Sending...'}
            </span>
          ) : (
            `Tip $${selected.toFixed(2)} USDC`
          )}
        </button>
      )}

      {lastTipper && (
        <p className="mt-2 text-center font-['Geist_Mono'] text-[10px] text-[var(--faint)]">
          {lastTipper.slice(0, 6)}...{lastTipper.slice(-4)} just tipped
        </p>
      )}
    </div>
  )
}
