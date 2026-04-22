import React from 'react'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getUserRole } from '@payload-admin/access/roles'

/**
 * Server-side guard for custom admin pages under /admin/*.
 * Returns null if the current user is an admin, otherwise returns a forbidden page.
 *
 * Usage:
 *   const forbidden = await requireAdminPage()
 *   if (forbidden) return forbidden
 */
export async function requireAdminPage(): Promise<React.ReactElement | null> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (user && getUserRole(user) === 'admin') return null

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        background: 'var(--theme-bg, #111)',
        color: 'var(--theme-text, #eee)',
        fontFamily: 'var(--font-body, system-ui, sans-serif)',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Access denied</h1>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--theme-elevation-500)' }}>
        This page is restricted to admins.
      </p>
      <a
        href="/admin"
        style={{
          marginTop: '8px',
          fontSize: '13px',
          color: 'var(--theme-elevation-600)',
          textDecoration: 'underline',
        }}
      >
        ← Back to admin
      </a>
    </div>
  )
}
