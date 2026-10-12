/** The health score: three on-chain signals, every point traceable. */
import type { AppMetrics, HistoryPoint } from '@/lib/appActivity'

export interface HealthParts {
  activity: number    // 0–40: how much the app is used
  breadth: number     // 0–30: many different wallets, not a few repeating
  consistency: number // 0–30: active in most time slices, not one burst
}

export interface Health {
  score: number
  parts: HealthParts
}

/** Transparent score — every point comes from one of three on-chain signals shown to the user. */
export function computeHealth(metrics: AppMetrics, history: HistoryPoint[]): Health {
  const activity = Math.min(40, 8 * Math.log10(1 + metrics.txCount))
  const breadth = metrics.txCount > 0 ? Math.min(30, (metrics.activeWallets / metrics.txCount) * 30 * 3) : 0
  const active = history.filter(p => p.txCount > 0).length
  const consistency = history.length ? (active / history.length) * 30 : 0
  const parts = { activity, breadth, consistency }
  return { score: Math.round(activity + breadth + consistency), parts }
}

export const healthLabel = (score: number) => (score >= 70 ? 'Strong' : score >= 40 ? 'Steady' : 'Quiet')
