/**
 * Pure helper — no React, no network calls.
 * Generates copy-paste quick-start snippets for a Pulsarc data URL.
 */
import { DATA_BASE } from './dataCatalog.ts'

export interface Snippet {
  id: 'curl' | 'javascript' | 'python'
  label: string
  code: string
}

/**
 * Returns three ready-to-copy snippets (curl, JavaScript, Python) for `url`.
 * Throws if `url` does not start with DATA_BASE.
 */
export function quickStartSnippets(url: string): Snippet[] {
  if (!url.startsWith(DATA_BASE)) {
    throw new Error(
      `quickStartSnippets: url must start with DATA_BASE ("${DATA_BASE}"). Got: "${url}"`,
    )
  }

  // Use JSON.stringify for the JS snippet — it produces a correctly-escaped
  // double-quoted string literal, so a URL containing backslashes or quotes
  // will not break the generated code.
  const jsUrl = JSON.stringify(url)

  // Python: double-quoted string; any double-quote in the URL is escaped as \"
  // (URLs from DATA_BASE never contain double quotes in practice, but we guard anyway).
  const pyUrl = '"' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'

  return [
    {
      id: 'curl',
      label: 'curl',
      code: `curl -s "${url}"`,
    },
    {
      id: 'javascript',
      label: 'JavaScript',
      code: [
        `const res = await fetch(${jsUrl});`,
        `if (!res.ok) throw new Error("HTTP " + res.status);`,
        `const data = await res.json();`,
        `console.log(data.generatedAt);`,
      ].join('\n'),
    },
    {
      id: 'python',
      label: 'Python',
      code: [
        `import json, urllib.request`,
        `with urllib.request.urlopen(${pyUrl}) as r:`,
        `    data = json.load(r)`,
        `print(data.get("generatedAt"))`,
      ].join('\n'),
    },
  ]
}
