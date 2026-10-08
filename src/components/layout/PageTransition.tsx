import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, type Location } from 'react-router-dom'
import { scrollToTop } from '@/lib/smoothScroll'

/** The old page fades out for this long before the route swaps. */
const LEAVE_MS = 140

interface Props {
  /** Receives the location to render, so the swap can wait for the fade-out. */
  children: (location: Location) => ReactNode
}

/** Quiet cross-fade between routes: old page dims, new page settles in. */
export function PageTransition({ children }: Props) {
  const location = useLocation()
  const [shown, setShown] = useState(location)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (location.pathname === shown.pathname) {
      if (location !== shown) setShown(location) // same page, new hash/search: no fade
      return
    }
    setLeaving(true)
    const id = window.setTimeout(() => {
      scrollToTop(true)
      setShown(location)
      setLeaving(false)
    }, LEAVE_MS)
    return () => window.clearTimeout(id)
  }, [location, shown])

  return (
    <div
      key={shown.pathname}
      className={leaving ? 'arc-page-out' : 'arc-page-in'}
    >
      {children(shown)}
    </div>
  )
}
