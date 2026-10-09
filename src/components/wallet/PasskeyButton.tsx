/**
 * PasskeyButton — "Use a passkey" secondary connect option.
 *
 * Rendered below the primary ConnectKit button.  Hidden when:
 *   • VITE_CLIENT_KEY is absent (connector not configured)
 *   • The browser does not support WebAuthn
 *   • A wallet is already connected
 *
 * On first visit: prompts for a username then registers a new passkey.
 * On returning visits: calls login directly (no username prompt).
 *
 * The modal is minimal — a single text input + two buttons — reusing the
 * existing Pulsarc color tokens so no new design work is needed.
 */

import { useState, useEffect } from 'react'
import { useConnect, useAccount } from 'wagmi'
import { Fingerprint, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  CIRCLE_PASSKEY_CONNECTOR_ID,
  isPasskeySupported,
  loadStoredCredential,
  clearCredential,
} from '@/lib/circlePasskey'

export function PasskeyButton() {
  const { isConnected } = useAccount()
  const { connect, connectors } = useConnect()

  const [visible, setVisible] = useState(false)
  const [supported, setSupported] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [isReturning, setIsReturning] = useState(false)

  useEffect(() => {
    const key = import.meta.env.VITE_CLIENT_KEY as string | undefined
    const supported = isPasskeySupported()
    setHasKey(!!key)
    setSupported(supported)
    setVisible(!!key && supported && !isConnected)
    setIsReturning(loadStoredCredential() !== null)
  }, [isConnected])

  if (!visible) return null

  const connector = connectors.find(c => c.id === CIRCLE_PASSKEY_CONNECTOR_ID)
  if (!connector) return null

  async function handleConnect(providedUsername?: string) {
    setLoading(true)
    try {
      await connect({
        connector: connector!,
        // Pass username only for first registration
        ...(!isReturning && providedUsername ? { username: providedUsername } as Record<string, unknown> : {}),
      })
      setShowModal(false)
      toast.success('Passkey connected')
    } catch (err) {
      const msg = (err as Error)?.message ?? ''
      if (
        msg.includes('NotAllowedError') ||
        msg.includes('user rejected') ||
        msg.includes('cancelled') ||
        msg.includes('canceled') ||
        msg.includes('AbortError')
      ) {
        toast('Passkey prompt cancelled', { icon: '🔑' })
      } else if (msg.includes('VITE_CLIENT_KEY')) {
        toast.error('Client key not configured — see Console setup.')
      } else if (msg.includes('SecurityError') || msg.includes('domain')) {
        toast.error('Passkey domain mismatch — check Circle Console setup.')
      } else {
        toast.error('Passkey sign-in failed. Please try again.')
      }
      // A failed or cancelled first registration leaves nothing usable; never wipe an existing passkey
      if (!isReturning) clearCredential()
    } finally {
      setLoading(false)
    }
  }

  function handleClick() {
    if (isReturning) {
      // Returning user — go straight to login, no modal needed
      handleConnect()
    } else {
      // First time — show username modal
      setShowModal(true)
    }
  }

  return (
    <>
      {/* ── Passkey trigger button ──────────────────────────────────────── */}
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--periwinkle)] disabled:opacity-50 disabled:cursor-wait"
        title="Sign in with a passkey (biometric / device unlock)"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Fingerprint className="h-3 w-3" />
        )}
        {loading ? 'Connecting…' : isReturning ? 'Use passkey' : 'Use a passkey'}
      </button>

      {/* ── Username modal (first registration only) ───────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#08111f]/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xl">
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 text-[var(--muted)] hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-4 flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-[var(--periwinkle)]" />
              <h2 className="text-[15px] font-medium text-white">Create a passkey wallet</h2>
            </div>

            <p className="mb-4 text-[13px] text-[var(--muted)]">
              Choose a display name for your passkey. Your device will prompt you to authenticate with biometrics or a PIN.
            </p>

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && username.trim()) handleConnect(username.trim()) }}
              placeholder="Display name (e.g. Alice)"
              autoFocus
              className="mb-4 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[13px] text-white placeholder:text-[var(--faint)] outline-none focus:border-[var(--line-strong)] transition-colors"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl border border-[var(--line)] py-2.5 text-[13px] text-[var(--muted)] hover:text-white hover:border-[var(--line-strong)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConnect(username.trim() || 'Pulsarc user')}
                disabled={loading}
                className="flex-1 rounded-xl bg-[var(--periwinkle)] py-2.5 text-[13px] font-medium text-[#0a1424] hover:bg-[var(--periwinkle-hi)] disabled:opacity-50 disabled:cursor-wait transition-all"
              >
                {loading ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Connecting…
                  </span>
                ) : 'Create wallet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
