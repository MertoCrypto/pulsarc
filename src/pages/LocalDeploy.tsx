/**
 * LocalDeploy — local-only page for deploying GmBoard and TipJar to Arc
 * using the connected MetaMask wallet (direct CREATE, no CREATE2 factory).
 *
 * INTENTIONALLY NOT WIRED INTO THE ROUTER — the caller gates this route with
 * import.meta.env.DEV.  This file must not appear in a production bundle.
 *
 * deps: wagmi, viem, @tanstack/react-query, lucide-react
 */

import { useState, useId } from 'react'
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi'
import { encodeDeployData } from 'viem'
import { clsx } from 'clsx'
import {
  buildAddressExplorerUrl,
  buildTxExplorerUrl,
  requireChain,
} from '@/onchain-facts'
import { CHAIN_ID, NETWORK } from '@/lib/chain'
import {
  GmBoardAbi,
  GmBoardBytecode,
  TipJarAbi,
  TipJarBytecode,
} from '@/contracts/localDeployables'
import {
  bytecodeSizeBytes,
  formatFeeEstimate,
  ownerMismatchWarning,
  verifyCodeResult,
  verifyFromResult,
  verifyOwnerResult,
} from '@/lib/localDeployCore'

// ── Constants ─────────────────────────────────────────────────────────────────

const IS_MAINNET = CHAIN_ID === 5042

/** Native currency decimals from onchain-facts registry. Arc = 18 (gas token). */
function getNativeDecimals(): number | null {
  try {
    const chain = requireChain(CHAIN_ID)
    const d = chain.nativeCurrency.decimals
    return typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : null
  } catch {
    return null
  }
}

const NATIVE_DECIMALS = getNativeDecimals()

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'confirming' | 'deploying' | 'success' | 'error'

interface VerifyLine {
  ok: boolean
  message: string
}

interface StepResult {
  txHash: `0x${string}`
  contractAddress: `0x${string}`
  verifyLines: VerifyLine[]
}

interface StepState {
  status: StepStatus
  errorMsg: string
  result: StepResult | null
  feeEstimate: string
  confirmed: boolean
}

function initialStep(): StepState {
  return { status: 'idle', errorMsg: '', result: null, feeEstimate: '', confirmed: false }
}

// ── Inline icons (from lucide-react — same as DeployStudio) ───────────────────

function IconLoader({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

function IconExternalLink({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" />
    </svg>
  )
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--periwinkle)]"
    >
      <IconCopy className="h-3.5 w-3.5 shrink-0" />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── VerifyList ────────────────────────────────────────────────────────────────

function VerifyList({ lines }: { lines: VerifyLine[] }) {
  return (
    <ul className="mt-3 space-y-1" aria-label="Verification results">
      {lines.map((line, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {line.ok
            ? <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
            : <IconX className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
          <span className={line.ok ? 'text-green-300' : 'text-red-300'}>{line.message}</span>
        </li>
      ))}
    </ul>
  )
}

// ── ConfirmBox ────────────────────────────────────────────────────────────────

interface ConfirmBoxProps {
  contractName: string
  bytecode: string
  feeEstimate: string
  deployer: string
  extra?: React.ReactNode
  confirmed: boolean
  onConfirm: (v: boolean) => void
  disabled: boolean
}

function ConfirmBox({
  contractName,
  bytecode,
  feeEstimate,
  deployer,
  extra,
  confirmed,
  onConfirm,
  disabled,
}: ConfirmBoxProps) {
  const checkId = useId()
  const sizeBytes = bytecodeSizeBytes(bytecode)

  return (
    <div className="arc-panel mt-5 space-y-3 px-4 py-4 text-sm">
      <p className="font-medium text-white">Before you sign</p>
      <dl className="space-y-1 text-[var(--muted)]">
        <div className="flex flex-wrap gap-x-3">
          <dt className="w-28 shrink-0 text-[var(--faint)]">Contract</dt>
          <dd className="font-['Geist_Mono']">{contractName}</dd>
        </div>
        <div className="flex flex-wrap gap-x-3">
          <dt className="w-28 shrink-0 text-[var(--faint)]">Bytecode size</dt>
          <dd className="font-['Geist_Mono']">
            {new Intl.NumberFormat('en-US').format(sizeBytes)} bytes
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-3">
          <dt className="w-28 shrink-0 text-[var(--faint)]">Est. fee</dt>
          <dd className="font-['Geist_Mono']">{feeEstimate || 'calculating…'}</dd>
        </div>
        <div className="flex flex-wrap gap-x-3">
          <dt className="w-28 shrink-0 text-[var(--faint)]">Deployer</dt>
          <dd className="break-all font-['Geist_Mono'] text-xs">{deployer}</dd>
        </div>
      </dl>
      {extra}
      <label htmlFor={checkId} className="flex cursor-pointer items-start gap-3 pt-1">
        <input
          id={checkId}
          type="checkbox"
          checked={confirmed}
          onChange={e => onConfirm(e.target.checked)}
          disabled={disabled}
          aria-label={`I have reviewed the deployment details for ${contractName}`}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--periwinkle)] disabled:opacity-50"
        />
        <span className="text-[var(--muted)]">
          I have reviewed the details above and want to deploy <strong className="text-white">{contractName}</strong>.
        </span>
      </label>
    </div>
  )
}

// ── ResultPanel ───────────────────────────────────────────────────────────────

function ResultPanel({ result, contractName }: { result: StepResult; contractName: string }) {
  return (
    <div className="arc-panel mt-5 space-y-3 p-4" aria-label={`${contractName} deployment result`}>
      <p className="flex items-center gap-2 font-medium text-white">
        <IconCheck className="h-4 w-4 shrink-0 text-green-400" />
        {contractName} deployed
      </p>

      <div className="space-y-1">
        <p className="text-xs text-[var(--faint)]">Contract address</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all font-['Geist_Mono'] text-xs text-[var(--periwinkle)]">
            {result.contractAddress}
          </span>
          <CopyButton value={result.contractAddress} label="contract address" />
          <a
            href={buildAddressExplorerUrl(CHAIN_ID, result.contractAddress)}
            target="_blank"
            rel="noreferrer"
            aria-label={`View ${contractName} on explorer`}
            className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
          >
            Explorer <IconExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-[var(--faint)]">Transaction hash</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all font-['Geist_Mono'] text-xs text-[var(--muted)]">
            {result.txHash}
          </span>
          <CopyButton value={result.txHash} label="transaction hash" />
          <a
            href={buildTxExplorerUrl(CHAIN_ID, result.txHash)}
            target="_blank"
            rel="noreferrer"
            aria-label="View transaction on explorer"
            className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
          >
            Tx <IconExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <VerifyList lines={result.verifyLines} />
    </div>
  )
}

// ── GmBoardStep ───────────────────────────────────────────────────────────────

interface GmBoardStepProps {
  active: boolean
  onDone: () => void
}

function GmBoardStep({ active, onDone }: GmBoardStepProps) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })

  const [state, setState] = useState<StepState>(initialStep)
  const liveId = useId()

  const wrongChain = isConnected && chainId !== CHAIN_ID
  const busy = state.status === 'deploying'
  const bytecode = GmBoardBytecode
  const deployer = address ?? '(no wallet)'

  async function estimate() {
    if (!publicClient || !address) return
    try {
      const initcode = encodeDeployData({ abi: GmBoardAbi, bytecode })
      const [gas, gasPrice] = await Promise.all([
        publicClient.estimateGas({ account: address, data: initcode }),
        publicClient.getGasPrice(),
      ])
      const fee = formatFeeEstimate(gas, gasPrice, NATIVE_DECIMALS)
      setState(s => ({ ...s, feeEstimate: fee }))
    } catch {
      setState(s => ({ ...s, feeEstimate: 'unknown' }))
    }
  }

  // Trigger estimate when the confirm box appears
  const showConfirm = active && state.status === 'idle' && isConnected && !wrongChain
  // Use a ref-free approach: estimate fires when the component is active & connected
  useState(() => { if (showConfirm) void estimate() })

  async function deploy() {
    if (!isConnected || !address) return
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    if (!walletClient) return
    if (!state.confirmed) return

    setState(s => ({ ...s, status: 'deploying', errorMsg: '' }))
    try {
      const txHash = await walletClient.deployContract({
        abi: GmBoardAbi,
        bytecode,
        args: [],
        chain: undefined,
      })

      const client = publicClient
      if (!client) throw new Error('No public client')
      const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 90_000, pollingInterval: 2_000 })
      if (receipt.status === 'reverted') throw new Error('Transaction reverted.')
      if (!receipt.contractAddress) throw new Error('No contract address in receipt.')

      const contractAddress = receipt.contractAddress

      // Verify
      const [code] = await Promise.all([
        client.getCode({ address: contractAddress }),
      ])
      const codeCheck = verifyCodeResult(code)
      const fromCheck = verifyFromResult(receipt.from, address)

      setState(s => ({
        ...s,
        status: 'success',
        result: {
          txHash,
          contractAddress,
          verifyLines: [codeCheck, fromCheck],
        },
      }))
      onDone()
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string }
      const detail = e.shortMessage ?? (e.message?.slice(0, 200) ?? 'Deployment failed')
      if (/user rejected|denied/i.test(detail)) {
        setState(s => ({ ...s, status: 'idle' }))
      } else {
        setState(s => ({ ...s, status: 'error', errorMsg: detail }))
      }
    }
  }

  return (
    <section aria-labelledby="step-gmboard-heading">
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            active ? 'bg-[var(--periwinkle)] text-[#0b1a30]' : 'bg-white/[0.08] text-[var(--faint)]',
          )}
          aria-hidden="true"
        >
          1
        </span>
        <h2
          id="step-gmboard-heading"
          className={clsx('text-lg font-medium', active ? 'text-white' : 'text-[var(--faint)]')}
        >
          GmBoard
        </h2>
      </div>

      {active && (
        <div className="mt-4 pl-10">
          <p className="text-sm text-[var(--muted)]">
            No constructor arguments. Deploys as-is.
          </p>

          {/* Wrong chain */}
          {wrongChain && (
            <p className="mt-3 text-sm text-amber-400" role="alert">
              You are on chain {chainId}. Switch to {NETWORK.name} to continue.
            </p>
          )}

          {/* Not connected */}
          {!isConnected && (
            <p className="mt-3 text-sm text-[var(--faint)]" role="alert">
              Connect your wallet to deploy.
            </p>
          )}

          {/* Confirm box */}
          {showConfirm && (
            <ConfirmBox
              contractName="GmBoard"
              bytecode={bytecode}
              feeEstimate={state.feeEstimate}
              deployer={deployer}
              confirmed={state.confirmed}
              onConfirm={v => setState(s => ({ ...s, confirmed: v }))}
              disabled={busy}
            />
          )}

          {/* Action buttons */}
          <div aria-live="polite" id={liveId} className="sr-only">
            {state.status === 'deploying' ? 'Deploying GmBoard, please wait…' : ''}
            {state.status === 'success' ? 'GmBoard deployed successfully.' : ''}
            {state.status === 'error' ? `GmBoard deployment failed: ${state.errorMsg}` : ''}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {wrongChain ? (
              <button
                onClick={() => switchChain({ chainId: CHAIN_ID })}
                className="arc-btn"
                aria-label={`Switch to ${NETWORK.name}`}
              >
                Switch to {NETWORK.name}
              </button>
            ) : state.status !== 'success' ? (
              <button
                onClick={() => { void deploy() }}
                disabled={busy || !isConnected || !state.confirmed}
                aria-disabled={busy || !isConnected || !state.confirmed}
                aria-describedby={liveId}
                className={clsx(
                  busy || !isConnected || !state.confirmed ? 'arc-btn-ghost opacity-60' : 'arc-btn',
                  'inline-flex items-center gap-2',
                )}
              >
                {busy && <IconLoader className="h-4 w-4" />}
                {busy ? 'Deploying…' : 'Deploy GmBoard'}
              </button>
            ) : null}
          </div>

          {/* Result */}
          {state.status === 'success' && state.result && (
            <ResultPanel result={state.result} contractName="GmBoard" />
          )}

          {/* Error */}
          {state.status === 'error' && (
            <div
              role="alert"
              className="arc-panel mt-4 p-4 text-sm text-red-300"
            >
              {state.errorMsg || 'Deployment failed. Check the console and try again.'}
              <button
                onClick={() => setState(s => ({ ...s, status: 'idle', errorMsg: '', confirmed: false }))}
                className="ml-3 underline hover:no-underline"
                aria-label="Retry GmBoard deployment"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── TipJarStep ────────────────────────────────────────────────────────────────

interface TipJarStepProps {
  active: boolean
}

function TipJarStep({ active }: TipJarStepProps) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })

  const [state, setState] = useState<StepState>(initialStep)
  const [ownerInput, setOwnerInput] = useState<string>('')
  const liveId = useId()
  const ownerInputId = useId()

  const wrongChain = isConnected && chainId !== CHAIN_ID
  const busy = state.status === 'deploying'
  const bytecode = TipJarBytecode
  const deployer = address ?? '(no wallet)'

  // Effective owner: use ownerInput if provided, else connected address
  const effectiveOwner: string = ownerInput.trim() !== '' ? ownerInput.trim() : (address ?? '')
  const mismatchWarning = address ? ownerMismatchWarning(effectiveOwner, address) : null

  async function estimate() {
    if (!publicClient || !address) return
    const owner = (effectiveOwner as `0x${string}`) || address
    try {
      const initcode = encodeDeployData({
        abi: TipJarAbi,
        bytecode,
        args: [owner],
      })
      const [gas, gasPrice] = await Promise.all([
        publicClient.estimateGas({ account: address, data: initcode }),
        publicClient.getGasPrice(),
      ])
      const fee = formatFeeEstimate(gas, gasPrice, NATIVE_DECIMALS)
      setState(s => ({ ...s, feeEstimate: fee }))
    } catch {
      setState(s => ({ ...s, feeEstimate: 'unknown' }))
    }
  }

  const showConfirm = active && state.status === 'idle' && isConnected && !wrongChain
  useState(() => { if (showConfirm) void estimate() })

  async function deploy() {
    if (!isConnected || !address) return
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    if (!walletClient) return
    if (!state.confirmed) return

    const owner = (effectiveOwner as `0x${string}`) || address

    setState(s => ({ ...s, status: 'deploying', errorMsg: '' }))
    try {
      const txHash = await walletClient.deployContract({
        abi: TipJarAbi,
        bytecode,
        args: [owner],
        chain: undefined,
      })

      const client = publicClient
      if (!client) throw new Error('No public client')
      const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 90_000, pollingInterval: 2_000 })
      if (receipt.status === 'reverted') throw new Error('Transaction reverted.')
      if (!receipt.contractAddress) throw new Error('No contract address in receipt.')

      const contractAddress = receipt.contractAddress

      // Verify: code + owner() + tx.from
      const [code, onchainOwner] = await Promise.all([
        client.getCode({ address: contractAddress }),
        client.readContract({
          address: contractAddress,
          abi: TipJarAbi,
          functionName: 'owner',
        }) as Promise<string>,
      ])
      const codeCheck = verifyCodeResult(code)
      const ownerCheck = verifyOwnerResult(onchainOwner, owner)
      const fromCheck = verifyFromResult(receipt.from, address)

      setState(s => ({
        ...s,
        status: 'success',
        result: {
          txHash,
          contractAddress,
          verifyLines: [codeCheck, ownerCheck, fromCheck],
        },
      }))
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string }
      const detail = e.shortMessage ?? (e.message?.slice(0, 200) ?? 'Deployment failed')
      if (/user rejected|denied/i.test(detail)) {
        setState(s => ({ ...s, status: 'idle' }))
      } else {
        setState(s => ({ ...s, status: 'error', errorMsg: detail }))
      }
    }
  }

  return (
    <section aria-labelledby="step-tipjar-heading">
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            active ? 'bg-[var(--periwinkle)] text-[#0b1a30]' : 'bg-white/[0.08] text-[var(--faint)]',
          )}
          aria-hidden="true"
        >
          2
        </span>
        <h2
          id="step-tipjar-heading"
          className={clsx('text-lg font-medium', active ? 'text-white' : 'text-[var(--faint)]')}
        >
          TipJar
        </h2>
      </div>

      {active && (
        <div className="mt-4 pl-10">
          <p className="text-sm text-[var(--muted)]">
            Constructor takes <code className="font-['Geist_Mono'] text-xs">owner_</code> — the address
            that can withdraw tokens. Defaults to your connected wallet.
          </p>

          {/* owner_ input */}
          <div className="mt-4">
            <label htmlFor={ownerInputId} className="block">
              <span className="arc-eyebrow !text-[10px]">owner_ address</span>
              <input
                id={ownerInputId}
                value={ownerInput}
                onChange={e => setOwnerInput(e.target.value)}
                placeholder={address ?? '0x…'}
                disabled={busy}
                spellCheck={false}
                aria-label="TipJar owner address"
                className="arc-panel mt-2 w-full px-4 py-3 font-['Geist_Mono'] text-sm text-white outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--periwinkle)] disabled:opacity-50"
              />
            </label>
            <p className="mt-1 text-xs text-[var(--faint)]">
              Leave blank to use the connected wallet address.
            </p>
          </div>

          {/* Owner mismatch warning */}
          {mismatchWarning && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-300"
            >
              {mismatchWarning}
            </div>
          )}

          {/* Wrong chain */}
          {wrongChain && (
            <p className="mt-3 text-sm text-amber-400" role="alert">
              You are on chain {chainId}. Switch to {NETWORK.name} to continue.
            </p>
          )}

          {/* Not connected */}
          {!isConnected && (
            <p className="mt-3 text-sm text-[var(--faint)]" role="alert">
              Connect your wallet to deploy.
            </p>
          )}

          {/* Confirm box */}
          {showConfirm && (
            <ConfirmBox
              contractName="TipJar"
              bytecode={bytecode}
              feeEstimate={state.feeEstimate}
              deployer={deployer}
              confirmed={state.confirmed}
              onConfirm={v => setState(s => ({ ...s, confirmed: v }))}
              disabled={busy}
              extra={
                effectiveOwner ? (
                  <div className="flex flex-wrap gap-x-3 text-sm text-[var(--muted)]">
                    <span className="w-28 shrink-0 text-[var(--faint)]">owner_ arg</span>
                    <span className="break-all font-['Geist_Mono'] text-xs">{effectiveOwner}</span>
                  </div>
                ) : undefined
              }
            />
          )}

          {/* Aria live */}
          <div aria-live="polite" id={liveId} className="sr-only">
            {state.status === 'deploying' ? 'Deploying TipJar, please wait…' : ''}
            {state.status === 'success' ? 'TipJar deployed successfully.' : ''}
            {state.status === 'error' ? `TipJar deployment failed: ${state.errorMsg}` : ''}
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap gap-3">
            {wrongChain ? (
              <button
                onClick={() => switchChain({ chainId: CHAIN_ID })}
                className="arc-btn"
                aria-label={`Switch to ${NETWORK.name}`}
              >
                Switch to {NETWORK.name}
              </button>
            ) : state.status !== 'success' ? (
              <button
                onClick={() => { void deploy() }}
                disabled={busy || !isConnected || !state.confirmed}
                aria-disabled={busy || !isConnected || !state.confirmed}
                aria-describedby={liveId}
                className={clsx(
                  busy || !isConnected || !state.confirmed ? 'arc-btn-ghost opacity-60' : 'arc-btn',
                  'inline-flex items-center gap-2',
                )}
              >
                {busy && <IconLoader className="h-4 w-4" />}
                {busy ? 'Deploying…' : 'Deploy TipJar'}
              </button>
            ) : null}
          </div>

          {/* Result */}
          {state.status === 'success' && state.result && (
            <ResultPanel result={state.result} contractName="TipJar" />
          )}

          {/* Error */}
          {state.status === 'error' && (
            <div
              role="alert"
              className="arc-panel mt-4 p-4 text-sm text-red-300"
            >
              {state.errorMsg || 'Deployment failed. Check the console and try again.'}
              <button
                onClick={() => setState(s => ({ ...s, status: 'idle', errorMsg: '', confirmed: false }))}
                className="ml-3 underline hover:no-underline"
                aria-label="Retry TipJar deployment"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── LocalDeploy (main export) ─────────────────────────────────────────────────

export function LocalDeploy() {
  const { isConnected } = useAccount()
  // Track which step is currently unlocked (0 = GmBoard, 1 = TipJar)
  const [unlockedStep, setUnlockedStep] = useState<0 | 1>(0)

  return (
    <div className="mx-auto max-w-[680px] space-y-12 px-4 py-8">
      {/* Header */}
      <header>
        <p className="arc-eyebrow mb-3">
          Local deploy ·{' '}
          <span className={IS_MAINNET ? 'text-red-400' : 'text-[var(--periwinkle)]'}>
            {NETWORK.name.toUpperCase()}
          </span>
        </p>
        <h1 className="text-2xl font-light tracking-tight text-white">
          Deploy GmBoard &amp; TipJar
        </h1>
        <p className="mt-2 max-w-[540px] text-sm leading-relaxed text-[var(--muted)]">
          Direct CREATE deployment — your MetaMask wallet signs each transaction.
          No CREATE2 factory; the deployer address is your connected wallet.
        </p>
        {!isConnected && (
          <p className="mt-3 text-sm text-amber-400" role="status">
            Connect your wallet to begin.
          </p>
        )}
      </header>

      {/* Mainnet warning */}
      {IS_MAINNET && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/50 bg-red-500/[0.08] px-5 py-4 text-sm font-medium text-red-300"
        >
          GERCEK PARA — You are deploying to Arc Mainnet. These transactions use
          real USDC for gas and cannot be reversed.
        </div>
      )}

      {/* Step 1: GmBoard */}
      <GmBoardStep
        active={unlockedStep === 0}
        onDone={() => setUnlockedStep(1)}
      />

      {/* Divider */}
      <hr className="border-[var(--line)]" aria-hidden="true" />

      {/* Step 2: TipJar */}
      <TipJarStep active={unlockedStep === 1} />
    </div>
  )
}
