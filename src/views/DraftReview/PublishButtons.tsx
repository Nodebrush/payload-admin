'use client'

import React, { useCallback, useState } from 'react'
import type { PendingDraft } from './fetchDrafts'
import { publishDocument, publishGlobal } from './actions'
import { DocumentRow } from './DiffView'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DraftState {
  drafts: PendingDraft[]
  publishedKeys: Set<string>
}

function getDraftKey(draft: PendingDraft): string {
  if (draft.type === 'collection') return `${draft.collection}/${draft.parentId}`
  return `global/${draft.globalSlug}`
}

// ─── Draft List ───────────────────────────────────────────────────────────────

interface DraftListProps {
  initialDrafts: PendingDraft[]
}

export function DraftList({ initialDrafts }: DraftListProps) {
  const [publishedKeys, setPublishedKeys] = useState<Set<string>>(new Set())
  const [publishingKeys, setPublishingKeys] = useState<Set<string>>(new Set())
  const [publishAllPending, setPublishAllPending] = useState(false)
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({})

  const activeDrafts = initialDrafts.filter((d) => !publishedKeys.has(getDraftKey(d)))

  const markPublished = (key: string) => {
    setPublishedKeys((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  const markPublishing = (key: string, active: boolean) => {
    setPublishingKeys((prev) => {
      const next = new Set(prev)
      if (active) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const handlePublish = useCallback(
    async (draft: PendingDraft) => {
      const key = getDraftKey(draft)
      markPublishing(key, true)
      setErrorMessages((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })

      try {
        let result
        if (draft.type === 'collection' && draft.collection && draft.parentId) {
          result = await publishDocument(draft.collection, draft.parentId)
        } else if (draft.type === 'global' && draft.globalSlug) {
          result = await publishGlobal(draft.globalSlug)
        } else {
          result = { success: false, error: 'Invalid draft configuration' }
        }

        if (result.success) {
          markPublished(key)
        } else {
          setErrorMessages((prev) => ({
            ...prev,
            [key]: result.error ?? 'Publish failed',
          }))
        }
      } catch (err) {
        setErrorMessages((prev) => ({
          ...prev,
          [key]: err instanceof Error ? err.message : 'Unexpected error',
        }))
      } finally {
        markPublishing(key, false)
      }
    },
    [],
  )

  const [publishAllProgress, setPublishAllProgress] = useState<{ done: number; total: number } | null>(null)

  const handlePublishAll = useCallback(async () => {
    const draftsToPublish = activeDrafts
    if (draftsToPublish.length === 0) return

    setPublishAllPending(true)
    setErrorMessages({})
    setPublishAllProgress({ done: 0, total: draftsToPublish.length })

    // Publish sequentially — one server action at a time.
    // Parallel publishing exhausts the DB connection pool and deadlocks.
    // Each item disappears from the list immediately after it succeeds.
    for (let i = 0; i < draftsToPublish.length; i++) {
      const draft = draftsToPublish[i]
      const key = getDraftKey(draft)

      try {
        let result
        if (draft.type === 'collection' && draft.collection && draft.parentId) {
          result = await publishDocument(draft.collection, draft.parentId)
        } else if (draft.type === 'global' && draft.globalSlug) {
          result = await publishGlobal(draft.globalSlug)
        } else {
          result = { success: false, error: 'Invalid draft configuration' }
        }

        if (result.success) {
          markPublished(key)
        } else {
          setErrorMessages((prev) => ({ ...prev, [key]: result.error ?? 'Publish failed' }))
        }
      } catch (err) {
        setErrorMessages((prev) => ({
          ...prev,
          [key]: err instanceof Error ? err.message : 'Unexpected error',
        }))
      }

      setPublishAllProgress({ done: i + 1, total: draftsToPublish.length })
    }

    setPublishAllPending(false)
    setPublishAllProgress(null)
  }, [activeDrafts])

  // ── Group by collection/global ────────────────────────────────────────────

  const collections = ['pages', 'blog', 'projects', 'menus'] as const
  const COLLECTION_LABELS: Record<string, string> = {
    pages: 'Pages',
    blog: 'Blog',
    projects: 'Projects',
    menus: 'Menus',
  }

  const collectionGroups = collections
    .map((col) => ({
      collection: col,
      label: COLLECTION_LABELS[col],
      drafts: initialDrafts.filter((d) => d.type === 'collection' && d.collection === col),
    }))
    .filter((g) => g.drafts.length > 0)

  const globalDrafts = initialDrafts.filter((d) => d.type === 'global')

  const totalActive = activeDrafts.length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '14px', color: 'var(--theme-elevation-500)' }}>
          {totalActive === 0
            ? 'All drafts published.'
            : `${totalActive} pending draft${totalActive === 1 ? '' : 's'}`}
        </div>
        {totalActive > 0 && (
          <button
            onClick={handlePublishAll}
            disabled={publishAllPending || totalActive === 0}
            style={{
              fontWeight: 700,
              fontSize: '14px',
              padding: '8px 20px',
              borderRadius: '4px',
              border: 'none',
              cursor: publishAllPending ? 'not-allowed' : 'pointer',
              background: publishAllPending
                ? 'var(--theme-elevation-300)'
                : 'var(--theme-success-500, #198754)',
              color: '#fff',
              opacity: publishAllPending ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {publishAllProgress
              ? `Publishing… ${publishAllProgress.done}/${publishAllProgress.total}`
              : `Publish All (${totalActive})`}
          </button>
        )}
      </div>

      {/* Empty state */}
      {totalActive === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--theme-elevation-500)',
            fontSize: '15px',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
          <div>No pending drafts — everything is published.</div>
        </div>
      )}

      {/* Collections */}
      {collectionGroups.map(({ collection, label, drafts }) => {
        const activeCount = drafts.filter((d) => !publishedKeys.has(getDraftKey(d))).length
        if (activeCount === 0) return null

        return (
          <div key={collection} style={{ marginBottom: '36px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--theme-elevation-500)',
                borderBottom: '1px solid var(--theme-elevation-150, #2a2a2a)',
                paddingBottom: '8px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span>{label}</span>
              <span
                style={{
                  background: 'var(--theme-elevation-200)',
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontWeight: 600,
                }}
              >
                {activeCount}
              </span>
            </div>
            {drafts.map((draft) => {
              const key = getDraftKey(draft)
              return (
                <DocumentRow
                  key={key}
                  documentTitle={draft.documentTitle}
                  changedFieldsSummary={draft.diff.changedFieldsSummary}
                  editUrl={draft.editUrl}
                  compareUrl={draft.compareUrl}
                  diff={draft.diff}
                  isNew={draft.isNew}
                  onPublish={() => handlePublish(draft)}
                  isPublishing={publishingKeys.has(key)}
                  isPublished={publishedKeys.has(key)}
                />
              )
            })}
            {/* Per-doc error messages */}
            {drafts.map((draft) => {
              const key = getDraftKey(draft)
              const err = errorMessages[key]
              if (!err) return null
              return (
                <div
                  key={`err-${key}`}
                  style={{
                    fontSize: '12px',
                    color: 'var(--theme-error-500, #dc3545)',
                    marginBottom: '8px',
                    padding: '6px 10px',
                    background: 'var(--theme-error-100, rgba(220,53,69,0.08))',
                    borderRadius: '4px',
                  }}
                >
                  ✕ {draft.documentTitle}: {err}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Globals */}
      {globalDrafts.filter((d) => !publishedKeys.has(getDraftKey(d))).length > 0 && (
        <div style={{ marginBottom: '36px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--theme-elevation-500)',
              borderBottom: '1px solid var(--theme-elevation-150, #2a2a2a)',
              paddingBottom: '8px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span>Globals</span>
            <span
              style={{
                background: 'var(--theme-elevation-200)',
                borderRadius: '10px',
                padding: '1px 7px',
                fontWeight: 600,
              }}
            >
              {globalDrafts.filter((d) => !publishedKeys.has(getDraftKey(d))).length}
            </span>
          </div>
          {globalDrafts.map((draft) => {
            const key = getDraftKey(draft)
            const err = errorMessages[key]
            return (
              <React.Fragment key={key}>
                <DocumentRow
                  documentTitle={draft.documentTitle}
                  changedFieldsSummary={draft.diff.changedFieldsSummary}
                  editUrl={draft.editUrl}
                  compareUrl={draft.compareUrl}
                  diff={draft.diff}
                  isNew={draft.isNew}
                  onPublish={() => handlePublish(draft)}
                  isPublishing={publishingKeys.has(key)}
                  isPublished={publishedKeys.has(key)}
                />
                {err && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--theme-error-500, #dc3545)',
                      marginBottom: '8px',
                      padding: '6px 10px',
                      background: 'var(--theme-error-100, rgba(220,53,69,0.08))',
                      borderRadius: '4px',
                    }}
                  >
                    ✕ {draft.documentTitle}: {err}
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}
