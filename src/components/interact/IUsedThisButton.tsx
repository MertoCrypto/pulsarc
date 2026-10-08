import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { CheckCircle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { arcAttestationAbi, ARC_ATTESTATION_ADDRESS } from '@/contracts/abis'
import { requireChain } from '@/onchain-facts'


import { CHAIN_ID } from '@/lib/chain'
interface Props {
  dappId: string
  className?: string
}

export function IUsedThisButton({ dappId, className }: Props) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const [optimistic, setOptimistic] = useState(false)

  const { data: attestCount, refetch: refetchCount } = useReadContract({
    address: ARC_ATTESTATION_ADDRESS,
    abi: arcAttestationAbi,
    functionName: 'getAttestationCount',
    args: [dappId],
    chainId: CHAIN_ID,
  })

  const { data: hasAttested, refetch: refetchAttested } = useReadContract({
    address: ARC_ATTESTATION_ADDRESS,
    abi: arcAttestationAbi,
    functionName: 'hasAttested',
    args: [address ?? '0x0000000000000000000000000000000000000000', dappId],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isLoading = isPending || isConfirming
  const attested = optimistic || isSuccess || (isConnected && hasAttested === true)
  const count = attestCount !== undefined ? Number(attestCount) + (optimistic ? 1 : 0) : null
  const explorerChain = requireChain(CHAIN_ID)

  function handleAttest() {
    if (!isConnected) { toast.error('Connect your wallet to attest.'); return }
    if (chainId !== CHAIN_ID) { switchChain({ chainId: CHAIN_ID }); return }
    if (attested) return
    setOptimistic(true)
    writeContract(
      {
        address: ARC_ATTESTATION_ADDRESS,
        abi: arcAttestationAbi,
        functionName: 'attest',
        args: [dappId],
        chainId: CHAIN_ID,
      },
      {
        onSuccess: () => {
          toast.success('Attestation recorded onchain!')
          void refetchCount()
          void refetchAttested()
        },
        onError: (err) => {
          setOptimistic(false)
          const msg = err.message?.toLowerCase() ?? ''
          if (msg.includes('user rejected') || msg.includes('denied')) toast.error('Transaction cancelled.')
          else toast.error('Attestation failed. Try again.')
        },
      }
    )
  }

  return (
    <button
      onClick={handleAttest}
      disabled={isLoading || (isConnected && attested)}
      title={attested ? 'You attested this DApp' : 'Attest: I used this DApp'}
      className={clsx('arc-act', isLoading && 'cursor-wait opacity-60', className)}
      data-on={attested}
    >
      {isLoading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <CheckCircle className="w-3.5 h-3.5" />
      }
      <span>{attested ? 'Used' : 'I Used This'}</span>
      {count !== null && <span className="text-[var(--faint)]">({count})</span>}
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
