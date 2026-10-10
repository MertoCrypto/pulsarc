/**
 * AgentsIndexSection — "Registered agents" list from the indexer snapshot.
 * All agent-provided text is rendered as plain text only (no dangerouslySetInnerHTML).
 * Only https:// URIs are linked; ipfs:// is already converted to https://ipfs.io/… by the parser.
 */
import { useState, useCallback } from 'react'
import { ExternalLink } from 'lucide-react'
import type { AgentsIndex, AgentSortKey } from '@/lib/agentsIndex'
import { searchAgents, sortAgents, pageOf } from '@/lib/agentsIndex'
import { explorerAddress, timeAgo } from '@/lib/arcscan'

const PAGE_SIZE = 25

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

interface Props {
  data: AgentsIndex
}

export function AgentsIndexSection({ data }: Props) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<AgentSortKey>('newest')
  const [page, setPage] = useState(1)

  // Reset page when query/sort change
  const handleQuery = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setPage(1)
  }, [])

  const handleSort = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSort(e.target.value as AgentSortKey)
    setPage(1)
  }, [])

  const filtered = searchAgents(data.agents, query)
  const sorted = sortAgents(filtered, sort)
  const visible = pageOf(sorted, 1, page * PAGE_SIZE) // "show more" grows the page
  const hasMore = visible.length < sorted.length

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="arc-eyebrow">Registered agents</p>
        <p className="text-xs text-[var(--faint)]">
          {data.count.toLocaleString('en-US')} agents registered
          {' · '}updated {timeAgo(data.generatedAt)}
        </p>
      </div>

      {/* Catching-up notice */}
      {!data.caughtUp && (
        <p className="arc-panel px-4 py-2 text-xs text-[var(--muted)]">
          The list is still being collected, so newer agents may be missing for now.
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={query}
          onChange={handleQuery}
          placeholder="Search by name, description, owner or #id"
          className="arc-input min-w-0 flex-1 basis-48"
          aria-label="Search agents"
        />
        <select
          value={sort}
          onChange={handleSort}
          className="arc-input w-auto shrink-0"
          aria-label="Sort agents"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="named">Has a profile first</option>
        </select>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--muted)]">No agents match.</p>
      ) : (
        <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          {visible.map(a => (
            <div key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
              {/* ID */}
              <span className="w-14 shrink-0 font-['Geist_Mono'] text-xs text-[var(--faint)]">#{a.id}</span>

              {/* Name + description */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{a.name ?? 'Unnamed agent'}</p>
                {a.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-[var(--muted)]">{a.description}</p>
                )}
              </div>

              {/* Owner */}
              <a
                href={explorerAddress(a.owner)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 font-['Geist_Mono'] text-xs text-[var(--muted)] hover:text-white"
              >
                {short(a.owner)}
              </a>

              {/* Profile link */}
              {a.uri && (
                <a
                  href={a.uri}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-0.5 text-xs text-[var(--periwinkle)] hover:underline"
                >
                  Profile <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Show more */}
      {hasMore && (
        <button
          className="arc-btn-ghost w-full !py-2 text-sm"
          onClick={() => setPage(p => p + 1)}
        >
          Show more ({sorted.length - visible.length} remaining)
        </button>
      )}
    </section>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function AgentsIndexSkeleton() {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="arc-eyebrow">Registered agents</p>
        <div className="h-3 w-40 animate-pulse rounded bg-[var(--line)]" />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="arc-input h-9 flex-1 basis-48 animate-pulse" />
        <div className="arc-input h-9 w-36 animate-pulse" />
      </div>
      <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="h-3 w-10 animate-pulse rounded bg-[var(--line)]" />
            <div className="h-3 flex-1 animate-pulse rounded bg-[var(--line)]" />
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--line)]" />
          </div>
        ))}
      </div>
    </section>
  )
}
