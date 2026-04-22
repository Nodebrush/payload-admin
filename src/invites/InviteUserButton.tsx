'use client'

import React, { useState } from 'react'
import { useAuth } from '@payloadcms/ui'
import { getUserRole } from '@payload-admin/access/roles'
import { InviteUserDialog } from './InviteUserDialog'

/**
 * List-view action button on the Users collection. Admin-only.
 * Opens InviteUserDialog, which POSTs to /api/invite-user and triggers the
 * invitation email (rendered by forgotPasswordEmail).
 */
export default function InviteUserButton() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  if (getUserRole(user) !== 'admin') return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn--icon-style-without-border btn--size-small btn--withoutPopup btn--style-pill"
      >
        <span className="btn__content">
          <span className="btn__label">Invite user</span>
        </span>
      </button>
      {open && <InviteUserDialog onClose={() => setOpen(false)} />}
    </>
  )
}
