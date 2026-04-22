import type { Field } from 'payload'
import { isAdminFieldAccess, getUserRole } from '@payload-admin/access/roles'

/**
 * Admin-only overrides for Payload's auto-generated API key fields.
 *
 * When `auth.useAPIKey: true` is set on a collection, Payload automatically
 * appends `enableAPIKey` + `apiKey` fields. Spreading these into the fields
 * array overrides the defaults so only admins can see, enable, or rotate
 * API keys. Editors never even see the fields.
 *
 * Usage in a Users collection:
 *   fields: [ ...yourFields, roleField, ...apiKeyFields ]
 */
export const apiKeyFields: Field[] = [
  {
    name: 'enableAPIKey',
    type: 'checkbox',
    access: {
      read: isAdminFieldAccess,
      create: isAdminFieldAccess,
      update: isAdminFieldAccess,
    },
    admin: {
      condition: (_data, _siblingData, { user }) => getUserRole(user) === 'admin',
    },
  },
  {
    name: 'apiKey',
    type: 'text',
    access: {
      read: isAdminFieldAccess,
      create: isAdminFieldAccess,
      update: isAdminFieldAccess,
    },
    admin: {
      condition: (_data, _siblingData, { user }) => getUserRole(user) === 'admin',
    },
  },
]
