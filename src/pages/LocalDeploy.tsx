/**
 * LocalDeploy — dev-only page for deploying Pulsarc platform contracts.
 *
 * INTENTIONALLY NOT WIRED INTO THE ROUTER — the caller gates this route with
 * import.meta.env.DEV.  This file must not appear in a production bundle.
 *
 * Contracts deployed (all independent steps, each always visible):
 *   1. GmBoard         — no args
 *   2. TipJar          — owner_ (default: connected wallet)
 *   3. ArcVoting       — no args
 *   4. ArcAttestation  — no args
 *   5. ArcBoost        — treasury_ (default: connected wallet), usdcToken_ (fixed)
 *   6. ArcWatchlistNFT — name_ (default "Arc Watchlist"), symbol_ (default "ARCW")
 *
 * Features:
 *   - Persistence: deployed contracts survive a page reload via localStorage
 *   - Timeout recovery: a WaitForTransactionReceiptTimeoutError keeps the hash
 *     visible with a "Check again" button rather than treating it as failure
 *   - Hash recovery box: enter any transaction hash to recover a lost deployment
 *
 * deps: wagmi, viem, @tanstack/react-query, lucide-react
 */

import { useState, useId, useEffect, useCallback, useRef } from 'react'
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi'
import { encodeDeployData, WaitForTransactionReceiptTimeoutError } from 'viem'
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
  ArcVotingAbi,
  ArcVotingBytecode,
  ArcAttestationAbi,
  ArcAttestationBytecode,
  ArcBoostAbi,
  ArcBoostBytecode,
  ArcWatchlistNFTAbi,
  ArcWatchlistNFTBytecode,
} from '@/contracts/platformDeployables'
import {
  bytecodeSizeBytes,
  formatFeeEstimate,
  ownerMismatchWarning,
  verifyCodeResult,
  verifyFromResult,
  verifyOwnerResult,
  isValidTxHash,
  isValidNonZeroAddress,
  validateTreasuryArg,
  validateTokenStringArg,
  loadDeploys,
  persistDeploy,
  forgetDeploy,
  type PersistedDeploy,
} from '@/lib/localDeployCore'

// ── Constants ─────────────────────────────────────────────────────────────────

const IS_MAINNET = CHAIN_ID === 5042

/** Arc USDC ERC-20 address — fixed for ArcBoost usdcToken_ constructor arg. */
const ARC_USDC_TOKEN = '0x3600000000000000000000000000000000000000' as const

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

type StepStatus =
  | 'idle'
  | 'confirming'
  | 'deploying'
  | 'pending_hash'   // tx sent; waiting for receipt but timed out
  | 'success'
  | 'error'

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
  pendingHash: string   // hash whose receipt hasn't confirmed yet
  checkingHash: boolean // true while getTransactionReceipt is in flight
}

function initialStep(): StepState {
  return {
    status: 'idle',
    errorMsg: '',
    result: null,
    feeEstimate: '',
    confirmed: false,
    pendingHash: '',
    checkingHash: false,
  }
}

// ── Inline icons ──────────────────────────────────────────────────────────────

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

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
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

// ── PersistedBanner ───────────────────────────────────────────────────────────

interface PersistedBannerProps {
  record: PersistedDeploy
  onForget: () => void
}

function PersistedBanner({ record, onForget }: PersistedBannerProps) {
  return (
    <div className="arc-panel mt-5 space-y-3 p-4" aria-label={`${record.name} previously deployed`}>
      <p className="flex items-center gap-2 font-medium text-white">
        <IconCheck className="h-4 w-4 shrink-0 text-green-400" />
        {record.name} — already deployed (saved)
      </p>

      <div className="space-y-1">
        <p className="text-xs text-[var(--faint)]">Contract address</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all font-['Geist_Mono'] text-xs text-[var(--periwinkle)]">
            {record.address}
          </span>
          <CopyButton value={record.address} label="contract address" />
          <a
            href={buildAddressExplorerUrl(CHAIN_ID, record.address)}
            target="_blank"
            rel="noreferrer"
            aria-label={`View ${record.name} on explorer`}
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
            {record.txHash}
          </span>
          <CopyButton value={record.txHash} label="transaction hash" />
          <a
            href={buildTxExplorerUrl(CHAIN_ID, record.txHash)}
            target="_blank"
            rel="noreferrer"
            aria-label="View transaction on explorer"
            className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
          >
            Tx <IconExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <p className="text-xs text-[var(--faint)]">
        Deployer: <span className="font-['Geist_Mono']">{record.deployer}</span>
      </p>

      <button
        onClick={onForget}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] underline hover:text-red-300 hover:no-underline"
        aria-label={`Forget saved ${record.name} deployment`}
      >
        <IconTrash className="h-3.5 w-3.5" />
        Forget this deployment
      </button>
    </div>
  )
}

// ── PendingHashPanel ──────────────────────────────────────────────────────────

interface PendingHashPanelProps {
  hash: string
  checking: boolean
  onCheck: () => void
  onReset: () => void
}

function PendingHashPanel({ hash, checking, onCheck, onReset }: PendingHashPanelProps) {
  return (
    <div
      role="alert"
      className="arc-panel mt-5 space-y-3 p-4 text-sm"
    >
      <p className="font-medium text-amber-300">Transaction sent — confirmation pending</p>
      <p className="text-[var(--muted)]">
        The transaction was sent but the receipt has not been confirmed yet.
      </p>
      <div className="space-y-1">
        <p className="text-xs text-[var(--faint)]">Transaction hash</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all font-['Geist_Mono'] text-xs text-[var(--muted)]">{hash}</span>
          <CopyButton value={hash} label="transaction hash" />
          <a
            href={buildTxExplorerUrl(CHAIN_ID, hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
          >
            Tx <IconExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          onClick={onCheck}
          disabled={checking}
          className={clsx(
            'inline-flex items-center gap-2',
            checking ? 'arc-btn-ghost opacity-60' : 'arc-btn',
          )}
        >
          {checking && <IconLoader className="h-4 w-4" />}
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <button
          onClick={onReset}
          className="text-xs text-[var(--muted)] underline hover:no-underline"
        >
          Reset step
        </button>
      </div>
    </div>
  )
}

// ── HashRecoveryBox ───────────────────────────────────────────────────────────

interface HashRecoveryBoxProps {
  contractName: string
  onRecover: (hash: `0x${string}`) => void
  recovering: boolean
  disabled: boolean
}

function HashRecoveryBox({ contractName, onRecover, recovering, disabled }: HashRecoveryBoxProps) {
  const inputId = useId()
  const [input, setInput] = useState('')
  const isValid = isValidTxHash(input.trim())

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || disabled) return
    onRecover(input.trim() as `0x${string}`)
  }

  return (
    <details className="mt-5 text-sm">
      <summary className="cursor-pointer text-[var(--muted)] hover:text-white">
        Recover from a transaction hash
      </summary>
      <form onSubmit={handleSubmit} className="arc-panel mt-3 space-y-3 p-4">
        <p className="text-xs text-[var(--faint)]">
          If you deployed {contractName} but the page lost track of the transaction,
          enter the hash here to check the receipt and recover the contract address.
        </p>
        <label htmlFor={inputId} className="block">
          <span className="arc-eyebrow !text-[10px]">Transaction hash</span>
          <input
            id={inputId}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={'0x' + '0'.repeat(64)}
            disabled={disabled || recovering}
            spellCheck={false}
            aria-label={`Recovery transaction hash for ${contractName}`}
            className="arc-panel mt-2 w-full px-4 py-3 font-['Geist_Mono'] text-xs text-white outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--periwinkle)] disabled:opacity-50"
          />
        </label>
        {input.length > 0 && !isValid && (
          <p className="text-xs text-red-300" role="alert">
            Must be a valid 0x-prefixed 64-hex-character transaction hash.
          </p>
        )}
        <button
          type="submit"
          disabled={!isValid || disabled || recovering}
          className={clsx(
            'inline-flex items-center gap-2',
            !isValid || disabled || recovering ? 'arc-btn-ghost opacity-60' : 'arc-btn',
          )}
        >
          {recovering && <IconLoader className="h-4 w-4" />}
          {recovering ? 'Checking…' : 'Look up receipt'}
        </button>
      </form>
    </details>
  )
}

// ── usePublicClientForChain ───────────────────────────────────────────────────

/** Thin wrapper so every step uses the same public client for CHAIN_ID. */
function useDeployPublicClient() {
  return usePublicClient({ chainId: CHAIN_ID })
}

// ── useDeployStep — shared hook for all step components ───────────────────────

/**
 * Verify a receipt once we have it (hash + contractAddress known).
 * Returns the verifyLines array.
 */
async function runVerifications(
  client: NonNullable<ReturnType<typeof useDeployPublicClient>>,
  contractAddress: `0x${string}`,
  txFrom: string,
  connectedAddress: string,
  abi: readonly unknown[],
  extraChecks?: () => Promise<VerifyLine[]>,
): Promise<VerifyLine[]> {
  const code = await client.getCode({ address: contractAddress })
  const codeCheck = verifyCodeResult(code)
  const fromCheck = verifyFromResult(txFrom, connectedAddress)
  const lines: VerifyLine[] = [codeCheck, fromCheck]
  if (extraChecks) {
    const extra = await extraChecks()
    lines.push(...extra)
  }
  return lines
}

// ── DeployStep ────────────────────────────────────────────────────────────────
//
// Config-driven step component. Replaces the duplicated GmBoardStep/TipJarStep
// pattern with a single component that takes a `config` object.

interface ArgField {
  id: string
  label: string
  placeholder: (address: string) => string
  defaultValue: (address: string) => string
  readOnly?: boolean
  validate?: (v: string) => { ok: boolean; message: string }
  /** If true, show owner-mismatch style warning when this differs from the connected wallet. */
  mismatchCheck?: boolean
}

interface DeployStepConfig {
  index: number
  contractName: string
  abi: readonly unknown[]
  bytecode: string
  /** Called to build the constructor args array from current arg field values. */
  buildArgs: (fields: Record<string, string>, address: string) => unknown[]
  /** Called to build the encodeDeployData args for gas estimation. Same signature. */
  buildEstimateArgs: (fields: Record<string, string>, address: string) => unknown[]
  argFields?: ArgField[]
  /** Extra ConfirmBox content (dl rows for constructor args). */
  confirmExtra?: (fields: Record<string, string>, address: string) => React.ReactNode
  /** Extra post-deploy verifications. */
  extraVerify?: (
    client: NonNullable<ReturnType<typeof useDeployPublicClient>>,
    contractAddress: `0x${string}`,
    fields: Record<string, string>,
    address: string,
  ) => Promise<VerifyLine[]>
}

interface DeployStepProps {
  config: DeployStepConfig
}

function DeployStep({ config }: DeployStepProps) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = useDeployPublicClient()

  const contractName = config.contractName
  const deployer = address ?? '(no wallet)'
  const wrongChain = isConnected && chainId !== CHAIN_ID
  const showConfirm = !wrongChain && isConnected

  // ── Persisted state ─────────────────────────────────────────────────────────
  const [persisted, setPersisted] = useState<PersistedDeploy | null>(() => {
    const records = loadDeploys(CHAIN_ID)
    return records.find(r => r.name === contractName) ?? null
  })

  // ── Step state ──────────────────────────────────────────────────────────────
  const [state, setState] = useState<StepState>(initialStep)
  // Arg field values keyed by field id
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    for (const f of config.argFields ?? []) {
      defaults[f.id] = ''  // empty = use defaultValue at call time
    }
    return defaults
  })

  const busy = state.status === 'deploying'
  const hasPendingHash = state.status === 'pending_hash' && !!state.pendingHash

  const liveId = useId()

  // ── Fee estimation ──────────────────────────────────────────────────────────
  const estimate = useCallback(async () => {
    if (!publicClient || !address) return
    try {
      const args = config.buildEstimateArgs(fieldValues, address)
      const initcode = encodeDeployData({
        abi: config.abi,
        bytecode: config.bytecode as `0x${string}`,
        args,
      })
      const [gas, gasPrice] = await Promise.all([
        publicClient.estimateGas({ account: address, data: initcode }),
        publicClient.getGasPrice(),
      ])
      setState(s => ({ ...s, feeEstimate: formatFeeEstimate(gas, gasPrice, NATIVE_DECIMALS) }))
    } catch {
      setState(s => ({ ...s, feeEstimate: 'unknown' }))
    }
  }, [publicClient, address, config, fieldValues])

  // Trigger estimate whenever the confirm box is visible and estimate is blank.
  // We use a ref-guarded effect to avoid triggering the set-state-in-effect lint:
  // estimate() is called asynchronously (via setTimeout(0)) so no setState fires
  // synchronously within the effect body.
  const estimateFnRef = useRef(estimate)
  estimateFnRef.current = estimate
  useEffect(() => {
    if (showConfirm && state.status === 'idle' && !state.feeEstimate) {
      const id = setTimeout(() => { void estimateFnRef.current() }, 0)
      return () => clearTimeout(id)
    }
    return undefined
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConfirm, state.status, state.feeEstimate])

  // ── Complete a successful receipt ───────────────────────────────────────────
  const completeFromReceipt = useCallback(async (
    txHash: `0x${string}`,
    receipt: { contractAddress: `0x${string}` | null; from: string; status: string },
  ) => {
    if (receipt.status === 'reverted') {
      setState(s => ({ ...s, status: 'error', errorMsg: 'Transaction reverted.', checkingHash: false }))
      return
    }
    if (!receipt.contractAddress) {
      setState(s => ({ ...s, status: 'error', errorMsg: 'No contract address in receipt.', checkingHash: false }))
      return
    }
    const contractAddress = receipt.contractAddress

    const client = publicClient
    if (!client) {
      setState(s => ({ ...s, status: 'error', errorMsg: 'No public client.', checkingHash: false }))
      return
    }

    // The transaction must be a deployment of THIS contract: its input starts with the creation
    // bytecode. Guards against pasting another contract's hash into the recovery box.
    try {
      const tx = await client.getTransaction({ hash: txHash })
      if (!tx.input.toLowerCase().startsWith(config.bytecode.toLowerCase())) {
        setState(s => ({
          ...s,
          status: 'error',
          errorMsg: `That transaction did not deploy ${contractName} (different bytecode). Nothing was recorded.`,
          checkingHash: false,
          pendingHash: '',
        }))
        return
      }
    } catch {
      setState(s => ({
        ...s,
        status: 'error',
        errorMsg: 'Could not read the transaction to check its bytecode. Nothing was recorded; try again.',
        checkingHash: false,
        pendingHash: '',
      }))
      return
    }

    let verifyLines: VerifyLine[]
    try {
      verifyLines = await runVerifications(
        client,
        contractAddress,
        receipt.from,
        address ?? '',
        config.abi,
        config.extraVerify
          ? () => config.extraVerify!(client, contractAddress, fieldValues, address ?? '')
          : undefined,
      )
    } catch {
      verifyLines = [{ ok: false, message: 'Post-deploy verification failed.' }]
    }

    const result: StepResult = { txHash, contractAddress, verifyLines }
    setState(s => ({
      ...s,
      status: 'success',
      result,
      checkingHash: false,
      pendingHash: '',
    }))

    // Persist
    const record: PersistedDeploy = {
      name: contractName,
      address: contractAddress,
      txHash,
      chainId: CHAIN_ID,
      deployer: address ?? '',
    }
    persistDeploy(record)
    setPersisted(record)
  }, [publicClient, address, config, contractName, fieldValues])

  // ── Check pending hash ──────────────────────────────────────────────────────
  const checkPendingHash = useCallback(async (hash: `0x${string}`) => {
    const client = publicClient
    if (!client) return
    setState(s => ({ ...s, checkingHash: true }))
    try {
      const receipt = await client.getTransactionReceipt({ hash })
      await completeFromReceipt(hash, receipt as Parameters<typeof completeFromReceipt>[1])
    } catch {
      // Not mined yet or other error — leave pending state
      setState(s => ({ ...s, checkingHash: false }))
    }
  }, [publicClient, completeFromReceipt])

  // ── Deploy ──────────────────────────────────────────────────────────────────
  async function deploy() {
    if (!isConnected || !address) return
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    if (!walletClient) return
    if (!state.confirmed) return

    setState(s => ({ ...s, status: 'deploying', errorMsg: '' }))

    let txHash: `0x${string}` | undefined
    try {
      const args = config.buildArgs(fieldValues, address)
      txHash = await walletClient.deployContract({
        abi: config.abi as Parameters<typeof walletClient.deployContract>[0]['abi'],
        bytecode: config.bytecode as `0x${string}`,
        args,
        chain: undefined,
      })

      const client = publicClient
      if (!client) throw new Error('No public client')

      try {
        const receipt = await client.waitForTransactionReceipt({
          hash: txHash,
          timeout: 300_000,
          pollingInterval: 2_000,
        })
        await completeFromReceipt(txHash, receipt as Parameters<typeof completeFromReceipt>[1])
      } catch (waitErr) {
        // Timeout — do NOT treat as failure. Show pending panel.
        if (waitErr instanceof WaitForTransactionReceiptTimeoutError) {
          setState(s => ({
            ...s,
            status: 'pending_hash',
            pendingHash: txHash ?? '',
            errorMsg: '',
          }))
        } else {
          throw waitErr
        }
      }
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string }
      const detail = e.shortMessage ?? (e.message?.slice(0, 200) ?? 'Deployment failed')
      if (/user rejected|denied/i.test(detail)) {
        setState(s => ({ ...s, status: 'idle', errorMsg: '' }))
      } else if (txHash) {
        // We have a hash but something else went wrong — show pending state
        setState(s => ({
          ...s,
          status: 'pending_hash',
          pendingHash: txHash ?? '',
          errorMsg: '',
        }))
      } else {
        setState(s => ({ ...s, status: 'error', errorMsg: detail }))
      }
    }
  }

  // ── Hash recovery ───────────────────────────────────────────────────────────
  async function recoverFromHash(hash: `0x${string}`) {
    const client = publicClient
    if (!client) return
    setState(s => ({
      ...s,
      status: 'pending_hash',
      pendingHash: hash,
      checkingHash: true,
      errorMsg: '',
    }))
    try {
      const receipt = await client.getTransactionReceipt({ hash })
      await completeFromReceipt(hash, receipt as Parameters<typeof completeFromReceipt>[1])
    } catch {
      setState(s => ({
        ...s,
        checkingHash: false,
        errorMsg: 'Could not find a mined receipt for that hash. The transaction may not be confirmed yet.',
      }))
    }
  }

  // ── Forget persisted ────────────────────────────────────────────────────────
  function handleForget() {
    forgetDeploy(contractName, CHAIN_ID)
    setPersisted(null)
    setState(initialStep())
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const stepNum = config.index + 1
  const headingId = `step-${contractName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-heading`
  const isSuccess = state.status === 'success'
  const active = !persisted  // when persisted, the step shows the banner instead

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            active ? 'bg-[var(--periwinkle)] text-[#0b1a30]' : 'bg-white/[0.08] text-[var(--faint)]',
          )}
          aria-hidden="true"
        >
          {stepNum}
        </span>
        <h2
          id={headingId}
          className={clsx('text-lg font-medium', active ? 'text-white' : 'text-[var(--faint)]')}
        >
          {contractName}
        </h2>
      </div>

      <div className="mt-4 pl-10">

        {/* Already deployed (persisted) */}
        {persisted && (
          <PersistedBanner record={persisted} onForget={handleForget} />
        )}

        {/* Active deployment flow */}
        {!persisted && (
          <>
            {/* Arg fields */}
            {(config.argFields ?? []).map(field => {
              const currentVal = fieldValues[field.id] ?? ''
              const effectiveVal = currentVal.trim() !== '' ? currentVal.trim() : field.defaultValue(address ?? '')
              const validation = field.validate ? field.validate(effectiveVal) : null
              const mismatch = field.mismatchCheck && address
                ? ownerMismatchWarning(effectiveVal, address)
                : null
              const fieldInputId = `field-${headingId}-${field.id}`

              return (
                <div key={field.id} className="mt-4">
                  <label htmlFor={fieldInputId} className="block">
                    <span className="arc-eyebrow !text-[10px]">{field.label}</span>
                    <input
                      id={fieldInputId}
                      value={currentVal}
                      onChange={e => {
                        setFieldValues(v => ({ ...v, [field.id]: e.target.value }))
                        // Re-estimate when field changes
                        setState(s => ({ ...s, feeEstimate: '' }))
                      }}
                      placeholder={field.placeholder(address ?? '')}
                      disabled={busy || !!field.readOnly}
                      readOnly={!!field.readOnly}
                      spellCheck={false}
                      aria-label={`${field.label} for ${contractName}`}
                      className={clsx(
                        'arc-panel mt-2 w-full px-4 py-3 font-[\'Geist_Mono\'] text-sm text-white outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--periwinkle)] disabled:opacity-50',
                        field.readOnly && 'cursor-default opacity-70',
                      )}
                    />
                  </label>
                  {field.readOnly ? (
                    <p className="mt-1 text-xs text-[var(--faint)]">Fixed — not editable.</p>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--faint)]">
                      Leave blank to use {field.placeholder(address ?? '')}.
                    </p>
                  )}
                  {/* Validation error */}
                  {validation && !validation.ok && effectiveVal !== '' && (
                    <p className="mt-1 text-xs text-red-300" role="alert">{validation.message}</p>
                  )}
                  {/* Mismatch warning */}
                  {mismatch && (
                    <div
                      role="alert"
                      className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-300"
                    >
                      {mismatch}
                    </div>
                  )}
                </div>
              )
            })}

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
            {showConfirm && state.status === 'idle' && (
              <ConfirmBox
                contractName={contractName}
                bytecode={config.bytecode}
                feeEstimate={state.feeEstimate}
                deployer={deployer}
                confirmed={state.confirmed}
                onConfirm={v => setState(s => ({ ...s, confirmed: v }))}
                disabled={busy}
                extra={config.confirmExtra
                  ? config.confirmExtra(fieldValues, address ?? '')
                  : undefined
                }
              />
            )}

            {/* Aria live */}
            <div aria-live="polite" id={liveId} className="sr-only">
              {busy ? `Deploying ${contractName}, please wait…` : ''}
              {isSuccess ? `${contractName} deployed successfully.` : ''}
              {state.status === 'error' ? `${contractName} deployment failed: ${state.errorMsg}` : ''}
              {hasPendingHash ? `${contractName} transaction sent, awaiting confirmation.` : ''}
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
              ) : state.status !== 'success' && !hasPendingHash ? (
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
                  {busy ? 'Deploying…' : `Deploy ${contractName}`}
                </button>
              ) : null}
            </div>

            {/* Pending hash panel */}
            {hasPendingHash && (
              <PendingHashPanel
                hash={state.pendingHash}
                checking={state.checkingHash}
                onCheck={() => { void checkPendingHash(state.pendingHash as `0x${string}`) }}
                onReset={() => setState(initialStep())}
              />
            )}

            {/* Result */}
            {isSuccess && state.result && (
              <ResultPanel result={state.result} contractName={contractName} />
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
                  aria-label={`Retry ${contractName} deployment`}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Hash recovery */}
            {state.status !== 'success' && (
              <HashRecoveryBox
                contractName={contractName}
                onRecover={hash => { void recoverFromHash(hash) }}
                recovering={state.status === 'pending_hash' && state.checkingHash}
                disabled={busy}
              />
            )}
          </>
        )}
      </div>
    </section>
  )
}

// ── Step configurations ───────────────────────────────────────────────────────

const STEP_CONFIGS: DeployStepConfig[] = [
  // 1. GmBoard
  {
    index: 0,
    contractName: 'GmBoard',
    abi: GmBoardAbi,
    bytecode: GmBoardBytecode,
    buildArgs: () => [],
    buildEstimateArgs: () => [],
  },

  // 2. TipJar
  {
    index: 1,
    contractName: 'TipJar',
    abi: TipJarAbi,
    bytecode: TipJarBytecode,
    argFields: [
      {
        id: 'owner_',
        label: 'owner_ address',
        placeholder: addr => addr || '0x…',
        defaultValue: addr => addr,
        validate: v => ({
          ok: isValidNonZeroAddress(v) || v === '',
          message: 'Must be a valid non-zero Ethereum address.',
        }),
        mismatchCheck: true,
      },
    ],
    buildArgs: (fields, address) => {
      const val = (fields['owner_'] ?? '').trim()
      return [val !== '' ? val : address]
    },
    buildEstimateArgs: (fields, address) => {
      const val = (fields['owner_'] ?? '').trim()
      return [val !== '' ? val : address]
    },
    confirmExtra: (fields, address) => {
      const val = (fields['owner_'] ?? '').trim()
      const effective = val !== '' ? val : address
      return effective ? (
        <div className="flex flex-wrap gap-x-3 text-sm text-[var(--muted)]">
          <span className="w-28 shrink-0 text-[var(--faint)]">owner_ arg</span>
          <span className="break-all font-['Geist_Mono'] text-xs">{effective}</span>
        </div>
      ) : null
    },
    extraVerify: async (client, contractAddress, fields, address) => {
      const val = (fields['owner_'] ?? '').trim()
      const expected = val !== '' ? val : address
      const onchainOwner = await client.readContract({
        address: contractAddress,
        abi: TipJarAbi,
        functionName: 'owner',
      }) as string
      return [verifyOwnerResult(onchainOwner, expected)]
    },
  },

  // 3. ArcVoting
  {
    index: 2,
    contractName: 'ArcVoting',
    abi: ArcVotingAbi,
    bytecode: ArcVotingBytecode,
    buildArgs: () => [],
    buildEstimateArgs: () => [],
  },

  // 4. ArcAttestation
  {
    index: 3,
    contractName: 'ArcAttestation',
    abi: ArcAttestationAbi,
    bytecode: ArcAttestationBytecode,
    buildArgs: () => [],
    buildEstimateArgs: () => [],
  },

  // 5. ArcBoost
  {
    index: 4,
    contractName: 'ArcBoost',
    abi: ArcBoostAbi,
    bytecode: ArcBoostBytecode,
    argFields: [
      {
        id: 'treasury_',
        label: 'treasury_ address',
        placeholder: addr => addr || '0x…',
        defaultValue: addr => addr,
        validate: v => validateTreasuryArg(v.trim() !== '' ? v : '0x' + 'a'.repeat(40)),
        mismatchCheck: true,
      },
      {
        id: 'usdcToken_',
        label: 'usdcToken_ address (Arc USDC)',
        placeholder: () => ARC_USDC_TOKEN,
        defaultValue: () => ARC_USDC_TOKEN,
        readOnly: true,
      },
    ],
    buildArgs: (fields, address) => {
      const treasury = (fields['treasury_'] ?? '').trim()
      return [treasury !== '' ? treasury : address, ARC_USDC_TOKEN]
    },
    buildEstimateArgs: (fields, address) => {
      const treasury = (fields['treasury_'] ?? '').trim()
      return [treasury !== '' ? treasury : address, ARC_USDC_TOKEN]
    },
    confirmExtra: (fields, address) => {
      const treasury = (fields['treasury_'] ?? '').trim()
      const effectiveTreasury = treasury !== '' ? treasury : address
      return (
        <>
          {effectiveTreasury && (
            <div className="flex flex-wrap gap-x-3 text-sm text-[var(--muted)]">
              <span className="w-28 shrink-0 text-[var(--faint)]">treasury_ arg</span>
              <span className="break-all font-['Geist_Mono'] text-xs">{effectiveTreasury}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 text-sm text-[var(--muted)]">
            <span className="w-28 shrink-0 text-[var(--faint)]">usdcToken_ arg</span>
            <span className="break-all font-['Geist_Mono'] text-xs">{ARC_USDC_TOKEN}</span>
          </div>
        </>
      )
    },
    extraVerify: async (client, contractAddress, fields, address) => {
      const treasury = (fields['treasury_'] ?? '').trim()
      const expectedTreasury = treasury !== '' ? treasury : address
      const [onchainOwner, onchainTreasury, onchainUsdc] = await Promise.all([
        client.readContract({ address: contractAddress, abi: ArcBoostAbi, functionName: 'owner' }) as Promise<string>,
        client.readContract({ address: contractAddress, abi: ArcBoostAbi, functionName: 'treasury' }) as Promise<string>,
        client.readContract({ address: contractAddress, abi: ArcBoostAbi, functionName: 'usdcToken' }) as Promise<string>,
      ])
      const ownerCheck = verifyOwnerResult(onchainOwner, address)
      const treasuryOk = onchainTreasury.toLowerCase() === expectedTreasury.toLowerCase()
      const usdcOk = onchainUsdc.toLowerCase() === ARC_USDC_TOKEN.toLowerCase()
      return [
        ownerCheck,
        {
          ok: treasuryOk,
          message: treasuryOk
            ? `treasury() matches expected (${expectedTreasury}).`
            : `treasury() mismatch: got ${onchainTreasury}, expected ${expectedTreasury}.`,
        },
        {
          ok: usdcOk,
          message: usdcOk
            ? `usdcToken() matches expected (${ARC_USDC_TOKEN}).`
            : `usdcToken() mismatch: got ${onchainUsdc}, expected ${ARC_USDC_TOKEN}.`,
        },
      ]
    },
  },

  // 6. ArcWatchlistNFT
  {
    index: 5,
    contractName: 'ArcWatchlistNFT',
    abi: ArcWatchlistNFTAbi,
    bytecode: ArcWatchlistNFTBytecode,
    argFields: [
      {
        id: 'name_',
        label: 'name_',
        placeholder: () => 'Arc Watchlist',
        defaultValue: () => 'Arc Watchlist',
        validate: v => validateTokenStringArg(v, 'name_'),
      },
      {
        id: 'symbol_',
        label: 'symbol_',
        placeholder: () => 'ARCW',
        defaultValue: () => 'ARCW',
        validate: v => validateTokenStringArg(v, 'symbol_'),
      },
    ],
    buildArgs: (fields) => {
      const name = (fields['name_'] ?? '').trim() || 'Arc Watchlist'
      const symbol = (fields['symbol_'] ?? '').trim() || 'ARCW'
      return [name, symbol]
    },
    buildEstimateArgs: (fields) => {
      const name = (fields['name_'] ?? '').trim() || 'Arc Watchlist'
      const symbol = (fields['symbol_'] ?? '').trim() || 'ARCW'
      return [name, symbol]
    },
    confirmExtra: (fields) => {
      const name = (fields['name_'] ?? '').trim() || 'Arc Watchlist'
      const symbol = (fields['symbol_'] ?? '').trim() || 'ARCW'
      return (
        <>
          <div className="flex flex-wrap gap-x-3 text-sm text-[var(--muted)]">
            <span className="w-28 shrink-0 text-[var(--faint)]">name_ arg</span>
            <span className="font-['Geist_Mono'] text-xs">{name}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-sm text-[var(--muted)]">
            <span className="w-28 shrink-0 text-[var(--faint)]">symbol_ arg</span>
            <span className="font-['Geist_Mono'] text-xs">{symbol}</span>
          </div>
        </>
      )
    },
    extraVerify: async (client, contractAddress, fields) => {
      const expectedName = (fields['name_'] ?? '').trim() || 'Arc Watchlist'
      const expectedSymbol = (fields['symbol_'] ?? '').trim() || 'ARCW'
      const [onchainName, onchainSymbol] = await Promise.all([
        client.readContract({ address: contractAddress, abi: ArcWatchlistNFTAbi, functionName: 'name' }),
        client.readContract({ address: contractAddress, abi: ArcWatchlistNFTAbi, functionName: 'symbol' }),
      ])
      const nameOk = onchainName === expectedName
      const symbolOk = onchainSymbol === expectedSymbol
      return [
        {
          ok: nameOk,
          message: nameOk
            ? `name() matches expected ("${expectedName}").`
            : `name() mismatch: got "${onchainName}", expected "${expectedName}".`,
        },
        {
          ok: symbolOk,
          message: symbolOk
            ? `symbol() matches expected ("${expectedSymbol}").`
            : `symbol() mismatch: got "${onchainSymbol}", expected "${expectedSymbol}".`,
        },
      ]
    },
  },
]

// ── LocalDeploy (main export) ─────────────────────────────────────────────────

export function LocalDeploy() {
  const { isConnected } = useAccount()

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
          Deploy Pulsarc Platform Contracts
        </h1>
        <p className="mt-2 max-w-[540px] text-sm leading-relaxed text-[var(--muted)]">
          Direct CREATE deployment — your MetaMask wallet signs each transaction.
          No CREATE2 factory; the deployer address is your connected wallet.
          Each step is independent. Previously deployed contracts are remembered
          across page reloads.
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

      {/* Steps */}
      {STEP_CONFIGS.map((cfg, i) => (
        <div key={cfg.contractName}>
          <DeployStep config={cfg} />
          {i < STEP_CONFIGS.length - 1 && (
            <hr className="mt-12 border-[var(--line)]" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  )
}
