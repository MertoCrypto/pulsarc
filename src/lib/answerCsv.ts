/**
 * Pure CSV-row builder for the Answers detail page.
 * No React, no DOM — safe for plain Node (--experimental-strip-types).
 *
 * AnswerSeries is derived from the return type of answerSeries in
 * @/lib/answers, keeping this file in sync automatically.
 */

import type { answerSeries } from './answers.ts'

/** Non-null return type of answerSeries. */
export type AnswerSeries = NonNullable<ReturnType<typeof answerSeries>>

export interface CsvColumn {
  key: string
  label: string
}

export interface CsvResult {
  columns: CsvColumn[]
  rows: Record<string, string | number | null>[]
}

/**
 * Given an AnswerSeries value, produce the columns and rows ready to pass
 * to DownloadMenu.
 *
 * columns:
 *   [{ key:'label', label:'Hour (UTC)' }, { key:'value', label:`Value (${unit})` }]
 *
 * rows:
 *   One per point. value is kept as number | null.
 *   Non-finite numbers (NaN, Infinity, -Infinity) become null.
 *   The string "null" is never written; null stays null.
 */
export function answerCsvRows(
  series: Pick<AnswerSeries, 'points' | 'unit'>,
): CsvResult {
  const { points, unit } = series

  const columns: CsvColumn[] = [
    { key: 'label', label: 'Hour (UTC)' },
    { key: 'value', label: `Value (${unit})` },
  ]

  const rows: Record<string, string | number | null>[] = points.map(pt => {
    const raw = pt.value
    let v: number | null
    if (raw === null || raw === undefined) {
      v = null
    } else if (!isFinite(raw)) {
      // NaN, Infinity, -Infinity → null
      v = null
    } else {
      v = raw
    }
    return { label: pt.label, value: v }
  })

  return { columns, rows }
}
