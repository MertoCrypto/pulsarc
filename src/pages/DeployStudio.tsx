/**
 * Deploy — one-click ERC-20, ERC-721 and ERC-1155 contracts on Arc Testnet, signed by the
 * connected wallet. Sources live in contracts/ArcToken.sol, ArcNFT.sol and ArcMultiToken.sol
 * (OpenZeppelin 5.1); bytecode in src/contracts/deployables.ts is compiled from them and was
 * dry-run against the Arc Testnet RPC before shipping.
 */
import { useState } from 'react'
import { useAccount, useSwitchChain, useWalletClient } from 'wagmi'
import { ArrowLeft, ArrowUpRight, CheckCircle2, Coins, Image, Layers3, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { createPublicClient, encodeDeployData, http } from 'viem'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import {
  ArcMultiTokenAbi, ArcMultiTokenBytecode,
  ArcNFTAbi, ArcNFTBytecode,
  ArcTokenAbi, ArcTokenBytecode,
} from '@/contracts/deployables'

import { CHAIN_ID, RPC_URL as RPC } from '@/lib/chain'

type ContractType = 'erc20' | 'erc721' | 'erc1155'

interface Field {
  id: string
  label: string
  placeholder: string
  hint?: string
  initial?: string
  numeric?: boolean
}

interface Plan { data: `0x${string}` }

interface ContractDef {
  id: ContractType
  label: string
  standard: string
  blurb: string
  icon: typeof Coins
  fields: Field[]
  build: (v: Record<string, string>) => Plan | string
}

const digits = (s: string) => /^\d+$/.test(s.trim())

const DEFS: ContractDef[] = [
  {
    id: 'erc20',
    label: 'Token',
    standard: 'ERC-20',
    blurb: 'A fungible token — points, a community coin, a test asset. The whole supply goes to your wallet.',
    icon: Coins,
    fields: [
      { id: 'name', label: 'Name', placeholder: 'Arc Dollar', hint: 'Shown in wallets and explorers.' },
      { id: 'symbol', label: 'Symbol', placeholder: 'ARCD', hint: '3–6 letters.' },
      { id: 'supply', label: 'Supply', placeholder: '1000000', numeric: true, hint: 'Whole tokens, 18 decimals. Minted to you.' },
    ],
    build: v => {
      if (!v.name?.trim() || !v.symbol?.trim()) return 'Name and symbol are required.'
      if (!digits(v.supply ?? '') || BigInt(v.supply) === 0n || BigInt(v.supply) > 10n ** 15n) return 'Supply must be a whole number between 1 and 1,000,000,000,000,000.'
      return { data: encodeDeployData({ abi: ArcTokenAbi, bytecode: ArcTokenBytecode, args: [v.name.trim(), v.symbol.trim(), BigInt(v.supply) * 10n ** 18n] }) }
    },
  },
  {
    id: 'erc721',
    label: 'NFT collection',
    standard: 'ERC-721',
    blurb: 'Unique collectibles. A first batch is minted to your wallet; token IDs start at 1.',
    icon: Image,
    fields: [
      { id: 'name', label: 'Collection name', placeholder: 'Arc Cats' },
      { id: 'symbol', label: 'Symbol', placeholder: 'ACAT' },
      { id: 'quantity', label: 'How many to mint', placeholder: '10', numeric: true, hint: '1 to 50, minted to you.' },
      { id: 'baseUri', label: 'Metadata base URI', placeholder: 'ipfs://…/', hint: 'Optional. Each token reads baseURI + its ID.' },
    ],
    build: v => {
      if (!v.name?.trim() || !v.symbol?.trim()) return 'Name and symbol are required.'
      if (!digits(v.quantity ?? '') || Number(v.quantity) < 1 || Number(v.quantity) > 50) return 'Pick between 1 and 50 NFTs.'
      return { data: encodeDeployData({ abi: ArcNFTAbi, bytecode: ArcNFTBytecode, args: [v.name.trim(), v.symbol.trim(), (v.baseUri ?? '').trim(), BigInt(v.quantity)] }) }
    },
  },
  {
    id: 'erc1155',
    label: 'Multi-token',
    standard: 'ERC-1155',
    blurb: 'Editions and game items: many copies of one token ID, in a single contract.',
    icon: Layers3,
    fields: [
      { id: 'uri', label: 'Metadata URI', placeholder: 'ipfs://…/{id}.json', hint: '{id} is replaced by the token ID.' },
      { id: 'tokenId', label: 'Token ID', placeholder: '1', initial: '1', numeric: true },
      { id: 'amount', label: 'Copies to mint', placeholder: '100', numeric: true, hint: 'Minted to you.' },
    ],
    build: v => {
      if (!v.uri?.trim()) return 'A metadata URI is required.'
      if (!digits(v.tokenId ?? '')) return 'Token ID must be a whole number.'
      if (!digits(v.amount ?? '') || BigInt(v.amount) === 0n) return 'Copies must be a whole number above 0.'
      return { data: encodeDeployData({ abi: ArcMultiTokenAbi, bytecode: ArcMultiTokenBytecode, args: [v.uri.trim(), BigInt(v.tokenId), BigInt(v.amount)] }) }
    },
  },
]

interface DeployResult { txHash: `0x${string}`; contractAddress?: `0x${string}` }

function DeployForm({ def, onBack }: { def: ContractDef; onBack: () => void }) {
  const { chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()

  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(def.fields.map(f => [f.id, f.initial ?? ''])),
  )
  const [status, setStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<DeployResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function deploy() {
    if (!isConnected) { toast.error('Connect your wallet first.'); return }
    if (chainId !== CHAIN_ID) { switchChain({ chainId: CHAIN_ID }); return }
    if (!walletClient) { toast.error('Wallet is not ready yet.'); return }

    const plan = def.build(values)
    if (typeof plan === 'string') { toast.error(plan); return }

    setStatus('deploying')
    setErrorMsg('')
    try {
      const txHash = await walletClient.sendTransaction({ data: plan.data, chain: undefined })
      setResult({ txHash })
      try {
        const client = createPublicClient({ transport: http(RPC) })
        const receipt = await client.waitForTransactionReceipt({ hash: txHash })
        if (receipt.status === 'reverted') throw new Error('The deployment transaction reverted.')
        setResult({ txHash, contractAddress: receipt.contractAddress ?? undefined })
      } catch (err) {
        if (err instanceof Error && err.message.includes('reverted')) throw err
        // Receipt lookup is best-effort; the tx link still works.
      }
      setStatus('success')
      toast.success(`${def.label} deployed`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deployment failed'
      if (/user rejected|denied/i.test(msg)) { setStatus('idle'); toast.error('Cancelled.') }
      else { setStatus('error'); setErrorMsg(msg.slice(0, 160)) }
    }
  }

  const Icon = def.icon
  const busy = status === 'deploying'

  return (
    <div className="max-w-[640px] space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-[var(--muted)] transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All contract types
      </button>

      <div className="arc-card p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)]">
            <Icon className="h-5 w-5 text-[var(--periwinkle)]" />
          </span>
          <div>
            <p className="arc-eyebrow">{def.standard}</p>
            <p className="mt-1 text-2xl font-light tracking-tight text-white">{def.label}</p>
          </div>
        </div>
        <p className="mt-5 text-[var(--muted)]">{def.blurb}</p>

        <div className="mt-7 space-y-5">
          {def.fields.map(f => (
            <label key={f.id} className="block">
              <span className="arc-eyebrow !text-[10px]">{f.label}</span>
              <input
                value={values[f.id] ?? ''}
                onChange={e => setValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                placeholder={f.placeholder}
                inputMode={f.numeric ? 'numeric' : undefined}
                disabled={busy}
                spellCheck={false}
                className="arc-panel mt-2 w-full px-4 py-3 text-[15px] text-white outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--periwinkle)] disabled:opacity-50"
              />
              {f.hint && <span className="mt-1.5 block text-xs text-[var(--faint)]">{f.hint}</span>}
            </label>
          ))}
        </div>

        {status === 'success' && result && (
          <div className="arc-panel mt-6 space-y-2.5 p-4">
            <p className="flex items-center gap-2 text-white"><CheckCircle2 className="h-4 w-4 text-[var(--periwinkle)]" /> Deployed on Arc Testnet</p>
            {result.contractAddress && (
              <a href={buildAddressExplorerUrl(CHAIN_ID, result.contractAddress)} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 break-all font-['Geist_Mono'] text-xs text-[var(--periwinkle)] hover:text-white">
                {result.contractAddress} <ArrowUpRight className="h-3 w-3 shrink-0" />
              </a>
            )}
            <a href={buildTxExplorerUrl(CHAIN_ID, result.txHash)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-white">
              View transaction <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        )}

        {status === 'error' && (
          <p className="arc-panel mt-6 p-4 text-sm text-[var(--muted)]">{errorMsg || 'Deployment failed. Check your wallet and try again.'}</p>
        )}

        <button
          onClick={() => { void deploy() }}
          disabled={busy || !isConnected}
          className={clsx('mt-7 w-full', isConnected && !busy ? 'arc-btn' : 'arc-btn-ghost justify-center opacity-60')}
        >
          {busy ? (<><Loader2 className="h-4 w-4 animate-spin" /> Waiting for the network…</>)
            : !isConnected ? 'Connect a wallet to deploy'
            : chainId !== CHAIN_ID ? 'Switch to Arc Testnet'
            : `Deploy ${def.standard}`}
        </button>
        <p className="mt-3 text-center text-xs text-[var(--faint)]">You sign one transaction. Gas is paid in USDC — about a cent.</p>
      </div>
    </div>
  )
}

export function DeployStudio() {
  const [selected, setSelected] = useState<ContractType | null>(null)
  const def = DEFS.find(d => d.id === selected)

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Deploy · Arc Testnet</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[{ text: 'Your own contract,' }, { text: 'one signature away.', className: 'text-[var(--periwinkle)]' }]}
          />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            Standard OpenZeppelin contracts, deployed from your wallet. No owner keys, no hidden mint — the source is in the repo.
          </p>
        </section>
      </Reveal>

      {def ? (
        <DeployForm key={def.id} def={def} onBack={() => setSelected(null)} />
      ) : (
        <>
          <Reveal className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {DEFS.map(d => {
              const Icon = d.icon
              return (
                <button key={d.id} onClick={() => setSelected(d.id)}
                  className="arc-card group p-6 text-left transition-colors hover:border-[var(--line-strong)]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)] transition-transform duration-500 group-hover:scale-110">
                    <Icon className="h-5 w-5 text-[var(--periwinkle)]" />
                  </span>
                  <p className="arc-eyebrow mt-8">{d.standard}</p>
                  <p className="mt-2 text-2xl font-light tracking-tight text-white">{d.label}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{d.blurb}</p>
                  <p className="mt-6 inline-flex items-center gap-1.5 text-sm text-[var(--periwinkle)]">
                    Set up <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </p>
                </button>
              )
            })}
          </Reveal>

          <Reveal className="arc-panel max-w-[720px] space-y-2 px-5 py-4 text-sm leading-relaxed text-[var(--muted)]">
            <p>These contracts have no owner and cannot mint more after deployment — what you set here is final.</p>
            <p>Everything runs on Arc Testnet. Testnet tokens have no monetary value.</p>
          </Reveal>
        </>
      )}
    </div>
  )
}
