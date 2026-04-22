import type { Endpoint } from 'payload'
import crypto from 'node:crypto'
import { getUserRole, type UserRole } from '@payload-admin/access/roles'

/**
 * POST /api/invite-user
 *
 * Admin-only. Creates a user with a random password + `isInvite: true`,
 * then calls payload.forgotPassword() so the user receives a branded
 * invitation email with a reset link. They set their own password via
 * Payload's standard /admin/reset/:token flow.
 */
export const inviteUserEndpoint: Endpoint = {
  path: '/invite-user',
  method: 'post',
  handler: async (req) => {
    if (!req.user || getUserRole(req.user) !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { email?: string; role?: UserRole; name?: string } = {}
    try {
      body = req.json ? await req.json() : {}
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const email = body.email?.trim().toLowerCase()
    const role: UserRole = body.role === 'admin' ? 'admin' : 'editor'

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const authCollectionSlug = req.payload.config.admin?.user
    if (!authCollectionSlug) {
      return Response.json({ error: 'No auth user collection configured' }, { status: 500 })
    }

    const existing = await req.payload.find({
      collection: authCollectionSlug as any,
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      return Response.json(
        { error: 'A user with that email already exists.' },
        { status: 409 },
      )
    }

    const randomPassword = crypto.randomBytes(24).toString('base64url')

    const data: Record<string, unknown> = {
      email,
      password: randomPassword,
      role,
      isInvite: true,
    }
    if (body.name) data.name = body.name.trim()

    try {
      await req.payload.create({
        collection: authCollectionSlug as any,
        data: data as any,
        overrideAccess: true,
      })

      await req.payload.forgotPassword({
        collection: authCollectionSlug as any,
        data: { email },
        disableEmail: false,
      })

      return Response.json({ success: true, email })
    } catch (err) {
      req.payload.logger.error({ err }, '[invite-user] failed')
      const message = err instanceof Error ? err.message : 'Failed to send invitation'
      return Response.json({ error: message }, { status: 500 })
    }
  },
}
