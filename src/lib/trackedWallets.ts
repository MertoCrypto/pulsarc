/** Pure rules of the browser-only wallet watch-list (storage and React live in the hook). */

export const MAX_WALLETS = 25

export interface TrackedWallet {
  address: string
  label: string
  addedAt: number
}

export const isWalletAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)

/** Parses what was saved in storage; anything unreadable or invalid is dropped. */
export function parseTracked(raw: string | null): TrackedWallet[] {
  try {
    const parsed = raw ? (JSON.parse(raw) as TrackedWallet[]) : []
    return Array.isArray(parsed) ? parsed.filter(w => !!w && typeof w.address === 'string' && isWalletAddress(w.address)) : []
  } catch {
    return []
  }
}

export type AddResult = 'ok' | 'invalid' | 'duplicate' | 'full'

/** New list (newest first) plus the outcome; the list is returned unchanged unless the outcome is 'ok'. */
export function addTracked(prev: TrackedWallet[], address: string, label: string, now: number): { next: TrackedWallet[]; result: AddResult } {
  if (!isWalletAddress(address)) return { next: prev, result: 'invalid' }
  if (prev.some(w => w.address.toLowerCase() === address.toLowerCase())) return { next: prev, result: 'duplicate' }
  if (prev.length >= MAX_WALLETS) return { next: prev, result: 'full' }
  return { next: [{ address, label: label.trim(), addedAt: now }, ...prev], result: 'ok' }
}

export function removeTracked(prev: TrackedWallet[], address: string): TrackedWallet[] {
  return prev.filter(w => w.address.toLowerCase() !== address.toLowerCase())
}
