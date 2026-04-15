import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchAllPendingDrafts } from '@payload-admin/views/DraftReview/fetchDrafts'
import { DraftList } from '@payload-admin/views/DraftReview/PublishButtons'

export const dynamic = 'force-dynamic'

export default async function DraftReviewPage() {
  const payload = await getPayload({ config })
  const drafts = await fetchAllPendingDrafts(payload)

  const totalCount = drafts.length

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
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            Draft Review
          </h1>
          {totalCount > 0 && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '13px',
                color: 'var(--theme-elevation-500)',
              }}
            >
              {totalCount} document{totalCount === 1 ? '' : 's'} with pending changes
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '32px 24px',
        }}
      >
        <DraftList initialDrafts={drafts} />
      </div>
    </div>
  )
}
