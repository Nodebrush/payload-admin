import type { Endpoint } from 'payload'
import { getUserRole } from '@payload-admin/access/roles'

/**
 * POST /api/resend-invite
 *
 * Admin-only. Re-triggers payload.forgotPassword() for a user that still
 * has `isInvite: true`, so a fresh invitation email goes out with a new
 * reset token (the previous token may have expired after 7 days).
 */
export const resendInviteEndpoint: Endpoint = {
  path: '/resend-invite',
  method: 'post',
  handler: async (req) => {
    if (!req.user || getUserRole(req.user) !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { id?: string | number } = {}
    try {
      body = req.json ? await req.json() : {}
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.id) {
      return Response.json({ error: 'A user id is required' }, { status: 400 })
    }

    const authCollectionSlug = req.payload.config.admin?.user
    if (!authCollectionSlug) {
      return Response.json({ error: 'No auth user collection configured' }, { status: 500 })
    }

    try {
      const user = await req.payload.findByID({
        collection: authCollectionSlug as any,
        id: body.id as any,
        overrideAccess: true,
      })

      if (!user) {
        return Response.json({ error: 'User not found' }, { status: 404 })
      }

      if (!(user as { isInvite?: boolean }).isInvite) {
        return Response.json(
          { error: 'This user has already accepted their invitation.' },
          { status: 409 },
        )
      }

      const email = (user as { email?: string }).email
      if (!email) {
        return Response.json({ error: 'User has no email on file' }, { status: 400 })
      }

      await req.payload.forgotPassword({
        collection: authCollectionSlug as any,
        data: { email },
        disableEmail: false,
      })

      return Response.json({ success: true, email })
    } catch (err) {
      req.payload.logger.error({ err }, '[resend-invite] failed')
      const message = err instanceof Error ? err.message : 'Failed to resend invitation'
      return Response.json({ error: message }, { status: 500 })
    }
  },
}
