/**
 * Pure helpers for schema.org FAQPage JSON-LD structured data.
 * No React, no network — safe for plain Node (--experimental-strip-types).
 */

import type { AnswerDef } from './answers.ts'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SchemaAnswer {
  '@type': 'Answer'
  text: string
}

interface SchemaQuestion {
  '@type': 'Question'
  name: string
  acceptedAnswer: SchemaAnswer
}

interface SchemaFAQPage {
  '@context': 'https://schema.org'
  '@type': 'FAQPage'
  url: string
  mainEntity: SchemaQuestion[]
}

// ── faqJsonLd ─────────────────────────────────────────────────────────────────

/**
 * Build a schema.org FAQPage JSON-LD object for a single answer page.
 *
 * Returns null when result is null (data not yet loaded or unavailable) so
 * search engines are never served an empty or speculative answer.
 *
 * The text field deliberately avoids "TVL" and only surfaces data already
 * present in def.short and result.detail — no additional claims.
 */
export function faqJsonLd(
  def: AnswerDef,
  result: { value: string; detail: string } | null,
  net: 'mainnet' | 'testnet',
  pageUrl: string,
): object | null {
  if (result === null) return null

  const text = `${result.value} ${result.detail} (Arc ${net}). ${def.short}`

  const obj: SchemaFAQPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: pageUrl,
    mainEntity: [
      {
        '@type': 'Question',
        name: def.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text,
        },
      },
    ],
  }

  return obj
}

// ── serializeJsonLd ────────────────────────────────────────────────────────────

/**
 * Serialize a JSON-LD object to a string safe for embedding inside an HTML
 * <script> block.  The only character that can break out of a script element
 * is "<" (via "</script>"), so we replace every "<" with the JSON-safe Unicode
 * escape "\u003c" after stringifying.  This is the same technique used by
 * Next.js, Nuxt, and Gatsby for their JSON-LD helpers.
 */
export function serializeJsonLd(obj: object): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}
