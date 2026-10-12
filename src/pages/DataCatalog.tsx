/**
 * /data page — public data catalog for Pulsarc.
 * Lists every file the indexer publishes on the data branch of
 * MertoCrypto/pulsarc-indexer, with URLs, key chips, and curl examples.
 */
import { useEffect, useState } from 'react'
import { ExternalLink, Copy, Check, Rss } from 'lucide-react'
import { CATALOG, catalogUrl, DATA_BASE } from '@/lib/dataCatalog'

// ── network detection ─────────────────────────────────────────────────────────
// Arc mainnet chainId is 5042; testnet is 5042002.
// This scaffold targets Arc Testnet, so the page defaults to 'testnet'.
// Wire your own NETWORK constant here if the host app exposes one.

const DEFAULT_NET: 'mainnet' | 'testnet' = 'testnet'

// ── helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy URL"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--periwinkle)]/40 hover:text-[var(--periwinkle)]"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy URL
        </>
      )}
    </button>
  )
}

// ── last-updated probe ─────────────────────────────────────────────────────────

function useLastUpdated(net: 'mainnet' | 'testnet'): string | null {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const url = `${DATA_BASE}/${net}/state.json`
    fetch(url)
      .then(r => r.json())
      .then((data: unknown) => {
        if (cancelled) return
        if (
          data &&
          typeof data === 'object' &&
          'updatedAt' in data &&
          typeof (data as Record<string, unknown>)['updatedAt'] === 'string'
        ) {
          setUpdatedAt((data as Record<string, unknown>)['updatedAt'] as string)
        }
      })
      .catch(() => {/* silent */})
    return () => { cancelled = true }
  }, [net])

  return updatedAt
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

// ── page ──────────────────────────────────────────────────────────────────────

export function DataCatalog() {
  const [net, setNet] = useState<'mainnet' | 'testnet'>(DEFAULT_NET)
  const lastUpdated = useLastUpdated(net)

  const rssUrl = `${DATA_BASE}/${net}/feed.xml`
  const llmsTxtUrl = '/llms.txt'

  return (
    <div className="space-y-14">
      {/* ── header ── */}
      <section className="pt-4">
        <p className="arc-eyebrow mb-5">Indexer</p>
        <h1 className="arc-display text-[clamp(34px,4.3vw,60px)] text-white">
          Open data
        </h1>
        <p className="mt-6 max-w-[580px] text-lg font-light leading-relaxed text-[var(--muted)]">
          Every file is public, plain JSON on GitHub — no API key, no login,
          CORS-open. Fetch any URL directly from your browser, script, or AI
          agent.{' '}
          <a
            href={llmsTxtUrl}
            className="text-[var(--periwinkle)] underline underline-offset-2 hover:opacity-80"
          >
            llms.txt
          </a>{' '}
          describes this dataset for language models.{' '}
          <a
            href={rssUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--periwinkle)] underline underline-offset-2 hover:opacity-80"
          >
            <Rss className="h-3.5 w-3.5" />
            RSS feed
          </a>
          .
        </p>

        {/* network switch */}
        <div className="mt-8 inline-flex rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
          {(['mainnet', 'testnet'] as const).map(n => (
            <button
              key={n}
              onClick={() => setNet(n)}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                net === n
                  ? 'bg-[var(--periwinkle)] text-white'
                  : 'text-[var(--muted)] hover:text-white'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {lastUpdated && (
          <p className="mt-3 text-xs text-[var(--faint)]">
            Last indexer run: {fmtDate(lastUpdated)}
          </p>
        )}
      </section>

      {/* ── catalog cards ── */}
      <div className="space-y-4">
        {CATALOG.filter(e => e.nets.includes(net)).map(entry => {
          const url = catalogUrl(entry, net)
          const isRss = entry.file.endsWith('.xml')
          const curlCmd = `curl -s "${url}"`

          return (
            <div key={entry.file} className="arc-card overflow-hidden">
              {/* card header */}
              <div className="border-b border-[var(--line)] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="arc-eyebrow truncate">{entry.file}</p>
                    <p className="mt-0.5 text-sm font-medium text-white">
                      {entry.title}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-xs text-[var(--faint)]">
                    {entry.updates}
                  </span>
                </div>
              </div>

              {/* body */}
              <div className="space-y-4 px-5 py-4">
                <p className="text-sm leading-relaxed text-[var(--muted)]">
                  {entry.description}
                </p>

                {/* keys chips */}
                {entry.keys.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.keys.map(k => (
                      <span
                        key={k}
                        className="rounded-md border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 font-['Geist_Mono'] text-xs text-[var(--faint)]"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
                {entry.keys.length === 0 && !isRss && (
                  <p className="text-xs text-[var(--faint)]">
                    Top-level keys vary (address map or daily template).
                  </p>
                )}

                {/* URL row */}
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-['Geist_Mono'] text-xs text-[var(--muted)]">
                    {url}
                  </code>
                  <CopyButton value={url} />
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--periwinkle)]/40 hover:text-[var(--periwinkle)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                </div>

                {/* curl example */}
                {!isRss && (
                  <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                    <p className="mb-1 text-xs text-[var(--faint)]">curl example</p>
                    <code className="block truncate font-['Geist_Mono'] text-xs text-[var(--muted)]">
                      {curlCmd}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* footer */}
      <p className="text-xs text-[var(--faint)]">
        Source: MertoCrypto/pulsarc-indexer, data branch.{' '}
        <a
          href="https://github.com/MertoCrypto/pulsarc-indexer"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-[var(--muted)]"
        >
          Indexer source on GitHub <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  )
}
