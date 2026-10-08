/**
 * useComments — basit localStorage tabanlı yorum sistemi.
 * Gerçek bir backend gelince burası API çağrısına dönüştürülür.
 * Her yorum: { id, dappId, author, text, timestamp, walletAddress }
 */
import { useState, useEffect, useCallback } from 'react'

export interface Comment {
  id: string
  dappId: string
  walletAddress: string
  text: string
  timestamp: number
  likes: number
  likedBy: string[]
}

const STORAGE_KEY = 'arclytics_comments_v1'

function loadComments(): Comment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Comment[]) : []
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
    const newComment: Comment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dappId,
      walletAddress,
      text: text.slice(0, 500),
      timestamp: Date.now(),
      likes: 0,
      likedBy: [],
    }
    const updated = [...loadComments(), newComment]
    saveComments(updated)
    setAll(updated.filter(c => c.dappId === dappId))
    return newComment
  }, [dappId])

  const like = useCallback((commentId: string, walletAddress: string) => {
    const all = loadComments()
    const updated = all.map(c => {
      if (c.id !== commentId) return c
      const alreadyLiked = c.likedBy.includes(walletAddress)
      return {
        ...c,
        likes: alreadyLiked ? c.likes - 1 : c.likes + 1,
        likedBy: alreadyLiked
          ? c.likedBy.filter(a => a !== walletAddress)
          : [...c.likedBy, walletAddress],
      }
    })
    saveComments(updated)
    setAll(updated.filter(c => c.dappId === dappId))
  }, [dappId])

  const remove = useCallback((commentId: string, walletAddress: string) => {
    const all = loadComments()
    const updated = all.filter(c => !(c.id === commentId && c.walletAddress === walletAddress))
    saveComments(updated)
    setAll(updated.filter(c => c.dappId === dappId))
  }, [dappId])

  return { comments: all, post, like, remove }
}
