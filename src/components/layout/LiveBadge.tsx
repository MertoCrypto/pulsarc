import { RefreshCw } from 'lucide-react'

interface LiveBadgeProps {
  lastUpdated: Date | null
  onRefresh?: () => void
  isLoading?: boolean
  progress?: string
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

export function LiveBadge({ lastUpdated, onRefresh, isLoading, progress }: LiveBadgeProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--periwinkle)] opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--periwinkle)]" />
        </span>
        <span className="text-xs text-[var(--muted)]">
          {progress ?? (lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : 'Loading…')}
        </span>
      </span>
      {onRefresh && (
        <button
          onClick={() => { void onRefresh?.() }}
          disabled={isLoading}
          className="rounded p-1 transition-colors hover:bg-white/8 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 text-[var(--muted)] ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  )
}
