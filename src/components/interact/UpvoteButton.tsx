import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { ThumbsUp, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { arcVotingAbi, ARC_VOTING_ADDRESS } from '@/contracts/abis'
import { requireChain } from '@/onchain-facts'


import { CHAIN_ID } from '@/lib/chain'
interface Props {
  dappId: string
  className?: string
}

export function UpvoteButton({ dappId, className }: Props) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const [optimisticVoted, setOptimisticVoted] = useState(false)

  const { data: voteCount, refetch: refetchCount } = useReadContract({
    address: ARC_VOTING_ADDRESS,
    abi: arcVotingAbi,
    functionName: 'getVoteCount',
    args: [dappId],
    chainId: CHAIN_ID,
  })

  const { data: canVote, refetch: refetchCanVote } = useReadContract({
    address: ARC_VOTING_ADDRESS,
    abi: arcVotingAbi,
    functionName: 'canVote',
    args: [address ?? '0x0000000000000000000000000000000000000000', dappId],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isLoading = isPending || isConfirming
  const hasVoted = optimisticVoted || isSuccess || (isConnected && canVote === false)

  function handleVote() {
    if (!isConnected) {
      toast.error('Connect your wallet to vote.')
      return
    }
    if (chainId !== CHAIN_ID) {
      switchChain({ chainId: CHAIN_ID })
      return
    }
    if (hasVoted) return
    setOptimisticVoted(true)
    writeContract(
      {
        address: ARC_VOTING_ADDRESS,
        abi: arcVotingAbi,
        functionName: 'vote',
        args: [dappId],
        chainId: CHAIN_ID,
      },
      {
        onSuccess: () => {
          toast.success('Vote cast onchain!')
          void refetchCount()
          void refetchCanVote()
        },
        onError: (err) => {
          setOptimisticVoted(false)
          const msg = err.message?.toLowerCase() ?? ''
          if (msg.includes('user rejected') || msg.includes('denied')) {
            toast.error('Transaction cancelled.')
          } else {
            toast.error('Vote failed. Try again.')
          }
        },
      }
    )
  }

  const explorerChain = requireChain(CHAIN_ID)
  const count = voteCount !== undefined ? Number(voteCount) + (optimisticVoted ? 1 : 0) : null

  return (
    <button
      onClick={handleVote}
      disabled={isLoading || (isConnected && hasVoted)}
      title={
        !isConnected ? 'Connect wallet to vote'
          : hasVoted ? 'Already voted today'
          : isLoading ? 'Processing...'
          : 'Upvote this DApp'
      }
      className={clsx('arc-act', isLoading && 'cursor-wait opacity-60', className)}
      data-on={hasVoted}
    >
      {isLoading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <ThumbsUp className="w-3.5 h-3.5" />
      }
      <span>{count !== null ? count : '—'}</span>
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
