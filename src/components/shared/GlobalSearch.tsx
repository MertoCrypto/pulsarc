import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Wallet, Grid3X3 } from 'lucide-react'
import { clsx } from 'clsx'
import { ARC_APPS } from '@/data/apps'
import { AppLogoBadge, CategoryBadge } from './Badge'

function isAddress(val: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(val)
}

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.length > 0
    ? ARC_APPS.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.description.toLowerCase().includes(query.toLowerCase()) ||
        a.category.toLowerCase().includes(query.toLowerCase()) ||
        a.anchors.some(x => x.address.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 6)
    : []

  const showWalletOption = isAddress(query)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [close])

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [close])

  function goToApp(id: string) {
    void navigate(`/dapp/${id}`)
    close()
  }

  function goToWallet(addr: string) {
    void navigate(`/wallet/${addr}`)
    close()
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (showWalletOption) goToWallet(query)
      else if (filtered.length > 0) goToApp(filtered[0].id)
    }
  }

  const dropdownOpen = open && (query.length > 0)
  const hasResults = filtered.length > 0 || showWalletOption

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        className={clsx(
          'flex items-center gap-2 transition-all rounded-lg border',
          open
            ? 'hidden'
            : 'px-3 py-1.5 bg-white/[0.05] border-[var(--line)] text-[var(--faint)] hover:text-[var(--muted)] hover:bg-white/[0.05]'
        )}
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-xs hidden sm:block">Search apps, wallets…</span>
        <kbd className="hidden sm:block text-[9px] font-['Geist_Mono'] bg-white/[0.05] border border-[var(--line)] rounded px-1 py-0.5 text-[var(--faint)]">⌘K</kbd>
      </button>

      {/* Expanded search */}
      {open && (
        <div className="flex items-center gap-2 w-72">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--faint)] pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Search apps, wallets…"
              className="w-full bg-white/[0.05] border border-[var(--periwinkle)]/30 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[var(--periwinkle)]/60"
              autoComplete="off"
            />
          </div>
          <button onClick={close} className="text-[var(--faint)] hover:text-[var(--muted)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dropdown */}
      {dropdownOpen && (
        <div className={clsx(
          'absolute top-full mt-2 w-80 rounded-xl bg-[#10213b] border border-[var(--line)] shadow-2xl py-1.5 z-50',
          'right-0'
        )}>
          {!hasResults && (
            <p className="px-4 py-3 text-xs text-[var(--faint)]">No results for "{query}"</p>
          )}

          {showWalletOption && (
            <button
              onClick={() => goToWallet(query)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.05] transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-[var(--periwinkle)]/20 border border-[var(--periwinkle)]/30 flex items-center justify-center shrink-0">
                <Wallet className="w-3.5 h-3.5 text-[var(--periwinkle)]" />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-xs font-['Geist_Mono'] text-white tabular-nums truncate">{query}</p>
                <p className="text-[10px] text-[var(--faint)]">View wallet profile</p>
              </div>
            </button>
          )}

          {filtered.length > 0 && (
            <>
              {showWalletOption && <div className="h-px bg-white/[0.05] my-1" />}
              <p className="px-4 py-1 text-[9px] font-medium text-[var(--faint)] uppercase tracking-wider">
                <Grid3X3 className="inline w-2.5 h-2.5 mr-1" />DApps
              </p>
              {filtered.map(app => (
                <button
                  key={app.id}
                  onClick={() => goToApp(app.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.05] transition-colors"
                >
                  <AppLogoBadge initials={app.logoInitials} color={app.logoColor} size="sm" />
                  <div className="min-w-0 text-left flex-1">
                    <p className="text-sm font-medium text-white truncate">{app.name}</p>
                    <p className="text-[10px] text-[var(--faint)] truncate">{app.description}</p>
                  </div>
                  <CategoryBadge category={app.category} size="xs" />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
