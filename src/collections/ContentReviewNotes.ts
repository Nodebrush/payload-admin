import type { CollectionConfig } from 'payload'
import { isAdmin } from '@payload-admin/access/roles'

/**
 * Internal utility collection for the Content Review tool.
 * Hidden from the admin UI entirely — used only by the Content Review page
 * to track which documents have been reviewed and when.
 */
export const ContentReviewNotes: CollectionConfig = {
  slug: 'content-review-notes',
  admin: {
    hidden: true,
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'key',
      type: 'text',
      label: 'Document Key',
      required: true,
      unique: true,
      // Format: "collection:docId" or "global:slug"
      // e.g. "pages:42", "blog:7", "global:navbar"
    },
    {
      name: 'docUpdatedAt',
      type: 'date',
      label: 'Doc Updated At (at review time)',
      required: false,
      admin: {
        description: 'The updatedAt timestamp of the document when it was last reviewed. Null for globals without versioning.',
      },
    },
  ],
}
