import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { MessageSquare, Heart, Trash2, Send } from 'lucide-react'
import { clsx } from 'clsx'
import { useComments } from '@/hooks/useComments'

interface Props {
  dappId: string
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function CommentsPanel({ dappId }: Props) {
  const { address, isConnected } = useAccount()
  const { comments, post, like, remove } = useComments(dappId)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConnected || !address || !text.trim()) return
    setSubmitting(true)
    try {
      post(address, text.trim())
      setText('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="arc-card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[var(--periwinkle)]" />
        <p className="text-sm font-semibold text-white">
          Comments
          {comments.length > 0 && (
            <span className="ml-2 text-[10px] font-['Geist_Mono'] text-[var(--faint)] bg-white/[0.05] px-1.5 py-0.5 rounded">
              {comments.length}
            </span>
          )}
        </p>
      </div>

      {/* Comment input */}
      <div className="px-5 py-4 border-b border-[var(--line)]">
        {isConnected ? (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={500}
              placeholder="Share your thoughts about this dApp…"
              className="flex-1 bg-white/[0.05] border border-[var(--line)] rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[var(--periwinkle)]/40 focus:bg-white/[0.05] transition-all"
            />
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className={clsx(
                'px-3 py-2 rounded-lg transition-all',
                text.trim() && !submitting
                  ? 'bg-[var(--periwinkle)]/20 text-[var(--periwinkle)] hover:bg-[var(--periwinkle)]/30 border border-[var(--periwinkle)]/30'
                  : 'bg-white/[0.05] text-white/20 border border-[var(--line)] cursor-not-allowed'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-xs text-[var(--faint)] flex-1">Connect your wallet to leave a comment.</p>
            <ConnectKitButton />
          </div>
        )}
      </div>

      {/* Comment list */}
      {comments.length === 0 ? (
        <div className="px-5 py-8 flex flex-col items-center gap-1.5">
          <MessageSquare className="w-7 h-7 text-white/10" />
          <p className="text-xs text-[var(--faint)]">No comments yet — be the first!</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {[...comments].reverse().map(comment => (
            <div key={comment.id} className="px-5 py-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-['Geist_Mono'] text-[var(--faint)] tabular-nums">
                  {truncate(comment.walletAddress)}
                </span>
                <span className="text-[10px] text-[var(--faint)]">
                  {timeAgo(comment.timestamp)}
                </span>
              </div>
              <p className="text-sm text-white leading-relaxed">
                {comment.text}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => address && like(comment.id, address)}
                  disabled={!isConnected}
                  className={clsx(
                    'flex items-center gap-1 text-[10px] transition-colors',
                    address && comment.likedBy.includes(address)
                      ? 'text-[var(--periwinkle)]'
                      : 'text-[var(--faint)] hover:text-[var(--periwinkle)]'
                  )}
                >
                  <Heart className="w-3 h-3" />
                  {comment.likes > 0 && comment.likes}
                </button>
                {address?.toLowerCase() === comment.walletAddress.toLowerCase() && (
                  <button
                    onClick={() => remove(comment.id, comment.walletAddress)}
                    className="flex items-center gap-1 text-[10px] text-white/20 hover:text-[var(--periwinkle)] transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
