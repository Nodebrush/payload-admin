import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Draft Review',
  icons: [
    { rel: 'icon', type: 'image/svg+xml', url: '/favicon.svg' },
    { rel: 'icon', type: 'image/png', sizes: '96x96', url: '/favicon.png' },
    { rel: 'apple-touch-icon', url: '/apple-touch-icon.png' },
  ],
}

export default function DraftReviewLayout({ children }: { children: ReactNode }) {
  return children
}
