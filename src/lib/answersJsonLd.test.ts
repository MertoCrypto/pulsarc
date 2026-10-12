/**
 * Tests for answersJsonLd.ts
 * Run with: node --experimental-strip-types src/lib/answersJsonLd.test.ts
 */

import assert from 'node:assert/strict'
import { faqJsonLd, serializeJsonLd } from './answersJsonLd.ts'
import type { AnswerDef } from './answers.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEF: AnswerDef = {
  slug: 'daily-transactions',
  question: 'How many transactions does Arc process per day?',
  short: 'Total transactions recorded by the indexer in the last 24-hour window.',
  method:
    'The count comes from the 24-hour window the indexer maintains in latest.json.',
  sourceFile: 'latest.json',
}

const RESULT = { value: '1,234,567', detail: 'last 24 hours' }

const PAGE_URL = 'https://pulsarc.vercel.app/answers/daily-transactions'

// ── Test 1: null result returns null ──────────────────────────────────────────

{
  const got = faqJsonLd(DEF, null, 'mainnet', PAGE_URL)
  assert.equal(got, null, 'null result should produce null')
  console.log('PASS 1: null result -> null')
}

// ── Test 2: exact JSON shape (hand-written expected, not computed) ─────────────

{
  const got = faqJsonLd(DEF, RESULT, 'mainnet', PAGE_URL)

  const expected = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: 'https://pulsarc.vercel.app/answers/daily-transactions',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How many transactions does Arc process per day?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '1,234,567 last 24 hours (Arc mainnet). Total transactions recorded by the indexer in the last 24-hour window.',
        },
      },
    ],
  }

  assert.deepEqual(got, expected, 'output does not match hand-written expected shape')
  console.log('PASS 2: exact JSON shape matches hand-written expected')
}

// ── Test 3: net is included in the text ───────────────────────────────────────

{
  const mainnetResult = faqJsonLd(DEF, RESULT, 'mainnet', PAGE_URL) as Record<string, unknown>
  const testnetResult = faqJsonLd(DEF, RESULT, 'testnet', PAGE_URL) as Record<string, unknown>

  const mainnetText = (
    (mainnetResult['mainEntity'] as Array<{ acceptedAnswer: { text: string } }>)[0]
      .acceptedAnswer.text
  )
  const testnetText = (
    (testnetResult['mainEntity'] as Array<{ acceptedAnswer: { text: string } }>)[0]
      .acceptedAnswer.text
  )

  assert.ok(mainnetText.includes('Arc mainnet'), 'mainnet text should contain "Arc mainnet"')
  assert.ok(testnetText.includes('Arc testnet'), 'testnet text should contain "Arc testnet"')
  assert.notEqual(mainnetText, testnetText, 'mainnet and testnet texts should differ')
  console.log('PASS 3: net is included in the text')
}

// ── Test 4: url field is present and matches pageUrl ──────────────────────────

{
  const got = faqJsonLd(DEF, RESULT, 'mainnet', PAGE_URL) as Record<string, unknown>
  assert.equal(got['url'], PAGE_URL, 'url field should equal pageUrl')
  console.log('PASS 4: url field is present and correct')
}

// ── Test 5: JSON.stringify/parse round trip ────────────────────────────────────

{
  const got = faqJsonLd(DEF, RESULT, 'mainnet', PAGE_URL)
  assert.notEqual(got, null)
  const roundTripped = JSON.parse(JSON.stringify(got!))
  assert.deepEqual(roundTripped, got, 'round-tripped object should deep-equal original')
  console.log('PASS 5: JSON.stringify/parse round trip')
}

// ── Test 6: serializeJsonLd output contains no "</script" ─────────────────────

{
  const hostileDef: AnswerDef = {
    slug: 'xss-test',
    question: 'Does </script><script>alert(1)</script> break anything?',
    short: 'Short with </script> in it.',
    method: 'none',
    sourceFile: 'latest.json',
  }
  const hostileResult = { value: '$0.00</script>', detail: 'injected </script> here' }
  const obj = faqJsonLd(hostileDef, hostileResult, 'mainnet', 'https://pulsarc.vercel.app/answers/xss-test')
  assert.notEqual(obj, null)
  const serialized = serializeJsonLd(obj!)
  assert.ok(!serialized.includes('</script'), 'serialized output must not contain "</script"')
  // Confirm the data is still round-trippable after our escape
  const parsed = JSON.parse(serialized)
  const text = (parsed.mainEntity[0].acceptedAnswer.text as string)
  assert.ok(text.includes('</script>'), 'round-parsed text should still contain the original "</script>" string')
  console.log('PASS 6: serializeJsonLd escapes "</script" even with hostile input')
}

// ── Test 7: serializeJsonLd with a plain hostile string directly ───────────────

{
  const hostile = { message: '</script><script>alert(1)</script>' }
  const serialized = serializeJsonLd(hostile)
  assert.ok(!serialized.includes('</script'), 'direct hostile string: no "</script" in output')
  // The escaped form should be present
  assert.ok(serialized.includes('\\u003c'), 'escaped form \\u003c should be present')
  console.log('PASS 7: serializeJsonLd escapes a hostile string directly')
}

// ── All done ──────────────────────────────────────────────────────────────────

console.log('\nAll 7 tests passed.')
