/**
 * useComments — basit localStorage tabanlı yorum sistemi.
 * Gerçek bir backend gelince burası API çağrısına dönüştürülür.
 * Her yorum: { id, dappId, author, text, timestamp, walletAddress }
 */
import { useState, useEffect, useCallback } from 'react'

import { makeComment, parseComments, removeComment, toggleLike, type Comment } from '@/lib/comments'

export type { Comment } from '@/lib/comments'

const STORAGE_KEY = 'pulsarc_comments_v1'

function loadComments(): Comment[] {
  try {
    return parseComments(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function saveComments(comments: Comment[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comments))
  } catch { /* storage full — silently ignore */ }
}

export function useComments(dappId: string) {
  const [all, setAll] = useState<Comment[]>([])

  useEffect(() => {
    setAll(loadComments().filter(c => c.dappId === dappId))
  }, [dappId])

  const post = useCallback((walletAddress: string, text: string) => {
    const newComment = makeComment(dappId, walletAddress, text, Date.now(), Math.random())
    const updated = [...loadComments(), newComment]
    saveComments(updated)
    setAll(updated.filter(c => c.dappId === dappId))
    return newComment
  }, [dappId])

  const like = useCallback((commentId: string, walletAddress: string) => {
    const updated = toggleLike(loadComments(), commentId, walletAddress)
    saveComments(updated)
    setAll(updated.filter(c => c.dappId === dappId))
  }, [dappId])

  const remove = useCallback((commentId: string, walletAddress: string) => {
    const updated = removeComment(loadComments(), commentId, walletAddress)
    saveComments(updated)
    setAll(updated.filter(c => c.dappId === dappId))
  }, [dappId])

  return { comments: all, post, like, remove }
}
