// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/i18n/useT'
import './ScrollTabs.css'
export function ScrollTabs({ children, label, className }: { children: ReactNode; label: string; className: string }) {
  const ref = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const { t } = useT('shell')
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const update = () =>
      setEdges({ left: node.scrollLeft > 1, right: node.scrollWidth - node.clientWidth - node.scrollLeft > 1 })
    const revealActive = () => {
      const active = node.querySelector<HTMLElement>('.active, [aria-current="page"]')
      if (active) {
        const tab = active.getBoundingClientRect()
        const strip = node.getBoundingClientRect()
        if (tab.right > strip.right - 30) node.scrollLeft += tab.right - strip.right + 30
        else if (tab.left < strip.left + 30) node.scrollLeft -= strip.left + 30 - tab.left
      }
      update()
    }
    const observer = new ResizeObserver(revealActive)
    observer.observe(node)
    node.addEventListener('scroll', update)
    revealActive()
    return () => {
      observer.disconnect()
      node.removeEventListener('scroll', update)
    }
  }, [children])
  return (
    <div className="scroll-tabs-wrap">
      {edges.left && (
        <button
          className="scroll-tabs-arrow left"
          type="button"
          aria-label={t('previousTabs')}
          onClick={() => ref.current?.scrollBy({ left: -180, behavior: 'auto' })}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      <nav ref={ref} className={`${className} scroll-tabs`} aria-label={label}>
        {children}
      </nav>
      {edges.right && (
        <button
          className="scroll-tabs-arrow right"
          type="button"
          aria-label={t('nextTabs')}
          onClick={() => ref.current?.scrollBy({ left: 180, behavior: 'auto' })}
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}
