/** Pure rules of the browser-only comment list (storage and React live in useComments). */

export interface Comment {
  id: string
  dappId: string
  walletAddress: string
  text: string
  timestamp: number
  likes: number
  likedBy: string[]
}

export const MAX_COMMENT_LENGTH = 500

const isComment = (c: unknown): c is Comment => {
  const o = c as Record<string, unknown> | null
  return !!o && typeof o.id === 'string' && typeof o.dappId === 'string' && typeof o.walletAddress === 'string'
    && typeof o.text === 'string' && typeof o.timestamp === 'number' && typeof o.likes === 'number' && Array.isArray(o.likedBy)
}

/** Parses what was saved in storage; anything unreadable is dropped instead of crashing the page. */
export function parseComments(raw: string | null): Comment[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isComment) : []
  } catch {
    return []
  }
}

export function makeComment(dappId: string, walletAddress: string, text: string, now: number, random: number): Comment {
  return {
    id: `${now}-${random.toString(36).slice(2, 8)}`,
    dappId,
    walletAddress,
    text: text.slice(0, MAX_COMMENT_LENGTH),
    timestamp: now,
    likes: 0,
    likedBy: [],
  }
}

/** One like per wallet: liking twice takes the like back. */
export function toggleLike(all: Comment[], commentId: string, walletAddress: string): Comment[] {
  return all.map(c => {
    if (c.id !== commentId) return c
    const alreadyLiked = c.likedBy.includes(walletAddress)
    return {
      ...c,
      likes: alreadyLiked ? c.likes - 1 : c.likes + 1,
      likedBy: alreadyLiked ? c.likedBy.filter(a => a !== walletAddress) : [...c.likedBy, walletAddress],
    }
  })
}

/** Only the author's wallet can remove a comment. */
export function removeComment(all: Comment[], commentId: string, walletAddress: string): Comment[] {
  return all.filter(c => !(c.id === commentId && c.walletAddress === walletAddress))
}
