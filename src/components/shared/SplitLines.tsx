import { motion, useInView } from 'framer-motion'
import { createElement, useRef } from 'react'

interface Line { text: string; className?: string }

interface Props {
  lines: Line[]
  as?: 'h1' | 'h2' | 'h3' | 'p'
  className?: string
  delay?: number
  stagger?: number
}

/**
 * Headline reveal: every word rises out of its own clipped mask, line by line.
 * The mask is what makes it read as typeset motion instead of a plain fade.
 *
 * Visibility is observed on the fixed heading element, not on the moving words:
 * a word translated out of its overflow-hidden mask counts as "not intersecting",
 * so observing it would never fire.
 */
export function SplitLines({ lines, as = 'h2', className, delay = 0, stagger = 0.055 }: Props) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  let index = 0

  return createElement(
    as,
    { ref, className, 'aria-label': lines.map(l => l.text).join(' ') },
    lines.map((line, li) => (
      <span key={li} className={`block ${line.className ?? ''}`} aria-hidden>
        {line.text.split(' ').map((word, wi) => {
          const i = index++
          return (
            <span key={`${li}-${wi}`} className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
              <motion.span
                className="inline-block will-change-transform"
                initial={{ y: '112%' }}
                animate={{ y: inView ? '0%' : '112%' }}
                transition={{ duration: 0.85, delay: delay + i * stagger, ease: [0.19, 1, 0.22, 1] }}
              >
                {word}&nbsp;
              </motion.span>
            </span>
          )
        })}
      </span>
    )),
  )
}
