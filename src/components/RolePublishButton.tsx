'use client'

import React from 'react'
import { PublishButton, useAuth } from '@payloadcms/ui'
import { getUserRole } from '@payload-admin/access/roles'

export default function RolePublishButton() {
  const { user } = useAuth()
  if (getUserRole(user) === 'contributor') return null
  return <PublishButton />
}
