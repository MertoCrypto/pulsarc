/**
 * Tests for answerCsvRows.
 * Run with: node --experimental-strip-types src/lib/answerCsv.test.ts
 */

import assert from 'node:assert/strict'
import { answerCsvRows } from './answerCsv.ts'

// ── helpers ───────────────────────────────────────────────────────────────────

function run(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS  ${name}`)
  } catch (err) {
    console.error(`  FAIL  ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

run('column labels include unit', () => {
  const { columns } = answerCsvRows({ unit: 'USDC', points: [] })
  assert.equal(columns.length, 2)
  assert.equal(columns[0].key, 'label')
  assert.equal(columns[0].label, 'Hour (UTC)')
  assert.equal(columns[1].key, 'value')
  assert.equal(columns[1].label, 'Value (USDC)')
})

run('3 points returned in order', () => {
  const points = [
    { label: '2026-10-12T00', value: 1.5 },
    { label: '2026-10-12T01', value: 2.5 },
    { label: '2026-10-12T02', value: 3.5 },
  ]
  const { rows } = answerCsvRows({ unit: 'txs', points })
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], { label: '2026-10-12T00', value: 1.5 })
  assert.deepEqual(rows[1], { label: '2026-10-12T01', value: 2.5 })
  assert.deepEqual(rows[2], { label: '2026-10-12T02', value: 3.5 })
})

run('null value stays null (not the string "null")', () => {
  const points = [{ label: '2026-10-12T00', value: null }]
  const { rows } = answerCsvRows({ unit: '%', points })
  assert.equal(rows.length, 1)
  assert.strictEqual(rows[0].value, null)
  assert.notEqual(rows[0].value, 'null')
})

run('NaN becomes null', () => {
  const points = [{ label: '2026-10-12T03', value: NaN }]
  const { rows } = answerCsvRows({ unit: 'USDC', points })
  assert.strictEqual(rows[0].value, null)
})

run('Infinity becomes null', () => {
  const points = [
    { label: '2026-10-12T04', value: Infinity },
    { label: '2026-10-12T05', value: -Infinity },
  ]
  const { rows } = answerCsvRows({ unit: 'USDC', points })
  assert.strictEqual(rows[0].value, null)
  assert.strictEqual(rows[1].value, null)
})

run('empty points gives empty rows but still the columns', () => {
  const { columns, rows } = answerCsvRows({ unit: '%', points: [] })
  assert.equal(columns.length, 2)
  assert.equal(rows.length, 0)
})

run('unit with a comma appears verbatim in the label', () => {
  const { columns } = answerCsvRows({ unit: 'USDC, millions', points: [] })
  assert.equal(columns[1].label, 'Value (USDC, millions)')
})
