import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { NETWORKS } from '@/lib/chain'

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

/** Asks the browser wallet to add (and switch to) an Arc network, using Arc's published values. */
export function AddNetworkButton({ network, className = 'arc-btn-ghost' }: { network: 'testnet' | 'mainnet'; className?: string }) {
  const net = NETWORKS[network]

  async function add() {
    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum
    if (!eth) {
      toast.error('No browser wallet found. Install MetaMask, Rabby or Coinbase Wallet first.')
      return
    }
    try {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${net.id.toString(16)}`,
          chainName: net.name,
          // Arc's gas token is USDC with 18 decimals (the ERC-20 view of USDC uses 6).
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
          rpcUrls: [net.rpcUrl],
          blockExplorerUrls: [net.explorerUrl],
        }],
      })
      toast.success(`${net.name} added to your wallet.`)
    } catch (e) {
      const code = (e as { code?: number }).code
      if (code !== 4001) toast.error('Your wallet could not add the network. Try adding it by hand from the details on this page.')
    }
  }

  return (
    <button onClick={() => { void add() }} className={className} title={`Chain ID ${net.id} · USDC gas`}>
      <Plus className="h-3.5 w-3.5" />
      Add {network === 'mainnet' ? 'Mainnet' : 'Testnet'} to wallet
    </button>
  )
}
