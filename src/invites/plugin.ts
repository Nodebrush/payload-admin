import type { Config, Plugin, CollectionConfig, Field } from 'payload'
import { inviteUserEndpoint } from './endpoint'

/**
 * Plugin that enables the invite-user flow:
 *  - Registers POST /api/invite-user
 *  - Adds a hidden `isInvite` boolean to the auth-user collection
 *  - Adds an afterLogin hook that clears `isInvite` once the user signs in
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
    admin: { hidden: true },
    access: {
      read: () => true,
      create: () => true,
      update: () => true,
    },
  }

  const collections = incomingConfig.collections?.map((coll): CollectionConfig => {
    if (coll.slug !== authSlug) return coll

    const hasIsInvite = coll.fields.some(
      (f) => 'name' in f && (f as { name?: string }).name === 'isInvite',
    )

    return {
      ...coll,
      fields: hasIsInvite ? coll.fields : [...coll.fields, isInviteField],
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
    endpoints: [...(incomingConfig.endpoints ?? []), inviteUserEndpoint],
  }
}
