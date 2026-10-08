import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { Bookmark, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { arcWatchlistNftAbi, ARC_WATCHLIST_NFT_ADDRESS } from '@/contracts/abis'
import { requireChain } from '@/onchain-facts'


import { CHAIN_ID } from '@/lib/chain'
interface Props {
  dappId: string
  className?: string
}

export function WatchlistButton({ dappId, className }: Props) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const [optimistic, setOptimistic] = useState(false)
  const explorerChain = requireChain(CHAIN_ID)

  const { data: isWatchlisted, refetch } = useReadContract({
    address: ARC_WATCHLIST_NFT_ADDRESS,
    abi: arcWatchlistNftAbi,
    functionName: 'hasWatchlisted',
    args: [address ?? '0x0000000000000000000000000000000000000000', dappId],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isLoading = isPending || isConfirming
  const watchlisted = optimistic || isSuccess || (isConnected && isWatchlisted === true)

  function handleMint() {
    if (!isConnected) { toast.error('Connect your wallet to save to watchlist.'); return }
    if (chainId !== CHAIN_ID) { switchChain({ chainId: CHAIN_ID }); return }
    if (watchlisted) return
    setOptimistic(true)
    writeContract(
      {
        address: ARC_WATCHLIST_NFT_ADDRESS,
        abi: arcWatchlistNftAbi,
        functionName: 'mintWatchlist',
        args: [dappId],
        chainId: CHAIN_ID,
      },
      {
        onSuccess: () => {
          toast.success('Watchlist NFT minted! Saved onchain.')
          void refetch()
        },
        onError: (err) => {
          setOptimistic(false)
          const msg = err.message?.toLowerCase() ?? ''
          if (msg.includes('user rejected') || msg.includes('denied')) toast.error('Transaction cancelled.')
          else toast.error('Mint failed. Try again.')
        },
      }
    )
  }

  return (
    <button
      onClick={handleMint}
      disabled={isLoading || (isConnected && watchlisted)}
      title={watchlisted ? 'Saved to your watchlist as NFT' : 'Add to Watchlist (mint NFT)'}
      className={clsx('arc-act', isLoading && 'cursor-wait opacity-60', className)}
      data-on={watchlisted}
    >
      {isLoading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Bookmark className={clsx('w-3.5 h-3.5', watchlisted && 'fill-current')} />
      }
      <span>{watchlisted ? 'Watchlisted' : 'Watchlist'}</span>
      {hash && (
        <a
          href={`${explorerChain.explorerBase}/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-[var(--periwinkle)] hover:text-[var(--periwinkle)] ml-0.5"
        >↗</a>
      )}
    </button>
  )
}
