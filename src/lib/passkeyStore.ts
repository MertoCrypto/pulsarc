/** Browser storage for the passkey wallet: the saved credential and the signed-in flag. */
import type { P256Credential } from 'viem/account-abstraction'

const STORAGE_KEY = 'pulsarc:passkey:credential'

/** Reads back a persisted P256Credential from localStorage.
 *
 * TODO (production): move this to an httpOnly cookie via a small serverless
 * function.  localStorage is acceptable for testnet demos but is vulnerable
 * to XSS — do NOT use it in a production environment with real funds.
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

/** Persists a P256Credential so the user stays logged in across page reloads.
 *
 * TODO (production): replace with an httpOnly cookie.
 */
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
