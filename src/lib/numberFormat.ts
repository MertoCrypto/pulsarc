/** Pure number, address and time formatting helpers (no network, no browser APIs). */

/** Raw integer string + decimals -> number (fine for display; not for accounting). */
export function scaled(raw: string | null | undefined, decimals: number | string | null | undefined): number {
  if (!raw) return 0
  const d = Number(decimals ?? 0)
  if (!Number.isFinite(d)) return 0
  const s = raw.padStart(d + 1, '0')
  const whole = s.slice(0, s.length - d)
  const frac = s.slice(s.length - d)
  return Number(`${whole}.${frac || '0'}`)
}

export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)

export function compact(n: number, digits = 2): string {
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(digits)}T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`
  return n.toFixed(abs < 10 ? 2 : 0)
}

/** Like compact(), but whole numbers below 1,000 stay whole — for counts of things. */
export function count(n: number, digits = 1): string {
  return Math.abs(n) < 1000 ? String(Math.round(n)) : compact(n, digits)
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
