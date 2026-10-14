/** Browser storage for the passkey wallet: the saved credential and the signed-in flag. */
import type { P256Credential } from 'viem/account-abstraction'

const STORAGE_KEY = 'pulsarc:passkey:credential'

/** Reads back a persisted P256Credential from localStorage.
 *
 * What is stored is the credential id and the PUBLIC key only (viem's P256Credential: id, publicKey, raw).
 * The private key never leaves the authenticator, and every signature needs the user's biometric/PIN
 * confirmation through navigator.credentials.get, so reading this value does not let anyone sign.
 * Clearing it only means the user picks the passkey again on the next visit.
 */
export function loadStoredCredential(): P256Credential | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as P256Credential
  } catch {
    return null
  }
}

/** Persists a P256Credential (id + public key, no secret) so the user stays signed in across page reloads. */
export function saveCredential(cred: P256Credential): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cred))
  } catch { /* storage blocked: the session works, it just will not persist */ }
}

/** Clears the persisted credential (disconnect). */
export function clearCredential(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage blocked: nothing to clear */ }
}

const ACTIVE_KEY = 'pulsarc:passkey:active'

/** Whether the passkey wallet was signed in when the page was last open (explicit sign-out clears it). */
export function wasPasskeyActive(): boolean {
  try { return localStorage.getItem(ACTIVE_KEY) === '1' } catch { return false }
}
export function setActive(on: boolean): void {
  try { if (on) localStorage.setItem(ACTIVE_KEY, '1'); else localStorage.removeItem(ACTIVE_KEY) } catch { /* best effort */ }
}

/** Returns true when the browser supports the WebAuthn API. */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  )
}
