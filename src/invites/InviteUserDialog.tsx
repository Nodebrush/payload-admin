'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Role = 'admin' | 'editor' | 'contributor'

interface Props {
  onClose: () => void
}

export function InviteUserDialog({ onClose }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to send invitation')
      } else {
        setSent(email)
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--theme-bg, #1a1a1a)',
          border: '1px solid var(--theme-elevation-150, #2a2a2a)',
          borderRadius: '6px',
          padding: '24px',
          color: 'var(--theme-text, #eee)',
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700 }}>Invite user</h2>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--theme-elevation-500)' }}>
          They'll receive an email with a link to set their password and sign in.
        </p>

        {sent ? (
          <>
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(74,222,128,0.08)',
                border: '1px solid rgba(74,222,128,0.3)',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#4ade80',
                marginBottom: '16px',
              }}
            >
              Invitation sent to <strong>{sent}</strong>.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn--style-primary btn--size-small"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={labelStyle}>Email</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={labelStyle}>Name (optional)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '20px' }}>
              <span style={labelStyle}>Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                style={inputStyle}
              >
                <option value="editor">Editor — content, can publish</option>
                <option value="contributor">Contributor — content, drafts only</option>
                <option value="admin">Admin — full access</option>
              </select>
            </label>

            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#ef4444',
                  marginBottom: '16px',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="btn btn--style-secondary btn--size-small"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                className="btn btn--style-primary btn--size-small"
              >
                {loading ? 'Sending…' : 'Send invitation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--theme-elevation-600)',
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  background: 'var(--theme-elevation-50, #111)',
  border: '1px solid var(--theme-elevation-200, #333)',
  borderRadius: '4px',
  color: 'var(--theme-text, #eee)',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
