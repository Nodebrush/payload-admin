'use client'

import React, { useState } from 'react'
import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import { getUserRole } from '@payload-admin/access/roles'

/**
 * UI-field component rendered on the Users edit view for any user whose
 * `isInvite` flag is still true. Calls POST /api/resend-invite, which
 * triggers a fresh invitation email with a new reset token.
 */
export default function ResendInviteButton() {
  const { user } = useAuth()
  const { id } = useDocumentInfo()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  if (getUserRole(user) !== 'admin') return null
  if (!id) return null

  const handleResend = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ success: false, message: data.error ?? 'Failed to resend invitation' })
      } else {
        setResult({ success: true, message: `Invitation resent to ${data.email}` })
      }
    } catch {
      setResult({ success: false, message: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        marginBottom: '20px',
        padding: '14px 16px',
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '4px',
      }}
    >
      <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--theme-elevation-600)' }}>
        This user has not accepted their invitation yet. If their reset link has expired, send a
        fresh one.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={handleResend}
          disabled={loading}
          className="btn btn--style-secondary btn--size-small"
        >
          {loading ? 'Sending…' : 'Resend invitation'}
        </button>
        {result && (
          <span
            style={{
              fontSize: '13px',
              color: result.success
                ? 'var(--theme-success-500, #22c55e)'
                : 'var(--theme-error-500, #ef4444)',
            }}
          >
            {result.message}
          </span>
        )}
      </div>
    </div>
  )
}
