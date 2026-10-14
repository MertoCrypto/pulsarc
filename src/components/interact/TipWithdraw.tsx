import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { toast } from 'sonner'
import { ARC_USDC_ADDRESS } from '@/contracts/abis'
import { CHAIN_ID } from '@/lib/chain'
import { TIP_ADDRESS } from '@/lib/tip'

const tipJarAbi = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'withdrawAll', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }], outputs: [] },
] as const

/** Inner component — only rendered when TIP_ADDRESS is known; all hooks are unconditional here. */
function TipWithdrawInner({ tipAddress }: { tipAddress: `0x${string}` }) {
  const { address } = useAccount()
  const { data: owner } = useReadContract({
    address: tipAddress,
    abi: tipJarAbi,
    functionName: 'owner',
    chainId: CHAIN_ID,
    query: { enabled: true },
  })
  const { data: balance, refetch } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [tipAddress],
    chainId: CHAIN_ID,
    query: { refetchInterval: 20_000 },
  })
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: confirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  })

  if (!address || !owner || owner.toLowerCase() !== address.toLowerCase()) return null
  const amount = balance ?? 0n
  const busy = isPending || confirming
  const actionDisabled = busy || amount === 0n

  function handleWithdraw() {
    if (!address) return
    writeContract(
      {
        address: tipAddress,
        abi: tipJarAbi,
        functionName: 'withdrawAll',
        args: [ARC_USDC_ADDRESS, address],
        chainId: CHAIN_ID,
      },
      {
        onSuccess: () => { toast.success('Withdrawal sent'); setTimeout(() => void refetch(), 4000) },
        onError: (err) => {
          console.error('[TipWithdraw]', err)
          toast.error(`Withdraw failed — ${(err as { shortMessage?: string }).shortMessage ?? err.message.slice(0, 120)}`)
        },
      },
    )
  }

  return (
    <div className="mt-4 rounded-[10px] border border-[var(--line)] p-3 text-center">
      <p className="text-xs text-[var(--muted)]">Tip jar balance (you are the owner)</p>
      <p className="mt-1 text-lg tabular-nums text-white">{formatUnits(amount, 6)} USDC</p>
      <button
        disabled={actionDisabled}
        onClick={handleWithdraw}
        className="mt-2 w-full rounded-[10px] border border-[var(--line-strong)] py-2 text-[13px] text-white transition-colors hover:border-[var(--periwinkle)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Withdrawing…' : amount === 0n ? 'Nothing to withdraw' : 'Withdraw all to my wallet'}
      </button>
    </div>
  )
}

/**
 * Shown only to the TipJar owner: moves the whole USDC balance to the connected wallet.
 * Renders nothing when TIP_ADDRESS is null (mainnet without a deployed TipJar).
 * The outer/inner split keeps all React hooks unconditional inside TipWithdrawInner.
 */
export function TipWithdraw() {
  if (TIP_ADDRESS === null) return null
  return <TipWithdrawInner tipAddress={TIP_ADDRESS} />
}
