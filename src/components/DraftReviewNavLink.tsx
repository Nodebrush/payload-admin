'use client'

import React from 'react'
import { usePathname } from 'next/navigation'

export default function DraftReviewNavLink() {
  const pathname = usePathname()
  const isActive = pathname === '/admin/draft-review'

  return (
    <div>
      <a
        href="/admin/draft-review"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 12px',
          borderRadius: '4px',
          textDecoration: 'none',
          fontSize: '13px',
          fontWeight: isActive ? 600 : 400,
          color: isActive
            ? 'var(--theme-text, #fff)'
            : 'var(--theme-elevation-600, #999)',
          background: isActive ? 'var(--theme-elevation-150, #2a2a2a)' : 'transparent',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            ;(e.currentTarget as HTMLAnchorElement).style.background =
              'var(--theme-elevation-100, #222)'
            ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--theme-text, #fff)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLAnchorElement).style.color =
              'var(--theme-elevation-600, #999)'
          }
        }}
      >
        <span style={{ fontSize: '14px', flexShrink: 0 }}>◑</span>
        <span>Draft Review</span>
      </a>
    </div>
  )
}
