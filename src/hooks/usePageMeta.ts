import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { metaFor } from '@/lib/pageMeta'

/**
 * Call once inside a component rendered inside the Router.
 * On every pathname change, updates document.title and
 * <meta name="description"> (creates the tag if absent).
 */
export function usePageMeta(): void {
  const { pathname } = useLocation()

  useEffect(() => {
    const { title, description } = metaFor(pathname)

    // Update tab title
    document.title = title

    // Update (or create) <meta name="description">
    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.name = 'description'
      document.head.appendChild(metaDesc)
    }
    metaDesc.content = description
  }, [pathname])
}
