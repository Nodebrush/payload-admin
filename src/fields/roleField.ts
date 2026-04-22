import type { Field } from 'payload'
import { isAdminFieldAccess } from '@payload-admin/access/roles'

/**
 * Reusable role field for Users collections across every svelteload project.
 *
 * Spread this into the Users collection's `fields` array. Only admins can
 * change another user's role. New users default to `editor`.
 */
export const roleField: Field = {
  name: 'role',
  type: 'select',
  required: true,
  defaultValue: 'editor',
  options: [
    { label: 'Admin', value: 'admin' },
    { label: 'Editor', value: 'editor' },
    { label: 'Contributor (draft-only)', value: 'contributor' },
  ],
  access: {
    create: isAdminFieldAccess,
    update: isAdminFieldAccess,
  },
  admin: {
    position: 'sidebar',
    description:
      'Admin: full access. Editor: content only, can publish. Contributor: content only, drafts only (cannot publish).',
  },
}
