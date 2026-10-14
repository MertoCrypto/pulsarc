/**
 * notFoundLinks.ts — canonical nav links shown on the 404 page.
 * Used by src/pages/NotFound.tsx.
 */

export interface NotFoundLink {
  to: string
  label: string
}

export const NOT_FOUND_LINKS: NotFoundLink[] = [
  { to: '/',        label: 'Rankings'     },
  { to: '/network', label: 'Network'      },
  { to: '/tokens',  label: 'Tokens'       },
  { to: '/answers', label: 'Answers'      },
  { to: '/check',   label: 'Wallet checker' },
]
