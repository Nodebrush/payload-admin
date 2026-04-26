import type { Config, Plugin } from 'payload'
import { APIError } from 'payload'
import { getUserRole } from '@payload-admin/access/roles'

/**
 * Payload plugin that blocks publishing for users with the `contributor` role
 * across every collection and global that has draft mode enabled.
 *
 * Two layers of enforcement:
 *  1. UI — replaces the default PublishButton with one that returns null for
 *     contributors, so they don't see a button they can't use.
 *  2. Server — beforeOperation hook throws Forbidden if a contributor tries
 *     to set _status: 'published' anyway (covers API calls and any UI gap).
 *
 * Admins and editors are unaffected and can publish freely.
 */
export const draftProtectionPlugin = (): Plugin => (incomingConfig: Config): Config => {
    const hasDrafts = (versions: any): boolean => {
        if (!versions) return false
        if (typeof versions === 'object' && versions.drafts) return true
        return false
    }

    const blockContributorPublish = async ({ args, operation, req }: any) => {
        if (
            req.user &&
            getUserRole(req.user) === 'contributor' &&
            (operation === 'update' || operation === 'create') &&
            args?.data?._status === 'published'
        ) {
            throw new APIError(
                'Contributors can only save drafts — publishing is not allowed.',
                403,
                undefined,
                true,
            )
        }
        return args
    }

    const publishButtonPath = '@payload-admin/components/RolePublishButton#default'

    return {
        ...incomingConfig,
        collections: incomingConfig.collections?.map(collection => {
            if (!hasDrafts(collection.versions)) return collection
            return {
                ...collection,
                admin: {
                    ...collection.admin,
                    components: {
                        ...collection.admin?.components,
                        edit: {
                            ...collection.admin?.components?.edit,
                            PublishButton: publishButtonPath,
                        },
                    },
                },
                hooks: {
                    ...collection.hooks,
                    beforeOperation: [
                        blockContributorPublish,
                        ...(collection.hooks?.beforeOperation ?? []),
                    ],
                },
            }
        }),
        globals: incomingConfig.globals?.map(global => {
            if (!hasDrafts(global.versions)) return global
            return {
                ...global,
                admin: {
                    ...global.admin,
                    components: {
                        ...global.admin?.components,
                        elements: {
                            ...global.admin?.components?.elements,
                            PublishButton: publishButtonPath,
                        },
                    },
                },
                hooks: {
                    ...global.hooks,
                    beforeOperation: [
                        blockContributorPublish,
                        ...(global.hooks?.beforeOperation ?? []),
                    ],
                },
            }
        }),
    }
}
