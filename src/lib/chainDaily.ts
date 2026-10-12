/** Pure shaping of ArcScan's daily transaction chart into points for the chart. */

export interface DailyPoint {
  date: string // YYYY-MM-DD
  label: string
  transactions: number
}

export interface RawDaily { chart_data: { date: string; transactions_count: number }[] }

export function toDailyPoints(raw: RawDaily): DailyPoint[] {
  return raw.chart_data
    .map(p => {
      const [, m, d] = p.date.split('-')
      return { date: p.date, label: `${Number(m)}/${Number(d)}`, transactions: p.transactions_count }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function peakAndAverage(points: readonly { transactions: number }[]): { peak: number; avg: number } {
  return {
    peak: points.reduce((m, p) => Math.max(m, p.transactions), 0),
    avg: points.length ? points.reduce((s, p) => s + p.transactions, 0) / points.length : 0,
  }
}
