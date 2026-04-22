import type { Access, FieldAccess } from 'payload'

export type UserRole = 'admin' | 'editor' | 'contributor'

/**
 * Role helpers shared across every svelteload project.
 *
 * Roles:
 *  - `admin`       — full access (users, messages, all content)
 *  - `editor`      — content only (pages, blog, media, settings, nav) with publishing rights
 *  - `contributor` — same content scope as editor, but blocked from publishing
 *                    (drafts only — enforced by draftProtectionPlugin)
 *
 * Backward-compatibility: users whose `role` field is missing (e.g. records
 * from before this field existed) are treated as admin. New users default
 * to `editor` via the shared roleField config.
 */

export function getUserRole(user: unknown): UserRole {
  if (user && typeof user === 'object' && 'role' in user) {
    const role = (user as { role?: unknown }).role
    if (role === 'editor') return 'editor'
    if (role === 'contributor') return 'contributor'
  }
  return 'admin'
}

export const isAdmin: Access = ({ req }) => getUserRole(req.user) === 'admin'

export const isAdminOrEditor: Access = ({ req }) => Boolean(req.user)

export const isAdminOrSelf: Access = ({ req, id }) => {
  if (!req.user) return false
  if (getUserRole(req.user) === 'admin') return true
  if (id && req.user.id === id) return true
  return { id: { equals: req.user.id } }
}

export const isAdminFieldAccess: FieldAccess = ({ req }) => getUserRole(req.user) === 'admin'
