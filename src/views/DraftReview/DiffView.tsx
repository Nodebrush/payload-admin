'use client'

import React, { useState } from 'react'
import type { DocumentDiff, FieldDiff, ItemDiff } from './fetchDrafts'

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  fieldRow: {
    marginBottom: '16px',
  } as React.CSSProperties,

  fieldLabel: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--theme-text-field-label, var(--theme-elevation-800))',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,

  localeBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '1px 5px',
    borderRadius: '3px',
    background: 'var(--theme-elevation-200)',
    color: 'var(--theme-elevation-600)',
    letterSpacing: '0.04em',
    flexShrink: 0,
  } as React.CSSProperties,

  valueRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
    marginBottom: '4px',
  } as React.CSSProperties,

  badge: (variant: 'old' | 'new') =>
    ({
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
      padding: '2px 6px',
      borderRadius: '3px',
      flexShrink: 0,
      marginTop: '2px',
      background:
        variant === 'old'
          ? 'var(--theme-error-100, rgba(220,53,69,0.12))'
          : 'var(--theme-success-100, rgba(25,135,84,0.12))',
      color:
        variant === 'old'
          ? 'var(--theme-error-500, #dc3545)'
          : 'var(--theme-success-500, #198754)',
    }) as React.CSSProperties,

  valueText: (variant: 'old' | 'new') =>
    ({
      fontSize: '13px',
      lineHeight: 1.5,
      color:
        variant === 'old'
          ? 'var(--theme-error-500, #dc3545)'
          : 'var(--theme-success-500, #198754)',
      textDecoration: variant === 'old' ? 'line-through' : 'none',
      opacity: variant === 'old' ? 0.75 : 1,
      wordBreak: 'break-word' as const,
    }) as React.CSSProperties,

  itemBlock: {
    borderLeft: '3px solid var(--theme-elevation-200, #333)',
    paddingLeft: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,

  itemBlockAdded: {
    borderLeft: '3px solid var(--theme-success-500, #198754)',
    paddingLeft: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,

  itemBlockRemoved: {
    borderLeft: '3px solid var(--theme-error-500, #dc3545)',
    paddingLeft: '12px',
    marginBottom: '16px',
    opacity: 0.65,
  } as React.CSSProperties,

  itemHeader: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--theme-elevation-800)',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,

  statusChip: (status: 'added' | 'removed' | 'changed') =>
    ({
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      padding: '1px 5px',
      borderRadius: '3px',
      background:
        status === 'added'
          ? 'var(--theme-success-100, rgba(25,135,84,0.12))'
          : status === 'removed'
            ? 'var(--theme-error-100, rgba(220,53,69,0.12))'
            : 'var(--theme-warning-100, rgba(255,193,7,0.12))',
      color:
        status === 'added'
          ? 'var(--theme-success-500, #198754)'
          : status === 'removed'
            ? 'var(--theme-error-500, #dc3545)'
            : 'var(--theme-warning-500, #cc9800)',
    }) as React.CSSProperties,

  blockTypeChip: {
    fontSize: '10px',
    color: 'var(--theme-elevation-500)',
    fontFamily: 'monospace',
  } as React.CSSProperties,

  emptyState: {
    fontSize: '13px',
    color: 'var(--theme-elevation-500)',
    fontStyle: 'italic',
    padding: '8px 0',
  } as React.CSSProperties,
}

// ─── Field diff row ───────────────────────────────────────────────────────────

function FieldDiffRow({ diff }: { diff: FieldDiff }) {
  const isEmpty = !diff.old && !diff.new
  if (isEmpty) return null

  return (
    <div style={s.fieldRow}>
      <div style={s.fieldLabel}>
        <span>{diff.path}</span>
        {diff.locale && <span style={s.localeBadge}>{diff.locale}</span>}
      </div>
      {diff.old && (
        <div style={s.valueRow}>
          <span style={s.badge('old')}>Was</span>
          <span style={s.valueText('old')}>{diff.old}</span>
        </div>
      )}
      {diff.new && (
        <div style={s.valueRow}>
          <span style={s.badge('new')}>Now</span>
          <span style={s.valueText('new')}>{diff.new}</span>
        </div>
      )}
    </div>
  )
}

// ─── Item diff block ──────────────────────────────────────────────────────────

function ItemDiffBlock({ item }: { item: ItemDiff }) {
  const blockStyle =
    item.status === 'added'
      ? s.itemBlockAdded
      : item.status === 'removed'
        ? s.itemBlockRemoved
        : s.itemBlock

  return (
    <div style={blockStyle}>
      <div style={s.itemHeader}>
        <span style={s.statusChip(item.status)}>{item.status}</span>
        <span>{item.label}</span>
        {item.blockType && <span style={s.blockTypeChip}>{item.blockType}</span>}
      </div>
      {item.fieldDiffs.map((fd, i) => (
        <FieldDiffRow key={i} diff={fd} />
      ))}
    </div>
  )
}

// ─── Main DiffView ────────────────────────────────────────────────────────────

interface DiffViewProps {
  diff: DocumentDiff
  isExpanded: boolean
}

export function DiffView({ diff, isExpanded }: DiffViewProps) {
  if (!isExpanded) return null

  const hasFieldDiffs = diff.fieldDiffs.length > 0
  const hasItemDiffs = diff.itemDiffs.length > 0

  if (!hasFieldDiffs && !hasItemDiffs) {
    return (
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--theme-elevation-150, #2a2a2a)',
        }}
      >
        <p style={s.emptyState}>No text changes detected. Check Payload compare view for details.</p>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '16px',
        borderTop: '1px solid var(--theme-elevation-150, #2a2a2a)',
        background: 'var(--theme-elevation-50, rgba(0,0,0,0.2))',
      }}
    >
      {hasFieldDiffs && (
        <div style={{ marginBottom: hasItemDiffs ? '20px' : 0 }}>
          {diff.fieldDiffs.map((fd, i) => (
            <FieldDiffRow key={i} diff={fd} />
          ))}
        </div>
      )}
      {hasItemDiffs && (
        <div>
          {diff.itemDiffs.map((item, i) => (
            <ItemDiffBlock key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Document row (expandable) ────────────────────────────────────────────────

interface DocumentRowProps {
  documentTitle: string
  changedFieldsSummary: string
  editUrl: string
  compareUrl: string
  diff: DocumentDiff
  isNew: boolean
  onPublish: () => void
  isPublishing: boolean
  isPublished: boolean
}

export function DocumentRow({
  documentTitle,
  changedFieldsSummary,
  editUrl,
  compareUrl,
  diff,
  isNew,
  onPublish,
  isPublishing,
  isPublished,
}: DocumentRowProps) {
  const [expanded, setExpanded] = useState(false)

  if (isPublished) return null

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150, #2a2a2a)',
        borderRadius: '6px',
        marginBottom: '8px',
        overflow: 'hidden',
        background: 'var(--theme-elevation-0, #1a1a1a)',
      }}
    >
      {/* Row header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 14px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Chevron */}
        <span
          style={{
            fontSize: '12px',
            color: 'var(--theme-elevation-500)',
            flexShrink: 0,
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
            display: 'inline-block',
          }}
        >
          ▶
        </span>

        {/* Title */}
        <span
          style={{
            fontWeight: 600,
            fontSize: '14px',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {documentTitle}
          {isNew && (
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '2px 6px',
              borderRadius: '3px',
              background: 'var(--theme-warning-100, rgba(255,193,7,0.15))',
              color: 'var(--theme-warning-500, #cc9800)',
              flexShrink: 0,
            }}>
              Never published
            </span>
          )}
        </span>

        {/* Changed fields summary */}
        <span
          style={{
            fontSize: '12px',
            color: 'var(--theme-elevation-500)',
            flexShrink: 0,
            maxWidth: '300px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {changedFieldsSummary}
        </span>

        {/* Actions — stop propagation so clicks don't toggle expand */}
        <div
          style={{ display: 'flex', gap: '8px', flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '12px',
              color: 'var(--theme-text, #eee)',
              textDecoration: 'none',
              padding: '4px 10px',
              border: '1px solid var(--theme-elevation-300)',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              background: 'var(--theme-elevation-100)',
            }}
            title="Open in Payload editor"
          >
            Edit ↗
          </a>
          <a
            href={compareUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '12px',
              color: 'var(--theme-elevation-500)',
              textDecoration: 'none',
              padding: '4px 8px',
              border: '1px solid var(--theme-elevation-200)',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
            }}
            title="View version history in Payload"
          >
            History ↗
          </a>
          <button
            onClick={onPublish}
            disabled={isPublishing}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: '4px',
              border: 'none',
              cursor: isPublishing ? 'not-allowed' : 'pointer',
              background: isPublishing
                ? 'var(--theme-elevation-300)'
                : 'var(--theme-success-500, #198754)',
              color: '#fff',
              whiteSpace: 'nowrap',
              opacity: isPublishing ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isPublishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Diff panel */}
      <DiffView diff={diff} isExpanded={expanded} />
    </div>
  )
}
