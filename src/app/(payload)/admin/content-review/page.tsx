import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchAllContent } from '@payload-admin/views/ContentReview/fetchContent'
import { ContentReviewList } from '@payload-admin/views/ContentReview'
import { requireAdminPage } from '@payload-admin/access/requireAdminPage'

export const dynamic = 'force-dynamic'

export default async function ContentReviewPage() {
  const forbidden = await requireAdminPage()
  if (forbidden) return forbidden

  const payload = await getPayload({ config })
  const { documents, localeCodes, notes } = await fetchAllContent(payload)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--theme-bg, #111)',
        color: 'var(--theme-text, #eee)',
        fontFamily: 'var(--font-body, system-ui, sans-serif)',
        padding: '0',
      }}
    >
      {/* Page header */}
      <div
        style={{
          borderBottom: '1px solid var(--theme-elevation-150, #2a2a2a)',
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          background: 'var(--theme-elevation-0, #1a1a1a)',
        }}
      >
        <a
          href="/admin"
          style={{
            fontSize: '13px',
            color: 'var(--theme-elevation-500)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          ← Admin
        </a>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, lineHeight: 1.2 }}>
            Content Review
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--theme-elevation-500)' }}>
            All latest content across {documents.length} document
            {documents.length === 1 ? '' : 's'} — compare locales side by side
          </p>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '32px 24px',
        }}
      >
        <ContentReviewList documents={documents} localeCodes={localeCodes} initialNotes={notes} />
      </div>
    </div>
  )
}
