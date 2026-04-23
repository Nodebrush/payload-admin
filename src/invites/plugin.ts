import type { Config, Plugin, CollectionConfig, Field } from 'payload'
import { inviteUserEndpoint } from './endpoint'
import { resendInviteEndpoint } from './resendEndpoint'

/**
 * Plugin that enables the invite-user flow:
 *  - Registers POST /api/invite-user and POST /api/resend-invite
 *  - Adds a read-only `isInvite` boolean to the auth-user collection so
 *    admins can see at a glance who has accepted their invitation
 *  - Adds a `resendInvite` UI field that renders a "Resend invitation"
 *    button on pending users' edit view
 *  - Adds an afterLogin hook that clears `isInvite` once the user signs in
 *  - Adds `isInvite` to the auth collection's defaultColumns so the status
 *    shows up in the list view without per-project config
 *
 * The invitation email copy itself (branded HTML) is configured separately
 * by spreading forgotPasswordEmail(...) onto the Users collection's
 * `auth.forgotPassword` field.
 */
export const invitesPlugin = (): Plugin => (incomingConfig: Config): Config => {
  const authSlug = incomingConfig.admin?.user
  if (!authSlug) return incomingConfig

  const isInviteField: Field = {
    name: 'isInvite',
    type: 'checkbox',
    defaultValue: false,
    label: 'Invite pending (user has not signed in yet)',
    admin: {
      readOnly: true,
      description:
        'Automatically unchecks the first time this user signs in. If still checked, they have not accepted their invitation.',
    },
    access: {
      read: () => true,
      create: () => true,
      update: () => true,
    },
  }

  const resendInviteUIField: Field = {
    name: 'resendInvite',
    type: 'ui',
    admin: {
      condition: (data) => Boolean(data?.isInvite),
      components: {
        Field: '@payload-admin/invites/ResendInviteButton',
      },
    },
  }

  const collections = incomingConfig.collections?.map((coll): CollectionConfig => {
    if (coll.slug !== authSlug) return coll

    const hasIsInvite = coll.fields.some(
      (f) => 'name' in f && (f as { name?: string }).name === 'isInvite',
    )
    const hasResendInvite = coll.fields.some(
      (f) => 'name' in f && (f as { name?: string }).name === 'resendInvite',
    )

    const nextFields: Field[] = [...coll.fields]
    if (!hasIsInvite) nextFields.push(isInviteField)
    if (!hasResendInvite) nextFields.push(resendInviteUIField)

    const existingDefaultColumns = coll.admin?.defaultColumns
    const nextDefaultColumns =
      existingDefaultColumns && !existingDefaultColumns.includes('isInvite')
        ? [...existingDefaultColumns, 'isInvite']
        : existingDefaultColumns

    return {
      ...coll,
      admin: {
        ...coll.admin,
        ...(nextDefaultColumns ? { defaultColumns: nextDefaultColumns } : {}),
      },
      fields: nextFields,
      hooks: {
        ...coll.hooks,
        afterLogin: [
          ...(coll.hooks?.afterLogin ?? []),
          async ({ req, user }) => {
            if ((user as { isInvite?: boolean })?.isInvite) {
              await req.payload.update({
                collection: authSlug as any,
                id: user.id,
                data: { isInvite: false } as any,
                overrideAccess: true,
              })
            }
          },
        ],
      },
    }
  })

  return {
    ...incomingConfig,
    collections,
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      inviteUserEndpoint,
      resendInviteEndpoint,
    ],
  }
}
