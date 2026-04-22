'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@payloadcms/ui'
import { getUserRole } from '@payload-admin/access/roles'

type ScanResult = {
  success: boolean
  updated?: number
  totalUsages?: number
  error?: string
}

export default function ScanMediaUsageButton() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)

  if (getUserRole(user) !== 'admin') return null

  const handleScan = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/scan-media-usage', { method: 'POST' })
      const data: ScanResult = await res.json()
      setResult(data)
      if (data.success) {
        setTimeout(() => router.refresh(), 500)
      }
    } catch {
      setResult({ success: false, error: 'Request failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        type="button"
        onClick={handleScan}
        disabled={loading}
        className="btn btn--icon-style-without-border btn--size-small btn--withoutPopup btn--style-pill"
      >
        <span className="btn__content">
          <span className="btn__label">{loading ? 'Scanning...' : 'Scan Image Usage'}</span>
        </span>
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
          {result.success
            ? `Done — ${result.updated} items updated`
            : `Error: ${result.error}`}
        </span>
      )}
    </div>
  )
}
