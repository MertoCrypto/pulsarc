import { useState, useRef, useEffect } from 'react'
import { Share2, Twitter, Link as LinkIcon, Check, Cast } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  url?: string
  title: string
  description?: string
  className?: string
}

export function ShareButton({ url, title, description, className }: Props) {
  const shareUrl = url ?? window.location.href
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function copyLink() {
    void navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => { setCopied(false); setOpen(false) }, 1500)
  }

  const twitterText = encodeURIComponent(`${title} on Pulsarc — the pulse of the Arc network\n\n${description ?? ''}\n\n${shareUrl}`)
  const twitterUrl = `https://twitter.com/intent/tweet?text=${twitterText}`

  const farcasterText = encodeURIComponent(`${title} — ${description ?? ''}\n\n${shareUrl}`)
  const farcasterUrl = `https://warpcast.com/~/compose?text=${farcasterText}`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={clsx('arc-act', className)}
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-48 rounded-xl bg-[#10213b] border border-[var(--line)] shadow-2xl py-1.5 z-50">
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            {copied
              ? <><Check className="w-4 h-4 text-[var(--periwinkle)]" /><span className="text-[var(--periwinkle)]">Copied!</span></>
              : <><LinkIcon className="w-4 h-4" /><span>Copy link</span></>
            }
          </button>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <Twitter className="w-4 h-4 text-sky-400" />
            Share on X
          </a>
          <a
            href={farcasterUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <Cast className="w-4 h-4 text-[var(--periwinkle)]" />
            Share on Farcaster
          </a>
        </div>
      )}
    </div>
  )
}
